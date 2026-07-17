#!/usr/bin/env python3
"""
IMAP-based MFA code retrieval for OnStarJS authentication.

When GM presents an email MFA challenge, this module connects to an IMAP
server and retrieves the 6-digit verification code that GM sends by email.

Configuration is read exclusively from environment variables (typically via a
.env file loaded before the auth script is invoked):

  Required:
    IMAP_SERVER          Hostname of the IMAP server (e.g. imap.gmail.com)
    IMAP_PASSWORD        Password (or app-password) for the IMAP account

  Optional (with defaults):
    IMAP_PORT            IMAP-over-SSL port              (default: 993)
    IMAP_USERNAME        IMAP login name                 (default: ONSTAR_USERNAME)
    IMAP_SUBJECT_PREFIX  Subject line prefix to match    (default: "Your GM Verification Code:")
    IMAP_SENDER          From address to match           (default: "GeneralMotors@em.gm.com")
    IMAP_MAILBOX         Mailbox/folder path             (default: "INBOX")

  Popular mailbox paths (set IMAP_MAILBOX if needed):
    Gmail / Google Workspace : INBOX
    Outlook / Hotmail / Live : INBOX
    Yahoo Mail               : Inbox
    Apple iCloud Mail        : INBOX
    FastMail                 : INBOX

Protocol:
  1. Connect to IMAP_SERVER:IMAP_PORT via SSL - bail immediately on failure.
  2. Search for emails from IMAP_SENDER with IMAP_SUBJECT_PREFIX received in
     the last 60 seconds.  If found, use the newest one.
  3. If no qualifying email exists yet, wait for one:
       • If the server supports IMAP IDLE, use it for real-time notification.
       • Otherwise, re-search every 10 seconds.
  4. Overall timeout is 5 minutes; if it expires the caller receives a
     RuntimeError advising the user to check their spam/junk folder.
  5. Once the email body is available, extract the first 6-digit number that
     appears inside an HTML tag pair and return it as a string.

Usage (async, from invisiblePlaywrightAuth.py):
    from imapMfa import get_mfa_code
    code = await get_mfa_code()   # returns e.g. "123456"

Usage (synchronous / standalone):
    from imapMfa import get_mfa_code_sync
    code = get_mfa_code_sync()

Standalone test:
    python imapMfa.py
"""

import asyncio
import email as _email_module
from email.utils import parsedate_to_datetime
import imaplib
import os
import re
import socket
import sys
import time
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_IMAP_PORT = 993
DEFAULT_SUBJECT_PREFIX = "Your GM Verification Code:"
DEFAULT_SENDER = "GeneralMotors@em.gm.com"
DEFAULT_MAILBOX = "INBOX"

OVERALL_TIMEOUT_SECONDS = 300  # 5 minutes
POLL_INTERVAL_SECONDS = 10
RECENT_EMAIL_WINDOW_SECONDS = 60  # consider emails from the last 60 s

# Matches a 6-digit number enclosed in HTML tags, e.g. <td>123456</td>
# or <span>123456</span>.  Allows optional surrounding whitespace.
_CODE_RE = re.compile(r"<[^>]+>\s*(\d{6})\s*</[^>]+>")


# ---------------------------------------------------------------------------
# Logging helpers
# ---------------------------------------------------------------------------


def _log(*parts):
    print(*parts, file=sys.stderr, flush=True)


def _progress(message: str):
    _log(f"[imapMfa] {message}")


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


def get_imap_config() -> dict:
    """
    Build the IMAP configuration dict from environment variables.

    Raises ValueError with a descriptive message if required vars are absent.
    """
    server = os.environ.get("IMAP_SERVER", "").strip()
    if not server:
        raise ValueError(
            "IMAP_SERVER is not set. "
            "Add it to your .env file (e.g. IMAP_SERVER=imap.gmail.com)."
        )

    try:
        port = int(os.environ.get("IMAP_PORT", str(DEFAULT_IMAP_PORT)))
    except ValueError:
        port = DEFAULT_IMAP_PORT

    # Username falls back to the OnStar login (same email address)
    username = os.environ.get(
        "IMAP_USERNAME",
        os.environ.get("ONSTAR_USERNAME", ""),
    ).strip()
    if not username:
        raise ValueError(
            "IMAP_USERNAME (or ONSTAR_USERNAME) is not set. "
            "Add IMAP_USERNAME to your .env file."
        )

    password = os.environ.get("IMAP_PASSWORD", "").strip()
    if not password:
        raise ValueError(
            "IMAP_PASSWORD is not set. "
            "Add it to your .env file. "
            "For Gmail, use an App Password (not your account password)."
        )

    subject_prefix = os.environ.get(
        "IMAP_SUBJECT_PREFIX", DEFAULT_SUBJECT_PREFIX
    )
    sender = os.environ.get("IMAP_SENDER", DEFAULT_SENDER)
    mailbox = os.environ.get("IMAP_MAILBOX", DEFAULT_MAILBOX)

    return {
        "server": server,
        "port": port,
        "username": username,
        "password": password,
        "subject_prefix": subject_prefix,
        "sender": sender,
        "mailbox": mailbox,
    }


# ---------------------------------------------------------------------------
# IMAP helpers
# ---------------------------------------------------------------------------


def _connect(config: dict) -> imaplib.IMAP4_SSL:
    """
    Open an SSL connection to the IMAP server and log in.

    Raises RuntimeError immediately on any failure so the caller can abort
    the auth flow early rather than waiting for a timeout.
    """
    _progress(
        f"Connecting to {config['server']}:{config['port']} as {config['username']}"
    )
    try:
        conn = imaplib.IMAP4_SSL(config["server"], config["port"])
    except OSError as exc:
        raise RuntimeError(
            f"Could not reach IMAP server {config['server']}:{config['port']}: {exc}. "
            "Verify IMAP_SERVER and IMAP_PORT in your .env file."
        ) from exc

    try:
        conn.login(config["username"], config["password"])
    except imaplib.IMAP4.error as exc:
        raise RuntimeError(
            f"IMAP login failed for {config['username']}: {exc}. "
            "Verify IMAP_USERNAME and IMAP_PASSWORD. "
            "For Gmail, enable IMAP and use an App Password."
        ) from exc

    _progress("IMAP connection established")
    return conn


def _check_idle_support(conn: imaplib.IMAP4_SSL) -> bool:
    """Return True if the server advertises IMAP IDLE capability."""
    try:
        # imaplib caches capabilities after LOGIN
        caps = getattr(conn, "capabilities", None)
        if caps:
            return b"IDLE" in caps or "IDLE" in caps
        typ, data = conn.capability()
        if typ == "OK" and data:
            cap_str = (
                data[0].decode("utf-8", errors="replace")
                if isinstance(data[0], bytes)
                else str(data[0])
            )
            return "IDLE" in cap_str.upper()
    except Exception:
        pass
    return False


def _search(conn: imaplib.IMAP4_SSL, config: dict, since_dt: datetime) -> list:
    """
    Search the mailbox for verification emails received since *since_dt*.

    Returns a list of message UIDs as byte strings, newest first.
    Returns an empty list if none are found.
    """
    conn.select(config["mailbox"], readonly=True)
    since_str = since_dt.strftime("%d-%b-%Y")  # IMAP date format
    criteria = (
        f'(FROM "{config["sender"]}" '
        f'SUBJECT "{config["subject_prefix"]}" '
        f"SINCE {since_str})"
    )
    try:
        typ, data = conn.uid("SEARCH", None, criteria)
    except imaplib.IMAP4.error as exc:
        _progress(f"IMAP SEARCH error: {exc}")
        return []

    if typ != "OK" or not data or not data[0]:
        return []

    uids = data[0].split()
    return list(reversed(uids))  # newest first


def _fetch_internaldate(
    conn: imaplib.IMAP4_SSL, uid: bytes
) -> datetime | None:
    """
    Fetch the server-side arrival time (INTERNALDATE) of a message by UID.

    Returns a timezone-aware datetime, or None if it cannot be determined.
    """
    try:
        typ, data = conn.uid("FETCH", uid, "(INTERNALDATE)")
        if typ != "OK" or not data or not data[0]:
            return None
        raw = (
            data[0].decode("utf-8", errors="replace")
            if isinstance(data[0], bytes)
            else str(data[0])
        )
        # Response: b'1 (UID 123 INTERNALDATE "17-Jul-2026 10:30:00 -0500")'
        m = re.search(r'INTERNALDATE\s+"([^"]+)"', raw, re.IGNORECASE)
        if not m:
            _progress(
                f"[DEBUG] Could not parse INTERNALDATE from FETCH response: {raw!r}"
            )
            return None
        date_str = m.group(1)
        dt = parsedate_to_datetime(date_str)
        return dt
    except Exception as exc:
        _progress(f"[DEBUG] Error fetching INTERNALDATE: {exc}")
        return None


def _fetch_body(conn: imaplib.IMAP4_SSL, uid: bytes) -> str:
    """Fetch the raw body of a message by UID and return it as a string."""
    try:
        typ, data = conn.uid("FETCH", uid, "(BODY[])")
    except imaplib.IMAP4.error as exc:
        _progress(f"IMAP FETCH error for UID {uid!r}: {exc}")
        return ""

    if (
        typ != "OK"
        or not data
        or not data[0]
        or not isinstance(data[0], tuple)
    ):
        return ""

    raw = data[0][1]
    if isinstance(raw, bytes):
        msg = _email_module.message_from_bytes(raw)
    else:
        msg = _email_module.message_from_string(str(raw))

    # Prefer HTML part so the regex finds the tag-wrapped code.
    html_body = None
    plain_body = None

    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            payload = part.get_payload(decode=True)
            if payload is None:
                continue
            text = payload.decode(
                part.get_content_charset("utf-8") or "utf-8", errors="replace"
            )
            if ct == "text/html" and html_body is None:
                html_body = text
            elif ct == "text/plain" and plain_body is None:
                plain_body = text
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            text = payload.decode(
                msg.get_content_charset("utf-8") or "utf-8", errors="replace"
            )
            if msg.get_content_type() == "text/html":
                html_body = text
            else:
                plain_body = text

    return html_body or plain_body or ""


def _extract_code(body: str) -> str | None:
    """
    Return the first 6-digit number found inside an HTML tag pair.

    E.g. ``<strong>123456</strong>`` → ``"123456"``
    Returns None if no match is found.
    """
    if not body:
        return None
    m = _CODE_RE.search(body)
    return m.group(1) if m else None


# ---------------------------------------------------------------------------
# IMAP IDLE implementation
# ---------------------------------------------------------------------------


def _idle_wait(conn: imaplib.IMAP4_SSL, timeout_secs: float) -> bool:
    """
    Enter IMAP IDLE and block until EXISTS/RECENT arrives or *timeout_secs*
    elapses.

    Handles the 29-second heartbeat requirement (RFC 2177 / common server
    practice) by sending DONE + re-IDLE automatically.

    Returns True if a new-mail notification was received, False on timeout.
    Uses only stdlib imaplib - no third-party dependencies required.
    """
    IDLE_TAG = b"XONSTARIDL"
    in_idle = False

    def _enter_idle() -> bool:
        nonlocal in_idle
        try:
            conn.send(IDLE_TAG + b" IDLE\r\n")
            line = conn.readline()
            in_idle = line.startswith(b"+ ")
            if not in_idle:
                _progress(f"IDLE: unexpected server response: {line!r}")
            return in_idle
        except Exception as exc:
            _progress(f"IDLE: error entering IDLE mode: {exc}")
            in_idle = False
            return False

    def _exit_idle():
        nonlocal in_idle
        if not in_idle:
            return
        try:
            conn.send(b"DONE\r\n")
            # Read until we consume the tagged response (starts with the IDLE_TAG)
            while True:
                line = conn.readline()
                if not line:
                    break
                # The tagged response will start with IDLE_TAG (e.g., "XONSTARIDL OK")
                if line.startswith(IDLE_TAG):
                    break
        except Exception:
            pass
        in_idle = False

    if not _enter_idle():
        return False

    deadline = time.monotonic() + timeout_secs
    got_new = False

    try:
        while time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            # RFC 2177: clients SHOULD re-issue IDLE at least every 29 minutes;
            # many servers drop idle connections after 30 s of no traffic.
            heartbeat = min(remaining, 29.0)
            if heartbeat <= 0:
                break

            try:
                conn.sock.settimeout(heartbeat)
                line = conn.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").upper()
                if "EXISTS" in decoded or "RECENT" in decoded:
                    got_new = True
                    break
            except socket.timeout:
                # Heartbeat: briefly exit and re-enter IDLE to reset timers.
                _exit_idle()
                if time.monotonic() >= deadline:
                    break
                if not _enter_idle():
                    break
            except Exception as exc:
                _progress(f"IDLE: read error: {exc}")
                break
    finally:
        _exit_idle()
        try:
            conn.sock.settimeout(None)
        except Exception:
            pass

    return got_new


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def get_mfa_code_sync(config: dict | None = None) -> str:
    """
    Blocking implementation.  Connects to IMAP, waits for the GM verification
    email, extracts the 6-digit code, and returns it as a string.

    Raises RuntimeError if the connection fails or the 5-minute timeout
    expires without finding a valid code.
    """
    if config is None:
        config = get_imap_config()

    start_time = time.monotonic()
    # Consider emails that arrived within the last minute (catch races where
    # GM sends the email before the IMAP wait loop starts).
    since_dt = datetime.now(timezone.utc) - timedelta(
        seconds=RECENT_EMAIL_WINDOW_SECONDS
    )

    # --- Connect (bail immediately on failure) ---
    conn = _connect(config)

    try:
        conn.select(config["mailbox"], readonly=True)
        idle_supported = _check_idle_support(conn)
        _progress(
            "IMAP IDLE is "
            + (
                "supported - will use real-time notification"
                if idle_supported
                else "not supported - will poll every 10 s"
            )
        )

        # --- Fast path: email already in inbox ---
        _progress(
            f"Searching {config['mailbox']} for messages from "
            f"'{config['sender']}' with subject prefix '{config['subject_prefix']}'"
        )
        uids = _search(conn, config, since_dt)
        if uids:
            _progress(f"Found {len(uids)} candidate email(s) - using newest")
            received = _fetch_internaldate(conn, uids[0])
            if received is not None:
                age_secs = (
                    datetime.now(timezone.utc) - received
                ).total_seconds()
                _progress(
                    f"Email received at {received.strftime('%Y-%m-%d %H:%M:%S %Z')} "
                    f"({int(age_secs)} s ago)"
                )
                if age_secs > RECENT_EMAIL_WINDOW_SECONDS:
                    _progress(
                        f"Rejecting email: received {int(age_secs)} s ago, "
                        f"which exceeds the {RECENT_EMAIL_WINDOW_SECONDS} s initial window"
                    )
                    uids = []
            if uids:
                body = _fetch_body(conn, uids[0])
                code = _extract_code(body)
                if code:
                    _progress(
                        f"Verification code extracted successfully: {code}"
                    )
                    return code
                _progress(
                    "Warning: email found but no 6-digit code in HTML tags; waiting for another"
                )

        # --- Wait path ---
        _progress(
            "Waiting for GM verification code email "
            f"(up to {OVERALL_TIMEOUT_SECONDS // 60} minutes)..."
        )
        _progress(
            "Tip: if nothing arrives, check your spam/junk folder and verify "
            "IMAP_SENDER / IMAP_SUBJECT_PREFIX match the actual email."
        )

        deadline = start_time + OVERALL_TIMEOUT_SECONDS

        while time.monotonic() < deadline:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break

            if idle_supported:
                # Wait up to 60 s in IDLE mode, then re-search regardless.
                _idle_wait(conn, min(remaining, 60.0))
            else:
                wait = min(remaining, float(POLL_INTERVAL_SECONDS))
                _progress(
                    f"Next check in {int(wait)} s "
                    f"({int(remaining)} s remaining)"
                )
                time.sleep(wait)

            if time.monotonic() >= deadline:
                break

            uids = _search(conn, config, since_dt)
            if uids:
                _progress(
                    f"Found {len(uids)} candidate email(s) - using newest"
                )
                received = _fetch_internaldate(conn, uids[0])
                if received is not None:
                    age_secs = (
                        datetime.now(timezone.utc) - received
                    ).total_seconds()
                    _progress(
                        f"Email received at {received.strftime('%Y-%m-%d %H:%M:%S %Z')} "
                        f"({int(age_secs)} s ago)"
                    )
                    if age_secs > RECENT_EMAIL_WINDOW_SECONDS:
                        _progress(
                            f"Rejecting email: received {int(age_secs)} s ago, "
                            f"which exceeds the {RECENT_EMAIL_WINDOW_SECONDS} s initial window"
                        )
                        uids = []
                if uids:
                    body = _fetch_body(conn, uids[0])
                    code = _extract_code(body)
                    if code:
                        _progress(
                            f"Verification code extracted successfully: {code}"
                        )
                        return code
                    _progress(
                        "Warning: email found but no 6-digit code in HTML tags; continuing to wait"
                    )

        raise RuntimeError(
            f"Timed out after {OVERALL_TIMEOUT_SECONDS // 60} minutes waiting for "
            "the GM verification code email. "
            "Please check your spam/junk folder. "
            "Also verify that IMAP_SERVER, IMAP_USERNAME, IMAP_PASSWORD, "
            "IMAP_SENDER, and IMAP_SUBJECT_PREFIX are correct in your .env file."
        )

    finally:
        try:
            conn.logout()
        except Exception:
            pass


async def get_mfa_code(config: dict | None = None) -> str:
    """
    Async wrapper around :func:`get_mfa_code_sync`.

    Runs the blocking IMAP work in a thread-pool executor so it does not
    stall the asyncio event loop used by ``invisiblePlaywrightAuth.py``.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, get_mfa_code_sync, config)


# ---------------------------------------------------------------------------
# Standalone test / smoke-test entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import dotenv  # type: ignore[import]  # pip install python-dotenv

    dotenv.load_dotenv()
    print("Testing IMAP MFA retrieval...", file=sys.stderr)
    try:
        code = get_mfa_code_sync()
        print(f"Code: {code}")
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
