import asyncio
import base64
import json
import os
import random
import re
import signal
import shutil
import subprocess
import sys
import time
import traceback
from dataclasses import asdict, is_dataclass

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

try:
    import zendriver as zd
    from zendriver import cdp
except Exception as exc:
    error_message = (
        "Zendriver is not installed for this Python interpreter. Run "
        "'pnpm run setup:zendriver' or "
        "'python -m pip install zendriver browserforge[all] pyotp'."
    )
    print(
        json.dumps(
            {
                "ok": False,
                "error": error_message,
                "detail": str(exc),
            }
        )
    )
    sys.exit(0)

try:
    from browserforge.fingerprints import FingerprintGenerator
except Exception as exc:
    error_message = (
        "BrowserForge is not installed for this Python interpreter. Run "
        "'pnpm run setup:zendriver' or "
        "'python -m pip install browserforge[all]'."
    )
    print(
        json.dumps(
            {
                "ok": False,
                "error": error_message,
                "detail": str(exc),
            }
        )
    )
    sys.exit(0)

AUTH_REDIRECT_PREFIX = "msauth.com.gm.mychevrolet://auth"
EMAIL_SELECTOR = (
    'input[type="email"], input[name="logonIdentifier"], '
    'input#logonIdentifier, [aria-label*="Email" i], '
    '[placeholder*="Email" i]'
)
CONTINUE_SELECTOR = (
    'button#continue[data-dtm="sign in"][aria-label="Continue"], '
    'button[data-dtm="sign in"], '
    '[role="button"][aria-label*="Continue" i]'
)
PASSWORD_SELECTOR = (
    'input[type="password"], input[name="password"], '
    '[aria-label*="Password" i], [placeholder*="Password" i]'
)
SUBMIT_SELECTOR = (
    'button#continue[data-dtm="sign in"][aria-label="Sign in"], '
    '[role="button"][aria-label*="Sign in" i], '
    '[role="button"][aria-label*="Log In" i], '
    'input[type="submit"][value*="Sign" i], '
    'input[type="submit"][value*="Log" i]'
)
MFA_SELECTOR = (
    'input[name="otpCode"], input[name="emailMfa"], '
    'input[name="strongAuthenticationPhoneNumber"]'
)
OTP_SELECTOR = (
    'input[name="otpCode"], [aria-label*="One-Time Passcode" i], '
    '[aria-label*="OTP" i]'
)
MFA_SUBMIT_SELECTOR = (
    'button#continue[aria-label*="Submit" i], '
    'button#continue[aria-label*="Verify" i], '
    '[role="button"][aria-label*="Submit" i], '
    '[role="button"][aria-label*="Verify" i], '
    'input[type="submit"][value*="Submit" i], '
    'input[type="submit"][value*="Verify" i]'
)


def log(*parts):
    print(*parts, file=sys.stderr, flush=True)


def progress(message):
    log(f"[zendriver] {message}")


def progress_json(label, value):
    progress(f"{label}: {json.dumps(value, default=str)}")


def sanitize_url(url):
    value = str(url or "")
    if "?" in value:
        return value.split("?", 1)[0] + "?[redacted]"
    return value


def extract_auth_code(url):
    match = re.search(r"[?&]code=([^&]*)", url or "")
    return match.group(1) if match else None


def is_auth_redirect_url(url):
    return str(url or "").lower().startswith(AUTH_REDIRECT_PREFIX)


def capture_auth_redirect(state, url, source):
    if not is_auth_redirect_url(url):
        return False
    code = extract_auth_code(str(url))
    if not code:
        progress_json(
            "Observed auth redirect without code",
            {"source": source, "url": str(url)},
        )
        return False
    if not state.get("auth_code"):
        progress_json(
            "Captured auth code from redirect",
            {"source": source},
        )
    state["auth_code"] = code
    return True


def is_access_denied_html(body):
    body_text = body or ""
    return (
        "<TITLE>Access Denied</TITLE>" in body_text
        or "<H1>Access Denied</H1>" in body_text
        or "errors.edgesuite.net" in body_text
    )


def serialize_fingerprint(value):
    if is_dataclass(value):
        return asdict(value)
    if hasattr(value, "__dict__"):
        return vars(value)
    return value


def get_nested(source, *keys):
    value = source
    for key in keys:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def parse_accept_language(headers, navigator):
    accept_language = headers.get("Accept-Language") or "en-US,en;q=0.9"
    language = navigator.get("language") or "en-US"
    return accept_language, language


def build_mobile_fingerprint_script(fingerprint):
    navigator_values = {
        "userAgent": fingerprint["userAgent"],
        "platform": fingerprint["platform"],
        "language": fingerprint["language"],
        "languages": [fingerprint["language"]],
        "maxTouchPoints": fingerprint["maxTouchPoints"],
        "webdriver": False,
    }
    for key in ("hardwareConcurrency", "deviceMemory", "vendor"):
        value = fingerprint["navigator"].get(key)
        if value is not None:
            navigator_values[key] = value

    return f"""
(() => {{
    const values = {json.dumps(navigator_values)};
    for (const [key, value] of Object.entries(values)) {{
        try {{
            Object.defineProperty(Navigator.prototype, key, {{
                get: () => value,
                configurable: true,
            }});
        }} catch (_) {{}}
    }}
}})();
"""


def generate_mobile_fingerprint():
    fingerprint = FingerprintGenerator(
        browser="chrome",
        os="android",
        device="mobile",
        locale="en-US",
    ).generate()
    data = serialize_fingerprint(fingerprint)
    headers = data.get("headers") or {}
    navigator = data.get("navigator") or {}
    screen = data.get("screen") or {}
    accept_language, language = parse_accept_language(headers, navigator)
    user_agent = headers.get("User-Agent") or navigator.get("userAgent")
    if not user_agent:
        raise RuntimeError("BrowserForge did not generate a user agent")

    width = int(screen.get("width") or screen.get("availWidth") or 390)
    height = int(screen.get("height") or screen.get("availHeight") or 844)
    device_scale_factor = float(screen.get("devicePixelRatio") or 2)
    max_touch_points = int(navigator.get("maxTouchPoints") or 1)
    platform = navigator.get("platform") or "Linux armv8l"

    return {
        "userAgent": user_agent,
        "acceptLanguage": accept_language,
        "language": language,
        "platform": platform,
        "screen": {
            "width": width,
            "height": height,
            "deviceScaleFactor": device_scale_factor,
            "colorDepth": screen.get("colorDepth"),
        },
        "maxTouchPoints": max_touch_points,
        "headers": headers,
        "navigator": {
            "hardwareConcurrency": navigator.get("hardwareConcurrency"),
            "deviceMemory": navigator.get("deviceMemory"),
            "vendor": navigator.get("vendor"),
            "platform": platform,
        },
    }


async def apply_mobile_fingerprint(tab, fingerprint):
    screen = fingerprint["screen"]
    progress_json(
        "Applying BrowserForge mobile fingerprint",
        {
            "userAgent": fingerprint["userAgent"],
            "platform": fingerprint["platform"],
            "acceptLanguage": fingerprint["acceptLanguage"],
            "screen": screen,
            "maxTouchPoints": fingerprint["maxTouchPoints"],
        },
    )
    await tab.send(cdp.page.enable())
    await tab.send(
        cdp.page.add_script_to_evaluate_on_new_document(
            build_mobile_fingerprint_script(fingerprint),
        )
    )
    await tab.set_user_agent(
        fingerprint["userAgent"],
        accept_language=fingerprint["acceptLanguage"],
        platform=fingerprint["platform"],
    )
    await tab.send(cdp.emulation.set_locale_override(fingerprint["language"]))
    await tab.send(
        cdp.emulation.set_touch_emulation_enabled(
            enabled=True,
            max_touch_points=fingerprint["maxTouchPoints"],
        )
    )
    await tab.send(
        cdp.emulation.set_device_metrics_override(
            width=screen["width"],
            height=screen["height"],
            device_scale_factor=screen["deviceScaleFactor"],
            mobile=True,
            screen_width=screen["width"],
            screen_height=screen["height"],
        )
    )


async def sleep_ms(ms):
    await asyncio.sleep(ms / 1000)


async def wait_for_auth_code(state, timeout_ms=10000, interval_ms=500):
    start = time.monotonic()
    while (time.monotonic() - start) * 1000 < timeout_ms:
        if state.get("auth_code"):
            return True
        await sleep_ms(interval_ms)
    return False


async def detect_access_denied_page(tab):
    try:
        title = await maybe_value(await tab.evaluate("document.title"))
        if "Access Denied" in str(title):
            return True
        page_html_result = await tab.evaluate(
            "document.documentElement.outerHTML"
        )
        page_html = (await maybe_value(page_html_result)) or ""
        return is_access_denied_html(page_html)
    except Exception:
        return False


async def wait_for_auth_code_or_access_denied(
    tab,
    state,
    timeout_ms=60000,
    interval_ms=500,
):
    start = time.monotonic()
    while (time.monotonic() - start) * 1000 < timeout_ms:
        await capture_current_tab_redirect(tab, state, "post-MFA poll")
        if state.get("auth_code"):
            return "auth_code"
        if state.get("access_denied"):
            return "access_denied"
        if await detect_access_denied_page(tab):
            state["access_denied"] = True
            progress("Access Denied page detected after MFA submit")
            return "access_denied"
        await sleep_ms(interval_ms)
    return "timeout"


async def wait_for_auth_code_or_mfa(
    tab,
    state,
    timeout_ms=15000,
    interval_ms=250,
):
    start = time.monotonic()
    while (time.monotonic() - start) * 1000 < timeout_ms:
        await capture_current_tab_redirect(tab, state, "poll")
        if state.get("auth_code"):
            return "auth_code"
        if state.get("access_denied"):
            return "access_denied"
        has_mfa_field = await element_count(tab, MFA_SELECTOR) > 0
        has_otp_field = await element_count(tab, OTP_SELECTOR) > 0
        if has_mfa_field or has_otp_field:
            return "mfa"
        try:
            title = await maybe_value(await tab.evaluate("document.title"))
            if "verify" in str(title).lower():
                return "mfa"
        except Exception:
            pass
        await sleep_ms(interval_ms)
    return "timeout"


async def capture_current_tab_redirect(tab, state, source):
    current_url = getattr(tab, "url", "")
    if capture_auth_redirect(state, current_url, source):
        return True
    try:
        location_href = await maybe_value(
            await tab.evaluate("window.location.href"),
        )
        return capture_auth_redirect(state, location_href, source)
    except Exception:
        return False


async def select_first(tab, selector, timeout=60):
    deadline = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < deadline:
        try:
            elements = await tab.select_all(selector, timeout=1)
            for element in elements or []:
                state = await get_element_state(element)
                if is_element_interactable(state):
                    return element
            if elements:
                last_error = RuntimeError(
                    f"Matched {len(elements)} hidden/non-interactable "
                    "element(s)"
                )
        except Exception as exc:
            last_error = exc
        await sleep_ms(250)
    raise TimeoutError(
        f"Timed out waiting for selector: {selector}. Last error: {last_error}"
    )


async def select_optional(tab, selector):
    try:
        return await select_first(tab, selector, timeout=1)
    except Exception:
        return None


async def element_count(tab, selector):
    try:
        elements = await tab.select_all(selector, timeout=1)
        return len(elements or [])
    except Exception:
        return 0


async def type_human(
    element,
    text,
    min_delay=40,
    max_delay=150,
    pause_chance=0.08,
):
    for char in text:
        await element.send_keys(char)
        await sleep_ms(random.uniform(min_delay, max_delay))
        if random.random() < pause_chance:
            await sleep_ms(random.uniform(150, 700))


async def focus_human(element):
    try:
        await element.apply(
            """
            (element) => {
                element.scrollIntoView({block: 'center', inline: 'center'});
                element.focus();
            }
            """,
            await_promise=True,
        )
        await sleep_ms(random.uniform(250, 600))
    except Exception:
        await element.focus()
        await sleep_ms(random.uniform(250, 600))


async def clear_field(element):
    try:
        await element.clear_input()
    except Exception:
        await element.apply(
            """
            (element) => {
                const setter = Object.getOwnPropertyDescriptor(
                    HTMLInputElement.prototype,
                    'value'
                ).set;
                setter.call(element, '');
                element.dispatchEvent(new Event('input', {bubbles: true}));
                element.dispatchEvent(new Event('change', {bubbles: true}));
            }
            """,
            await_promise=True,
        )


async def set_field_value(element, value):
    await element.apply(
        f"""
        (element) => {{
            const value = {json.dumps(value)};
            const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype,
                'value'
            ).set;
            setter.call(element, value);
            element.dispatchEvent(new Event('input', {{bubbles: true}}));
            element.dispatchEvent(new Event('change', {{bubbles: true}}));
        }}
        """,
        await_promise=True,
    )


async def get_field_value(element):
    value = await element.apply("(element) => element.value")
    return "" if value is None else str(value)


async def wait_for_network_quiet(
    network_state,
    quiet_ms=5000,
    timeout_ms=30000,
    interval_ms=100,
):
    def pending_request_summaries():
        now = time.monotonic()
        summaries = []
        for request in network_state.get("pending", {}).values():
            summary = dict(request)
            started_at = summary.pop("startedAt", now)
            summary["ageMs"] = int((now - started_at) * 1000)
            summaries.append(summary)
        return summaries[-10:]

    def actionable_pending_requests():
        requests = pending_request_summaries()
        return [
            request
            for request in requests
            if not (
                str(request.get("url", "")).startswith("blob:")
                and request.get("type") == "ResourceType.SCRIPT"
            )
        ]

    start = time.monotonic()
    while (time.monotonic() - start) * 1000 < timeout_ms:
        quiet_for_ms = (
            time.monotonic() - network_state.get("last_activity", start)
        ) * 1000
        if quiet_for_ms >= quiet_ms:
            pending_requests = actionable_pending_requests()
            if pending_requests:
                progress_json(
                    "Network activity quiet with pending requests",
                    {
                        "pendingCount": len(pending_requests),
                        "quietForMs": int(quiet_for_ms),
                        "pendingRequests": pending_requests,
                    },
                )
            return True
        await sleep_ms(interval_ms)

    progress_json(
        "Network did not quiesce before input readiness check",
        {
            "pendingCount": len(actionable_pending_requests()),
            "pendingRequests": actionable_pending_requests(),
            "quietForMs": int(
                (time.monotonic() - network_state.get("last_activity", start))
                * 1000
            ),
        },
    )
    return False


async def wait_for_input_ready(
    element,
    interval_ms=150,
    log_interval_ms=10000,
):
    probe_value = "onstarjs-input-probe"
    start = time.monotonic()
    last_log = start
    last_state = None
    while True:
        try:
            last_state = await element.apply(
                f"""
                (element) => {{
                    const probeValue = {json.dumps(probe_value)};
                    const descriptor = Object.getOwnPropertyDescriptor(
                        HTMLInputElement.prototype,
                        'value'
                    );
                    const setValue = (nextValue) => {{
                        descriptor.set.call(element, nextValue);
                    }};
                    const originalValue = element.value || '';
                    const state = {{
                    connected: Boolean(element.isConnected),
                    disabled: Boolean(element.disabled),
                    readOnly: Boolean(element.readOnly),
                    visible: Boolean(
                        element.offsetWidth ||
                        element.offsetHeight ||
                        element.getClientRects().length
                    ),
                        focusedBeforeProbe: document.activeElement === element,
                        focusable: false,
                        writable: false,
                        probeValueLength: 0,
                    }};
                    if (
                        state.connected &&
                        !state.disabled &&
                        !state.readOnly &&
                        descriptor &&
                        descriptor.set
                    ) {{
                        try {{
                            element.focus();
                            state.focusable =
                                document.activeElement === element;
                            setValue(probeValue);
                            element.dispatchEvent(new InputEvent('input', {{
                                bubbles: true,
                                inputType: 'insertText',
                                data: probeValue,
                            }}));
                            state.probeValueLength = element.value.length;
                            state.writable = element.value === probeValue;
                            setValue(originalValue);
                            element.dispatchEvent(new InputEvent('input', {{
                                bubbles: true,
                                inputType: 'deleteContentBackward',
                                data: null,
                            }}));
                            element.dispatchEvent(new Event('change', {{
                                bubbles: true,
                            }}));
                        }} catch (error) {{
                            state.probeError = String(error);
                            try {{ setValue(originalValue); }} catch (_) {{}}
                        }}
                    }}
                    state.focused = document.activeElement === element;
                    return state;
                }}
                """,
                await_promise=True,
            )
            if (
                last_state
                and last_state.get("connected")
                and not last_state.get("disabled")
                and not last_state.get("readOnly")
                and last_state.get("writable")
            ):
                return last_state
        except Exception as exc:
            last_state = {"error": repr(exc)}
        now = time.monotonic()
        if (now - last_log) * 1000 >= log_interval_ms:
            progress_json(
                "Input not ready yet; continuing to wait",
                {
                    "waitedMs": int((now - start) * 1000),
                    "state": last_state,
                },
            )
            last_log = now
        await sleep_ms(interval_ms)


async def get_input_state(element):
    try:
        return await element.apply(
            """
            (element) => ({
                connected: Boolean(element.isConnected),
                disabled: Boolean(element.disabled),
                readOnly: Boolean(element.readOnly),
                visible: Boolean(
                    element.offsetWidth ||
                    element.offsetHeight ||
                    element.getClientRects().length
                ),
                focused: document.activeElement === element,
                tagName: element.tagName,
                type: element.type,
                name: element.name,
                id: element.id,
                ariaLabel: element.getAttribute('aria-label'),
                valueLength: element.value ? element.value.length : 0,
            })
            """,
            await_promise=True,
        )
    except Exception as exc:
        return {"error": repr(exc)}


async def get_element_state(element):
    try:
        return await element.apply(
            """
            (element) => {
                const style = window.getComputedStyle(element);
                const rects = element.getClientRects();
                const rect = rects.length ? rects[0] : null;
                return {
                    connected: Boolean(element.isConnected),
                    disabled: Boolean(element.disabled),
                    hidden: Boolean(element.hidden),
                    ariaHidden: element.getAttribute('aria-hidden'),
                    visible: Boolean(
                        rects.length &&
                        style.visibility !== 'hidden' &&
                        style.display !== 'none' &&
                        Number(style.opacity || 1) > 0
                    ),
                    width: rect ? rect.width : 0,
                    height: rect ? rect.height : 0,
                    tagName: element.tagName,
                    type: element.type,
                    name: element.name,
                    id: element.id,
                    ariaLabel: element.getAttribute('aria-label'),
                    text: (element.innerText || element.value || '')
                        .replace(/\\s+/g, ' ')
                        .trim()
                        .slice(0, 120),
                };
            }
            """,
            await_promise=True,
        )
    except Exception as exc:
        return {"error": repr(exc)}


def is_element_interactable(state):
    return bool(
        state
        and state.get("connected")
        and not state.get("disabled")
        and not state.get("hidden")
        and state.get("ariaHidden") != "true"
        and state.get("visible")
        and state.get("width", 0) > 0
        and state.get("height", 0) > 0
    )


async def fill_text_field(
    element,
    value,
    network_state=None,
    min_delay=40,
    max_delay=150,
    pause_chance=0.08,
):
    if network_state is not None:
        await wait_for_network_quiet(network_state)
    await focus_human(element)
    await wait_for_input_ready(element)
    await clear_field(element)
    await sleep_ms(random.uniform(200, 500))
    await element.send_keys(value)
    await sleep_ms(random.uniform(250, 600))

    actual_value = await get_field_value(element)
    if actual_value != value:
        progress_json(
            "Native send_keys value did not match field value; retrying",
            {
                "expectedLength": len(value),
                "actualLength": len(actual_value),
                "input": await get_input_state(element),
            },
        )
        await focus_human(element)
        await clear_field(element)
        await sleep_ms(random.uniform(150, 350))
        await element.send_keys(value)
        await sleep_ms(random.uniform(150, 350))
        repaired_value = await get_field_value(element)
        if repaired_value != value:
            progress_json(
                "Native send_keys retry still mismatched; "
                "using value fallback",
                {
                    "expectedLength": len(value),
                    "actualLength": len(repaired_value),
                    "input": await get_input_state(element),
                },
            )
            await set_field_value(element, value)
            await sleep_ms(random.uniform(150, 350))
            fallback_value = await get_field_value(element)
            if fallback_value != value:
                raise RuntimeError(
                    "Input field value still mismatched after value fallback: "
                    f"expectedLength={len(value)}, "
                    f"actualLength={len(fallback_value)}, "
                    f"input={await get_input_state(element)}"
                )


async def save_error_screenshot(tab, phase):
    if tab is None:
        return None
    try:
        screenshots_dir = os.path.abspath("zendriver-error-screenshots")
        os.makedirs(screenshots_dir, exist_ok=True)
        safe_phase = re.sub(r"[^a-zA-Z0-9_.-]+", "-", phase).strip("-")
        timestamp = time.strftime("%Y%m%d-%H%M%S")
        screenshot_path = os.path.join(
            screenshots_dir,
            f"zendriver-error-{timestamp}-{safe_phase or 'unknown'}.jpg",
        )
        await tab.save_screenshot(
            filename=screenshot_path,
            format="jpeg",
            full_page=True,
        )
        progress_json("Saved error screenshot", {"path": screenshot_path})
        return screenshot_path
    except Exception as screenshot_error:
        progress(
            "Error screenshot capture failed: " f"{repr(screenshot_error)}"
        )
        return None


async def collect_page_summary(tab):
    try:
        return await tab.evaluate("""
            (() => {
                const visibleText = document.body
                    ? document.body.innerText.replace(/\\s+/g, ' ').trim()
                    : '';
                const inputs = Array.from(document.querySelectorAll('input'))
                    .slice(0, 12)
                    .map((input) => ({
                        type: input.type,
                        name: input.name,
                        id: input.id,
                        ariaLabel: input.getAttribute('aria-label'),
                        valueLength: input.value ? input.value.length : 0,
                        disabled: Boolean(input.disabled),
                        readOnly: Boolean(input.readOnly),
                    }));
                const buttonSelector = [
                    'button',
                    '[role="button"]',
                    'input[type="submit"]',
                ].join(', ');
                const buttons = Array.from(
                    document.querySelectorAll(buttonSelector)
                )
                    .slice(0, 12)
                    .map((button) => ({
                        tag: button.tagName,
                        id: button.id,
                        ariaLabel: button.getAttribute('aria-label'),
                        text: (button.innerText || button.value || '')
                            .replace(/\\s+/g, ' ')
                            .trim()
                            .slice(0, 120),
                        disabled: Boolean(button.disabled),
                    }));
                return {
                    url: window.location.href,
                    title: document.title,
                    readyState: document.readyState,
                    textSnippet: visibleText.slice(0, 500),
                    inputs,
                    buttons,
                };
            })()
            """)
    except Exception as exc:
        return {"error": repr(exc), "url": getattr(tab, "url", "")}


async def click_human(element):
    try:
        await element.mouse_move()
        await sleep_ms(random.uniform(100, 400))
    except Exception:
        pass
    try:
        await element.mouse_click()
    except Exception:
        await element.apply(
            """
            (element) => {
                element.scrollIntoView({block: 'center', inline: 'center'});
                element.click();
            }
            """,
            await_promise=True,
        )


async def click_direct(element):
    await element.apply(
        """
        (element) => {
            element.scrollIntoView({block: 'center', inline: 'center'});
            element.click();
        }
        """,
        await_promise=True,
    )


async def find_login_button(tab):
    try:
        progress("Searching for login button by selector fallback")
        return await select_first(tab, SUBMIT_SELECTOR, timeout=3)
    except Exception:
        pass
    for label in ("Log In", "Sign in", "Sign In"):
        try:
            progress(f"Searching for login button by text: {label}")
            return await tab.find(label, best_match=True, timeout=3)
        except Exception:
            pass
    return await select_first(tab, SUBMIT_SELECTOR, timeout=10)


async def wait_for_password_page_after_continue(
    tab,
    state,
    timeout_ms=15000,
    interval_ms=250,
):
    start = time.monotonic()
    while (time.monotonic() - start) * 1000 < timeout_ms:
        if await capture_current_tab_redirect(
            tab,
            state,
            "email continue transition",
        ):
            return "auth_code"
        if await detect_access_denied_page(tab):
            state["access_denied"] = True
            return "access_denied"

        password_field = await select_optional(tab, PASSWORD_SELECTOR)
        if password_field is not None:
            return "password"

        email_field = await select_optional(tab, EMAIL_SELECTOR)
        continue_button = await select_optional(tab, CONTINUE_SELECTOR)
        if email_field is not None and continue_button is not None:
            await sleep_ms(interval_ms)
            continue

        await sleep_ms(interval_ms)

    summary = await collect_page_summary(tab)
    progress_json(
        "Password page did not become ready after Continue",
        summary,
    )
    if await select_optional(tab, EMAIL_SELECTOR) is not None:
        return "email"
    return "timeout"


async def find_mfa_submit_button(tab):
    for label in ("Submit code", "Submit Code", "Verify", "Continue"):
        try:
            progress(f"Searching for MFA submit button by text: {label}")
            return await tab.find(label, best_match=True, timeout=3)
        except Exception:
            pass
    progress("Searching for MFA submit button by selector fallback")
    return await select_first(tab, MFA_SUBMIT_SELECTOR, timeout=10)


async def wait_ready(tab, timeout=60):
    try:
        await tab.wait_for_ready_state("complete", timeout=timeout)
    except TypeError:
        await tab.wait_for_ready_state("complete")
    except Exception as exc:
        progress(
            f"Page readiness wait ended without complete state: {repr(exc)}"
        )
        await sleep_ms(1000)


async def maybe_value(result):
    return getattr(result, "value", result)


def get_navigation_timeout_seconds(payload):
    configured_timeout = (
        payload.get("navigationTimeoutSeconds")
        or os.environ.get("ONSTARJS_NAVIGATION_TIMEOUT_SECONDS")
        or 60
    )
    try:
        return max(10, int(configured_timeout))
    except (TypeError, ValueError):
        return 60


async def get_initial_tab(browser):
    tab = browser.main_tab
    if tab is None:
        progress("No existing browser tab found; opening about:blank")
        tab = await browser.get("about:blank")
    tab.browser = browser
    return tab


async def navigate_existing_tab(tab, url, timeout_seconds):
    progress_json(
        "Sending page navigation",
        {
            "urlHost": url.split("/", 3)[2] if "://" in url else url,
            "timeoutSeconds": timeout_seconds,
        },
    )
    await tab.send(cdp.page.enable())
    navigation_result = await tab.send(cdp.page.navigate(url))
    progress_json("Page.navigate result", navigation_result)
    await wait_ready(tab, timeout=timeout_seconds)
    progress(
        f"Navigation command completed; current URL: {getattr(tab, 'url', '')}"
    )
    return tab


def collect_environment_diagnostics(browser_executable_path, profile_path):
    diagnostics = {
        "platform": sys.platform,
        "python": sys.executable,
        "cwd": os.getcwd(),
        "display": os.environ.get("DISPLAY"),
        "xvfb": shutil.which("Xvfb"),
        "browserExecutablePath": browser_executable_path,
        "browserExecutableExists": bool(
            browser_executable_path and os.path.exists(browser_executable_path)
        ),
        "profilePath": profile_path,
        "profileExists": bool(profile_path and os.path.exists(profile_path)),
    }

    if browser_executable_path and os.path.exists(browser_executable_path):
        try:
            diagnostics["browserExecutableSize"] = os.path.getsize(
                browser_executable_path
            )
        except Exception as exc:
            diagnostics["browserExecutableSizeError"] = repr(exc)

    return diagnostics


def log_browser_preflight(browser_executable_path):
    if not browser_executable_path:
        progress("No explicit browser executable path was provided")
        return

    if not os.path.exists(browser_executable_path):
        raise FileNotFoundError(
            f"Browser executable does not exist: {browser_executable_path}"
        )

    try:
        version_result = subprocess.run(
            [browser_executable_path, "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        progress_json(
            "Browser version probe",
            {
                "returncode": version_result.returncode,
                "stdout": version_result.stdout.strip(),
                "stderr": version_result.stderr.strip(),
            },
        )
    except Exception as exc:
        progress(f"Browser version probe failed: {repr(exc)}")

    if sys.platform.startswith("linux") and shutil.which("ldd"):
        try:
            ldd_result = subprocess.run(
                ["ldd", browser_executable_path],
                capture_output=True,
                text=True,
                timeout=10,
                check=False,
            )
            missing = [
                line.strip()
                for line in ldd_result.stdout.splitlines()
                if "not found" in line
            ]
            progress_json(
                "Browser shared library probe",
                {
                    "returncode": ldd_result.returncode,
                    "missing": missing,
                },
            )
        except Exception as exc:
            progress(f"Browser shared library probe failed: {repr(exc)}")


def collect_child_process_ids(pid):
    if sys.platform == "win32" or not shutil.which("pgrep"):
        return []

    try:
        result = subprocess.run(
            ["pgrep", "-P", str(pid)],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
    except Exception:
        return []

    child_ids = []
    for line in result.stdout.splitlines():
        try:
            child_id = int(line.strip())
        except ValueError:
            continue
        child_ids.extend(collect_child_process_ids(child_id))
        child_ids.append(child_id)
    return child_ids


def signal_process_tree(pid, sig):
    if not pid:
        return

    for child_id in collect_child_process_ids(pid):
        try:
            os.kill(child_id, sig)
        except ProcessLookupError:
            pass
        except Exception as exc:
            progress(f"Failed to signal child process {child_id}: {repr(exc)}")

    try:
        os.kill(pid, sig)
    except ProcessLookupError:
        pass
    except Exception as exc:
        progress(f"Failed to signal process {pid}: {repr(exc)}")


async def stop_browser_with_timeout(browser, timeout=10):
    process = getattr(browser, "_process", None)
    process_pid = getattr(process, "pid", None)
    try:
        await asyncio.wait_for(browser.stop(), timeout=timeout)
        progress("Browser stopped")
        return
    except asyncio.TimeoutError:
        progress(f"Browser stop timed out after {timeout}s; forcing cleanup")
    except Exception as exc:
        progress(f"Browser stop failed; forcing cleanup: {repr(exc)}")

    if process is not None and process.poll() is None:
        if sys.platform == "win32":
            try:
                process.kill()
            except Exception as exc:
                progress(f"Failed to kill browser process: {repr(exc)}")
        else:
            signal_process_tree(process_pid, signal.SIGTERM)
            await asyncio.sleep(1)
            if process.poll() is None:
                signal_process_tree(process_pid, signal.SIGKILL)

    if process is not None:
        try:
            await asyncio.wait_for(
                asyncio.to_thread(process.wait),
                timeout=3,
            )
        except Exception as exc:
            progress("Browser process wait failed after kill: " f"{repr(exc)}")


class XvfbDisplay:
    def __init__(self, width=1365, height=1024, color_depth=24):
        self.width = width
        self.height = height
        self.color_depth = color_depth
        self.display = None
        self.process = None
        self.previous_display = os.environ.get("DISPLAY")

    def is_ready(self, display, socket_path):
        xdpyinfo_path = shutil.which("xdpyinfo")
        if xdpyinfo_path:
            try:
                result = subprocess.run(
                    [xdpyinfo_path, "-display", display],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=1,
                    check=False,
                )
                return result.returncode == 0
            except subprocess.TimeoutExpired:
                return False

        return os.path.exists(socket_path)

    def stop_process(self):
        stdout = ""
        stderr = ""
        if self.process is not None and self.process.poll() is None:
            if sys.platform == "win32":
                self.process.terminate()
            else:
                os.killpg(self.process.pid, signal.SIGTERM)
            try:
                stdout, stderr = self.process.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                if sys.platform == "win32":
                    self.process.kill()
                else:
                    os.killpg(self.process.pid, signal.SIGKILL)
                stdout, stderr = self.process.communicate(timeout=3)
        elif self.process is not None:
            stdout, stderr = self.process.communicate(timeout=1)

        return stdout.strip(), stderr.strip()

    def start(self, timeout=5):
        xvfb_path = shutil.which("Xvfb")
        if not xvfb_path:
            raise RuntimeError("Xvfb binary was not found")

        for display_number in range(99, 120):
            lock_path = f"/tmp/.X{display_number}-lock"
            socket_path = f"/tmp/.X11-unix/X{display_number}"
            if os.path.exists(lock_path) or os.path.exists(socket_path):
                continue

            display = f":{display_number}"
            command = [
                xvfb_path,
                display,
                "-screen",
                "0",
                f"{self.width}x{self.height}x{self.color_depth}",
                "-nolisten",
                "tcp",
                "-ac",
            ]
            progress_json("Starting Xvfb", {"command": command})
            self.process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                start_new_session=sys.platform != "win32",
            )

            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    stdout, stderr = self.process.communicate(timeout=1)
                    raise RuntimeError(
                        "Xvfb exited during startup: "
                        f"code={self.process.returncode}, "
                        f"stdout={stdout.strip()}, stderr={stderr.strip()}"
                    )
                if self.is_ready(display, socket_path):
                    self.display = display
                    os.environ["DISPLAY"] = display
                    progress_json(
                        "Virtual display started",
                        {
                            "display": display,
                            "pid": self.process.pid,
                            "xvfb": xvfb_path,
                            "socket": socket_path,
                        },
                    )
                    return self
                time.sleep(0.1)

            stdout, stderr = self.stop_process()
            raise RuntimeError(
                "Timed out waiting for Xvfb display readiness: "
                f"display={display}, socket={socket_path}, "
                f"stdout={stdout}, stderr={stderr}"
            )

        raise RuntimeError("No free Xvfb display number found in :99-:119")

    def stop(self):
        self.stop_process()
        if self.previous_display is None:
            os.environ.pop("DISPLAY", None)
        else:
            os.environ["DISPLAY"] = self.previous_display


def start_virtual_display_if_needed():
    if sys.platform != "linux" or os.environ.get("DISPLAY"):
        return None
    if os.environ.get("ONSTARJS_DISABLE_XVFB") == "1":
        progress("No DISPLAY detected; virtual display is disabled")
        return None
    if not shutil.which("Xvfb"):
        raise RuntimeError(
            "No DISPLAY is available and Xvfb was not found. Install xvfb "
            "on this Linux host or set DISPLAY before running auth."
        )

    progress("No DISPLAY detected; starting Xvfb virtual display")
    return XvfbDisplay().start()


async def main():
    payload = json.loads(sys.stdin.read())
    profile_path = payload.get("profilePath")
    browser_args = payload.get("browserArgs") or []
    browser_executable_path = payload.get("browserExecutablePath")
    navigation_timeout_seconds = get_navigation_timeout_seconds(payload)
    state = {
        "auth_code": None,
        "access_denied": False,
        "record_login_responses": False,
        "recent_responses": [],
    }
    network_state = {"pending": {}, "last_activity": time.monotonic()}
    if payload.get("simulateNavigationAuthCode"):
        state["auth_code"] = payload["simulateNavigationAuthCode"]
    browser = None
    tab = None
    virtual_display = None
    phase = "initializing"

    def mark_network_activity():
        network_state["last_activity"] = time.monotonic()

    async def send_handler(event):
        mark_network_activity()
        request_url = getattr(getattr(event, "request", None), "url", "")
        network_state["pending"][event.request_id] = {
            "url": sanitize_url(request_url),
            "type": str(getattr(event, "type_", "")),
            "documentUrl": sanitize_url(getattr(event, "document_url", "")),
            "startedAt": time.monotonic(),
        }
        capture_auth_redirect(state, request_url, "network request")
        document_url = getattr(event, "document_url", "")
        capture_auth_redirect(state, document_url, "network document")
        redirect_response = getattr(event, "redirect_response", None)
        redirect_url = getattr(redirect_response, "url", "")
        capture_auth_redirect(state, redirect_url, "network redirect response")

    async def response_handler(event):
        mark_network_activity()
        response = getattr(event, "response", None)
        if not response:
            return
        headers = getattr(response, "headers", {}) or {}
        location = headers.get("location") or headers.get("Location")
        capture_auth_redirect(state, location, "response location")
        response_url = str(getattr(response, "url", ""))
        capture_auth_redirect(state, response_url, "network response")
        response_status = int(getattr(response, "status", 0) or 0)
        if state.get("record_login_responses"):
            state["recent_responses"].append(
                {
                    "status": response_status,
                    "url": sanitize_url(response_url),
                    "type": str(getattr(event, "type_", "")),
                    "contentType": headers.get("content-type")
                    or headers.get("Content-Type"),
                    "location": sanitize_url(location) if location else None,
                }
            )
            state["recent_responses"] = state["recent_responses"][-20:]
        should_check_body = (
            response_status
            in (
                401,
                403,
            )
            or "selfasserted" in response_url.lower()
        )
        if not should_check_body:
            return
        try:
            body, encoded = await tab.send(
                cdp.network.get_response_body(event.request_id)
            )
            if encoded:
                body = base64.b64decode(body).decode("utf-8", "replace")
            if is_access_denied_html(body):
                progress("Access Denied response detected after auth request")
                state["access_denied"] = True
        except Exception:
            pass

    async def loading_finished_handler(event):
        mark_network_activity()
        network_state["pending"].pop(event.request_id, None)

    async def loading_failed_handler(event):
        mark_network_activity()
        network_state["pending"].pop(event.request_id, None)

    async def frame_started_navigating_handler(event):
        capture_auth_redirect(
            state,
            getattr(event, "url", ""),
            "frame started navigating",
        )

    async def frame_requested_navigation_handler(event):
        capture_auth_redirect(
            state,
            getattr(event, "url", ""),
            "frame requested navigation",
        )

    async def navigated_within_document_handler(event):
        capture_auth_redirect(
            state,
            getattr(event, "url", ""),
            "navigated within document",
        )

    async def frame_navigated_handler(event):
        frame = getattr(event, "frame", None)
        capture_auth_redirect(
            state,
            getattr(frame, "url", ""),
            "frame navigated",
        )

    try:
        progress_json(
            "Environment diagnostics",
            collect_environment_diagnostics(
                browser_executable_path,
                profile_path,
            ),
        )
        log_browser_preflight(browser_executable_path)
        progress_json("Browser args", browser_args)

        phase = "configuring browser session"
        progress("Configuring browser session")
        virtual_display = start_virtual_display_if_needed()
        mobile_fingerprint = generate_mobile_fingerprint()
        sandbox_enabled = sys.platform != "linux"
        if not sandbox_enabled:
            progress(
                "Disabling browser sandbox for Linux launch compatibility"
            )
        config = zd.Config(
            headless=False,
            user_data_dir=profile_path,
            browser_args=browser_args,
            browser_executable_path=browser_executable_path,
            sandbox=sandbox_enabled,
            user_agent=mobile_fingerprint["userAgent"],
        )

        phase = "starting browser"
        progress("Starting browser")
        browser = await zd.start(config)
        progress("Browser started")
        phase = "acquiring initial tab"
        progress("Acquiring initial browser tab")
        tab = await get_initial_tab(browser)

        phase = "registering network handlers"
        progress("Registering redirect capture handlers")
        tab.add_handler(cdp.network.RequestWillBeSent, send_handler)
        tab.add_handler(cdp.network.ResponseReceived, response_handler)
        tab.add_handler(cdp.network.LoadingFinished, loading_finished_handler)
        tab.add_handler(cdp.network.LoadingFailed, loading_failed_handler)
        tab.add_handler(
            cdp.page.FrameStartedNavigating,
            frame_started_navigating_handler,
        )
        tab.add_handler(
            cdp.page.FrameRequestedNavigation,
            frame_requested_navigation_handler,
        )
        tab.add_handler(
            cdp.page.NavigatedWithinDocument,
            navigated_within_document_handler,
        )
        tab.add_handler(cdp.page.FrameNavigated, frame_navigated_handler)
        await tab.send(cdp.network.enable())
        phase = "applying browser fingerprint"
        await apply_mobile_fingerprint(tab, mobile_fingerprint)
        phase = "navigating to authorization URL"
        progress("Navigating to authorization URL")
        tab = await navigate_existing_tab(
            tab,
            payload["authorizationUrl"],
            navigation_timeout_seconds,
        )
        if state["auth_code"]:
            title = await maybe_value(await tab.evaluate("document.title"))
            progress("Authorization redirect captured during navigation")
            print(
                json.dumps(
                    {
                        "ok": True,
                        "authCode": state["auth_code"],
                        "finalUrl": getattr(tab, "url", ""),
                        "finalTitle": title,
                        "accessDenied": state["access_denied"],
                    }
                )
            )
            return

        if payload.get("diagnosticOnly"):
            title = await maybe_value(await tab.evaluate("document.title"))
            progress("Diagnostic browser navigation succeeded")
            print(
                json.dumps(
                    {
                        "ok": True,
                        "diagnosticOnly": True,
                        "finalUrl": getattr(tab, "url", ""),
                        "finalTitle": title,
                    }
                )
            )
            return

        phase = "waiting for auth page"
        progress("Waiting for authentication page readiness")
        await wait_ready(tab)

        phase = "entering email"
        progress("Locating email input field")
        email_field = await select_first(tab, EMAIL_SELECTOR)
        progress("Entering email address")
        await fill_text_field(
            email_field,
            payload["username"],
            network_state,
            50,
            150,
            0.1,
        )

        post_login_state = "timeout"
        password_page_ready = False
        for continue_attempt in range(1, 4):
            progress("Locating continue button")
            continue_button = await select_first(tab, CONTINUE_SELECTOR)
            progress_json(
                "Submitting email step",
                {"attempt": continue_attempt},
            )
            await click_human(continue_button)
            progress("Waiting for password page readiness")
            await wait_ready(tab)
            transition_state = await wait_for_password_page_after_continue(
                tab,
                state,
            )
            if transition_state == "password":
                password_page_ready = True
                break
            if transition_state == "auth_code":
                post_login_state = "auth_code"
                break
            if transition_state == "access_denied":
                post_login_state = "access_denied"
                break
            if transition_state == "email" and continue_attempt < 3:
                progress(
                    "Email page is still active after Continue; retrying"
                )
                continue
            raise TimeoutError(
                "Password page did not become ready after submitting the "
                f"email step; state={transition_state}"
            )

        if password_page_ready:
            phase = "entering password"
            progress("Locating password input field")
            password_field = await select_first(tab, PASSWORD_SELECTOR)
            progress("Entering password")
            await fill_text_field(
                password_field,
                payload["password"],
                network_state,
                40,
                120,
                0.08,
            )

            progress("Locating login button")
            submit_button = await find_login_button(tab)
            phase = "submitting credentials"
            progress("Submitting credentials")
            state["record_login_responses"] = True
            state["recent_responses"] = []
            await click_human(submit_button)
            await sleep_ms(500)
            progress("Monitoring for authorization redirect or MFA challenge")
            post_login_state = await wait_for_auth_code_or_mfa(
                tab,
                state,
                5000,
            )
            if post_login_state == "timeout":
                title_after_submit = await maybe_value(
                    await tab.evaluate("document.title")
                )
                if (
                    not state.get("access_denied")
                    and "sign in" in str(title_after_submit).lower()
                ):
                    progress(
                        "Still on sign-in page after submit; retrying "
                        "login click"
                    )
                    await click_direct(submit_button)
                    post_login_state = await wait_for_auth_code_or_mfa(
                        tab,
                        state,
                        15000,
                    )
            state["record_login_responses"] = False

            if post_login_state == "mfa":
                progress("MFA challenge became ready before auth redirect")
            elif post_login_state == "auth_code":
                progress("Authorization redirect captured after credentials")
            elif post_login_state == "access_denied":
                progress("Access Denied detected after credentials")
            else:
                progress(
                    "No auth redirect or MFA challenge detected before "
                    "timeout"
                )
                progress_json(
                    "Unexpected post-login response summary",
                    {
                        "responses": state.get("recent_responses", []),
                        "page": await collect_page_summary(tab),
                    },
                )

        title = await maybe_value(await tab.evaluate("document.title"))
        page_html_result = await tab.evaluate(
            "document.documentElement.outerHTML"
        )
        page_html = (await maybe_value(page_html_result)) or ""
        if is_access_denied_html(page_html) or "Access Denied" in str(title):
            progress("Access Denied page detected")
            state["access_denied"] = True

        if not state["auth_code"] and not state["access_denied"]:
            try:
                phase = "checking MFA challenge"
                progress("Checking for MFA challenge")
                await select_first(tab, MFA_SELECTOR, timeout=10)
                page_html_result = await tab.evaluate(
                    "document.documentElement.outerHTML"
                )
                page_html = (await maybe_value(page_html_result)) or ""
                has_totp_field = await element_count(
                    tab,
                    'input[name="otpCode"]',
                )
                if has_totp_field > 0 or "otpCode" in page_html:
                    progress("TOTP MFA challenge detected")
                    try:
                        import pyotp
                    except Exception as exc:
                        pyotp_error = (
                            "Zendriver MFA requires pyotp. Install it with "
                            "'python -m pip install pyotp'."
                        )
                        raise RuntimeError(pyotp_error) from exc
                    totp_secret = payload["totpKey"].strip()
                    if "secret=" in totp_secret:
                        secret_match = re.search(
                            r"secret=([^&]+)",
                            totp_secret,
                        )
                        if secret_match:
                            totp_secret = secret_match.group(1)
                    if len(totp_secret) != 16:
                        totp_length_error = (
                            "Provided TOTP Key does not meet expected key "
                            "length. Key should be 16 alphanumeric "
                            "characters."
                        )
                        raise ValueError(totp_length_error)
                    progress("Locating TOTP input field")
                    otp_field = await select_first(tab, OTP_SELECTOR)
                    phase = "submitting MFA"
                    progress("Entering TOTP verification code")
                    await fill_text_field(
                        otp_field,
                        pyotp.TOTP(totp_secret).now(),
                        network_state,
                        50,
                        150,
                        0.0,
                    )
                    progress("Locating MFA submit button")
                    submit_mfa = await find_mfa_submit_button(tab)
                    progress("Submitting TOTP verification code")
                    await click_human(submit_mfa)
                    progress("Waiting for post-MFA page readiness")
                    await wait_ready(tab)
                    progress(
                        "Monitoring for authorization redirect or Access "
                        "Denied after MFA"
                    )
                    post_mfa_state = await wait_for_auth_code_or_access_denied(
                        tab,
                        state,
                        60000,
                    )
                    if post_mfa_state == "auth_code":
                        progress("Authorization redirect captured after MFA")
                    elif post_mfa_state == "access_denied":
                        progress("Access Denied detected after MFA")
                    else:
                        progress(
                            "No auth redirect or Access Denied detected "
                            "after MFA before timeout"
                        )
                elif "emailMfa" in page_html:
                    progress("Email MFA challenge detected")
                    email_mfa_error = (
                        "Only TOTP via Third-Party Authenticator is "
                        "supported; email MFA was presented."
                    )
                    raise RuntimeError(email_mfa_error)
                elif "strongAuthenticationPhoneNumber" in page_html:
                    progress("SMS MFA challenge detected")
                    sms_mfa_error = (
                        "Only TOTP via Third-Party Authenticator is "
                        "supported; SMS MFA was presented."
                    )
                    raise RuntimeError(sms_mfa_error)
            except TimeoutError:
                progress("No MFA challenge detected before timeout")
                pass

        title = await maybe_value(await tab.evaluate("document.title"))
        progress("Browser authentication flow finished")
        if not state["auth_code"] and not state["access_denied"]:
            screenshot_path = await save_error_screenshot(
                tab,
                "missing-auth-code",
            )
            no_code_error = (
                "Zendriver authentication completed without capturing an "
                "authorization code."
            )
            print(
                json.dumps(
                    {
                        "ok": False,
                        "error": no_code_error,
                        "detail": no_code_error,
                        "type": "MissingAuthCode",
                        "phase": phase,
                        "finalUrl": getattr(tab, "url", ""),
                        "finalTitle": title,
                        "screenshotPath": screenshot_path,
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
                    "finalUrl": getattr(tab, "url", ""),
                    "finalTitle": title,
                    "accessDenied": state["access_denied"],
                }
            )
        )
    except Exception as exc:
        traceback_text = traceback.format_exc()
        progress(f"Failure during phase: {phase}")
        progress(f"Exception type: {exc.__class__.__name__}")
        progress(f"Exception repr: {repr(exc)}")
        progress("Traceback follows")
        log(traceback_text)
        final_url = getattr(tab, "url", "") if tab is not None else ""
        final_title = None
        screenshot_path = await save_error_screenshot(tab, phase)
        if tab is not None:
            try:
                final_title = await maybe_value(
                    await tab.evaluate("document.title")
                )
            except Exception:
                final_title = None
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc)
                    or f"Zendriver authentication failed during {phase}",
                    "detail": repr(exc),
                    "type": exc.__class__.__name__,
                    "phase": phase,
                    "traceback": traceback_text,
                    "finalUrl": final_url,
                    "finalTitle": final_title,
                    "screenshotPath": screenshot_path,
                    "accessDenied": state.get("access_denied", False),
                }
            )
        )
    finally:
        if browser is not None:
            try:
                await stop_browser_with_timeout(browser)
            except Exception:
                pass
        if virtual_display is not None:
            try:
                virtual_display.stop()
                progress("Virtual display stopped")
            except Exception:
                pass


asyncio.run(main())
