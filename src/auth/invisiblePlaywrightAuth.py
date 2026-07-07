#!/usr/bin/env python3
"""
invisible_playwright-based authentication script for OnStarJS.

Uses a patched Firefox browser (fingerprint set at the C++ level, humanized
mouse/keyboard events) via the invisible_playwright library.  All anti-bot
evasion is handled internally by invisible_playwright; this script only
implements the GM/Microsoft auth flow.

Protocol: reads a JSON payload from stdin, writes a JSON result to stdout.
Progress/debug messages go to stderr.
"""

import asyncio
import json
import os
import re
import sys
import traceback

AUTH_REDIRECT_PREFIX = "msauth.com.gm.mychevrolet://auth"

# Injected into every page before its own scripts run.  Overrides the
# Location.href setter (and .assign/.replace) so that any attempt to
# navigate to the custom auth scheme is captured in a page-global variable
# that we can poll via page.evaluate().  This is needed because
# Playwright/Firefox does NOT emit request/framenavigated events for
# custom-scheme navigations initiated from JavaScript.
_LOCATION_INTERCEPTOR_JS = """
(function () {
    var PREFIX = 'msauth.com.gm.mychevrolet://';
    function capture(url) {
        try {
            var s = String(url || '');
            if (s.toLowerCase().startsWith(PREFIX)) {
                window['__onstarjs_auth_url__'] = s;
            }
        } catch (e) {}
    }
    try {
        var desc = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
        if (desc && desc.set) {
            Object.defineProperty(Location.prototype, 'href', {
                set: function (v) { capture(v); desc.set.call(this, v); },
                get: desc.get,
                configurable: true,
                enumerable: desc.enumerable,
            });
        }
    } catch (e) {}
    try {
        var origAssign = window.location.assign.bind(window.location);
        window.location.assign = function (url) { capture(url); return origAssign(url); };
    } catch (e) {}
    try {
        var origReplace = window.location.replace.bind(window.location);
        window.location.replace = function (url) { capture(url); return origReplace(url); };
    } catch (e) {}
})();
"""

EMAIL_SELECTOR = (
    'input[type="email"], input[name="logonIdentifier"], '
    "input#logonIdentifier"
)
CONTINUE_SELECTOR = (
    '#continue[data-dtm="sign in"], '
    'button[data-dtm="sign in"], '
    'button[aria-label="Continue"]'
)
PASSWORD_SELECTOR = 'input[type="password"], input[name="password"]'
SUBMIT_SELECTOR = (
    '#continue[aria-label="Sign in"], '
    'button[aria-label="Sign in"], '
    'button[aria-label="Log In"], '
    'input[type="submit"]'
)
MFA_OTP_SELECTOR = 'input[name="otpCode"]'
MFA_SUBMIT_SELECTOR = (
    'button[aria-label*="Submit"], '
    'button[aria-label*="Verify"], '
    "#continue"
)


def log(*parts):
    print(*parts, file=sys.stderr, flush=True)


def progress(message):
    log(f"[invisible_playwright] {message}")


def extract_auth_code(url):
    match = re.search(r"[?&]code=([^&]*)", url or "")
    return match.group(1) if match else None


def is_auth_redirect_url(url):
    return str(url or "").lower().startswith(AUTH_REDIRECT_PREFIX)


def is_access_denied_html(body):
    body_text = body or ""
    return (
        "<TITLE>Access Denied</TITLE>" in body_text
        or "<H1>Access Denied</H1>" in body_text
        or "errors.edgesuite.net" in body_text
    )


async def main():
    payload = json.loads(sys.stdin.read())
    state = {
        "auth_code": None,
        "access_denied": False,
    }
    auth_event = asyncio.Event()
    phase = "initializing"

    try:
        from invisible_playwright.async_api import InvisiblePlaywright
    except ImportError as exc:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": (
                        "invisible_playwright is not installed. "
                        "Run 'pnpm run setup:invisible_playwright'."
                    ),
                    "detail": str(exc),
                }
            )
        )
        sys.exit(0)

    pyotp = None
    try:
        import pyotp as _pyotp

        pyotp = _pyotp
    except ImportError:
        pass

    try:
        phase = "starting browser"
        progress("Starting invisible_playwright Firefox browser")

        profile_dir = payload.get("profilePath") or None
        if profile_dir:
            progress(f"Using persistent browser profile: {profile_dir}")

        async with InvisiblePlaywright(
            profile_dir=profile_dir, headless=True
        ) as ctx_or_browser:
            page = await ctx_or_browser.new_page()

            # Inject URL interceptor so JS-initiated custom-scheme navigations
            # (window.location.href = "msauth://...") are captured even though
            # Playwright/Firefox does not emit network events for them.
            await page.add_init_script(_LOCATION_INTERCEPTOR_JS)

            # --- URL capture helpers ---

            def capture_url(url, source=""):
                if not url:
                    return
                url_str = str(url)
                if is_auth_redirect_url(url_str):
                    code = extract_auth_code(url_str)
                    if code and not state["auth_code"]:
                        state["auth_code"] = code
                        progress(f"Captured auth code via {source}")
                        auth_event.set()

            async def poll_js_url():
                """Check whether the page's JS interceptor caught a URL."""
                try:
                    captured = await page.evaluate(
                        "window.__onstarjs_auth_url__ || null"
                    )
                    if captured:
                        capture_url(captured, "js-interceptor")
                except Exception:
                    pass

            async def wait_for_auth(timeout=60.0):
                """Wait for auth_event, polling the JS variable every 250 ms."""
                deadline = asyncio.get_event_loop().time() + timeout
                while asyncio.get_event_loop().time() < deadline:
                    if auth_event.is_set():
                        return True
                    await poll_js_url()
                    if auth_event.is_set():
                        return True
                    await asyncio.sleep(0.25)
                await poll_js_url()
                return auth_event.is_set()

            async def wait_for_auth_or_mfa(timeout=30.0):
                """Poll every 250 ms for auth redirect OR MFA/OTP field.
                Returns 'auth_code', 'mfa', or 'timeout'.
                """
                deadline = asyncio.get_event_loop().time() + timeout
                while asyncio.get_event_loop().time() < deadline:
                    if auth_event.is_set():
                        return "auth_code"
                    await poll_js_url()
                    if auth_event.is_set():
                        return "auth_code"
                    try:
                        if await page.is_visible(MFA_OTP_SELECTOR):
                            return "mfa"
                    except Exception:
                        pass
                    await asyncio.sleep(0.25)
                await poll_js_url()
                return "auth_code" if auth_event.is_set() else "timeout"

            def on_request(request):
                capture_url(request.url, "request")

            def on_requestfailed(request):
                capture_url(request.url, "requestfailed")

            def on_framenavigated(frame):
                capture_url(frame.url, "framenavigated")

            async def on_response(response):
                try:
                    location = response.headers.get("location", "")
                    if location:
                        capture_url(location, "response-location")
                    # Detect access-denied responses
                    status = response.status
                    if (
                        status in (401, 403)
                        or "selfasserted" in response.url.lower()
                    ):
                        try:
                            body = await response.text()
                            if is_access_denied_html(body):
                                state["access_denied"] = True
                                progress("Access Denied response detected")
                        except Exception:
                            pass
                except Exception:
                    pass

            page.on("request", on_request)
            page.on("requestfailed", on_requestfailed)
            page.on("framenavigated", on_framenavigated)
            page.on("response", on_response)

            # --- Diagnostic / simulation shortcuts ---

            if payload.get("simulateNavigationAuthCode"):
                state["auth_code"] = payload["simulateNavigationAuthCode"]
                auth_event.set()

            if payload.get("diagnosticOnly"):
                phase = "diagnostic navigation"
                progress("Performing diagnostic browser navigation")
                try:
                    await page.goto(
                        payload["authorizationUrl"],
                        wait_until="domcontentloaded",
                        timeout=60000,
                    )
                except Exception:
                    pass
                title = await page.title()
                print(
                    json.dumps(
                        {
                            "ok": True,
                            "diagnosticOnly": True,
                            "finalUrl": page.url,
                            "finalTitle": title,
                        }
                    )
                )
                return

            # --- Navigate to authorization URL ---

            phase = "navigating to authorization URL"
            progress("Navigating to authorization URL")
            try:
                await page.goto(
                    payload["authorizationUrl"],
                    wait_until="domcontentloaded",
                    timeout=60000,
                )
            except Exception as nav_exc:
                # A custom-scheme redirect may raise before we finish loading;
                # that is expected if the auth code was already captured.
                if not state["auth_code"]:
                    progress(
                        f"Initial navigation raised (may be normal): {repr(nav_exc)}"
                    )

            if auth_event.is_set():
                title = await page.title()
                print(
                    json.dumps(
                        {
                            "ok": True,
                            "authCode": state["auth_code"],
                            "finalUrl": page.url,
                            "finalTitle": title,
                            "accessDenied": state["access_denied"],
                        }
                    )
                )
                return

            # --- Email step ---

            phase = "entering email"
            progress("Waiting for email input field")
            email_field = await page.wait_for_selector(
                EMAIL_SELECTOR, timeout=60000, state="visible"
            )
            progress("Filling email address")
            await email_field.fill(payload["username"])

            phase = "clicking continue"
            progress("Looking for Continue button")
            try:
                continue_btn = await page.wait_for_selector(
                    CONTINUE_SELECTOR, timeout=10000, state="visible"
                )
                await continue_btn.click()
            except Exception:
                progress(
                    "Continue button not found by selector; pressing Enter"
                )
                await email_field.press("Enter")
            await poll_js_url()

            if auth_event.is_set():
                title = await page.title()
                print(
                    json.dumps(
                        {
                            "ok": True,
                            "authCode": state["auth_code"],
                            "finalUrl": page.url,
                            "finalTitle": title,
                            "accessDenied": state["access_denied"],
                        }
                    )
                )
                return

            # --- Password step ---

            phase = "entering password"
            progress("Waiting for password input field")
            password_field = await page.wait_for_selector(
                PASSWORD_SELECTOR, timeout=30000, state="visible"
            )
            progress("Filling password")
            await password_field.fill(payload["password"])

            phase = "submitting credentials"
            progress("Looking for Sign In button")
            try:
                submit_btn = await page.wait_for_selector(
                    SUBMIT_SELECTOR, timeout=10000, state="visible"
                )
                await submit_btn.click()
            except Exception:
                progress(
                    "Sign In button not found by selector; pressing Enter"
                )
                await password_field.press("Enter")
            await poll_js_url()

            # --- Wait for auth redirect or MFA ---

            phase = "waiting for auth redirect or MFA"
            progress("Waiting for authorization redirect or MFA challenge")
            post_login_state = await wait_for_auth_or_mfa(timeout=30.0)

            if post_login_state == "mfa":
                phase = "handling MFA"
                progress("TOTP MFA challenge detected")
                if pyotp is None:
                    raise RuntimeError(
                        "pyotp is required for TOTP MFA. "
                        "Run 'pnpm run setup:invisible_playwright' or 'pip install pyotp'."
                    )
                totp_secret = payload.get("totpKey", "").strip()
                if "secret=" in totp_secret:
                    secret_match = re.search(r"secret=([^&]+)", totp_secret)
                    if secret_match:
                        totp_secret = secret_match.group(1)
                if len(totp_secret) != 16:
                    raise ValueError(
                        "Provided TOTP key does not meet the expected length. "
                        "Key should be 16 alphanumeric characters."
                    )
                totp_code = pyotp.TOTP(totp_secret).now()
                progress("Entering TOTP verification code")
                otp_field = await page.wait_for_selector(
                    MFA_OTP_SELECTOR, timeout=10000, state="visible"
                )
                await otp_field.fill(totp_code)
                try:
                    mfa_btn = await page.wait_for_selector(
                        MFA_SUBMIT_SELECTOR, timeout=5000, state="visible"
                    )
                    await mfa_btn.click()
                except Exception:
                    progress("MFA submit button not found; pressing Enter")
                    await otp_field.press("Enter")
                phase = "waiting for auth redirect after MFA"
                progress("Waiting for authorization redirect after MFA")
                await wait_for_auth(timeout=60.0)

            elif post_login_state == "timeout" and not auth_event.is_set():
                # Check for unsupported MFA types presented instead of TOTP
                try:
                    page_html = await page.content()
                    if "emailMfa" in page_html:
                        raise RuntimeError(
                            "Only TOTP via Third-Party Authenticator is supported; "
                            "email MFA was presented."
                        )
                    if "strongAuthenticationPhoneNumber" in page_html:
                        raise RuntimeError(
                            "Only TOTP via Third-Party Authenticator is supported; "
                            "SMS MFA was presented."
                        )
                except RuntimeError:
                    raise
                except Exception:
                    pass

            # --- Final access denied check ---

            try:
                page_content = await page.content()
                if is_access_denied_html(page_content):
                    state["access_denied"] = True
                    progress("Access Denied page detected")
            except Exception:
                pass

            title = await page.title()
            if "Access Denied" in str(title):
                state["access_denied"] = True

            final_url = page.url
            final_title = title

            if state["access_denied"] and not state["auth_code"]:
                print(
                    json.dumps(
                        {
                            "ok": False,
                            "error": (
                                "Access Denied: Authentication was blocked. "
                                "This may be due to rate limiting or IP blocking. "
                                "Please wait before retrying."
                            ),
                            "phase": phase,
                            "finalUrl": final_url,
                            "finalTitle": final_title,
                            "accessDenied": True,
                        }
                    )
                )
                return

            if not state["auth_code"]:
                print(
                    json.dumps(
                        {
                            "ok": False,
                            "error": (
                                "Authentication completed without capturing "
                                "an authorization code."
                            ),
                            "detail": (
                                f"Final page title: {final_title}. "
                                f"Final URL: {final_url}"
                            ),
                            "phase": phase,
                            "finalUrl": final_url,
                            "finalTitle": final_title,
                            "accessDenied": state["access_denied"],
                        }
                    )
                )
                return

            print(
                json.dumps(
                    {
                        "ok": True,
                        "authCode": state["auth_code"],
                        "finalUrl": final_url,
                        "finalTitle": final_title,
                        "accessDenied": state["access_denied"],
                    }
                )
            )

    except Exception as exc:
        traceback_text = traceback.format_exc()
        progress(f"Failure during phase: {phase}")
        progress(f"Exception: {repr(exc)}")
        log(traceback_text)
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc)
                    or f"Authentication failed during {phase}",
                    "detail": repr(exc),
                    "type": exc.__class__.__name__,
                    "phase": phase,
                    "traceback": traceback_text,
                    "accessDenied": state.get("access_denied", False),
                }
            )
        )


asyncio.run(main())
