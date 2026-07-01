import asyncio
import json
import random
import re
import sys
import time

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

try:
    import zendriver as zd
    from zendriver import cdp
except Exception as exc:
    error_message = (
        "Zendriver is not installed for this Python interpreter. Run "
        "'pnpm run setup:zendriver' or "
        "'python -m pip install zendriver pyotp'."
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


def extract_auth_code(url):
    match = re.search(r"[?&]code=([^&]*)", url or "")
    return match.group(1) if match else None


async def sleep_ms(ms):
    await asyncio.sleep(ms / 1000)


async def wait_for_auth_code(state, timeout_ms=10000, interval_ms=500):
    start = time.monotonic()
    while (time.monotonic() - start) * 1000 < timeout_ms:
        if state.get("auth_code"):
            return True
        await sleep_ms(interval_ms)
    return False


async def select_first(tab, selector, timeout=60):
    deadline = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < deadline:
        try:
            element = await tab.select(selector, timeout=1)
            if element:
                return element
        except Exception as exc:
            last_error = exc
            await sleep_ms(250)
    raise TimeoutError(
        f"Timed out waiting for selector: {selector}. Last error: {last_error}"
    )


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


async def fill_text_field(
    element,
    value,
    min_delay=40,
    max_delay=150,
    pause_chance=0.08,
):
    await focus_human(element)
    await clear_field(element)
    await sleep_ms(random.uniform(200, 500))
    await type_human(element, value, min_delay, max_delay, pause_chance)
    await sleep_ms(random.uniform(250, 600))

    actual_value = await get_field_value(element)
    if actual_value != value:
        log(
            "[zendriver] typed value did not match field value; "
            "repairing with input/change events"
        )
        await set_field_value(element, value)
        await sleep_ms(random.uniform(150, 350))


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


async def find_login_button(tab):
    for label in ("Log In", "Sign in", "Sign In"):
        try:
            return await tab.find(label, best_match=True, timeout=3)
        except Exception:
            pass
    return await select_first(tab, SUBMIT_SELECTOR, timeout=10)


async def find_mfa_submit_button(tab):
    for label in ("Submit code", "Submit Code", "Verify", "Continue"):
        try:
            return await tab.find(label, best_match=True, timeout=3)
        except Exception:
            pass
    return await select_first(tab, MFA_SUBMIT_SELECTOR, timeout=10)


async def wait_ready(tab, timeout=60):
    try:
        await tab.wait_for_ready_state("complete", timeout=timeout)
    except TypeError:
        await tab.wait_for_ready_state("complete")
    except Exception:
        await sleep_ms(1000)


async def maybe_value(result):
    return getattr(result, "value", result)


async def main():
    payload = json.loads(sys.stdin.read())
    fingerprint = payload.get("fingerprint") or {}
    viewport = fingerprint.get("viewport") or {"width": 430, "height": 932}
    browser_args = payload.get("browserArgs") or []
    profile_path = payload.get("profilePath")
    state = {"auth_code": None, "access_denied": False}
    browser = None

    async def send_handler(event):
        request_url = getattr(getattr(event, "request", None), "url", "")
        if request_url.lower().startswith(AUTH_REDIRECT_PREFIX):
            code = extract_auth_code(request_url)
            if code:
                log("[zendriver] captured auth code from request redirect")
                state["auth_code"] = code

    async def response_handler(event):
        response = getattr(event, "response", None)
        if not response:
            return
        headers = getattr(response, "headers", {}) or {}
        location = headers.get("location") or headers.get("Location")
        if location and str(location).lower().startswith(AUTH_REDIRECT_PREFIX):
            code = extract_auth_code(str(location))
            if code:
                log("[zendriver] captured auth code from response redirect")
                state["auth_code"] = code

    try:
        config = zd.Config(
            headless=False,
            user_data_dir=profile_path,
            browser_args=browser_args,
            user_agent=fingerprint.get("userAgent"),
        )

        browser = await zd.start(config)
        tab = await browser.get(payload["authorizationUrl"])
        tab.add_handler(cdp.network.RequestWillBeSent, send_handler)
        tab.add_handler(cdp.network.ResponseReceived, response_handler)
        await tab.send(cdp.network.enable())
        await tab.set_user_agent(
            fingerprint.get("userAgent"),
            accept_language="en-US,en;q=0.9",
            platform=(
                "iPhone"
                if "iPhone" in fingerprint.get("userAgent", "")
                else "Linux armv8l"
            ),
        )
        await tab.send(
            cdp.emulation.set_device_metrics_override(
                width=int(viewport["width"]),
                height=int(viewport["height"]),
                device_scale_factor=3,
                mobile=True,
            )
        )
        await wait_ready(tab)

        email_field = await select_first(tab, EMAIL_SELECTOR)
        await fill_text_field(email_field, payload["username"], 50, 150, 0.1)

        continue_button = await select_first(tab, CONTINUE_SELECTOR)
        await click_human(continue_button)
        await wait_ready(tab)

        password_field = await select_first(tab, PASSWORD_SELECTOR)
        await fill_text_field(
            password_field,
            payload["password"],
            40,
            120,
            0.08,
        )

        submit_button = await find_login_button(tab)
        await click_human(submit_button)
        await sleep_ms(3000)
        await wait_ready(tab)
        await wait_for_auth_code(state, 15000)

        title = await maybe_value(await tab.evaluate("document.title"))
        page_html_result = await tab.evaluate(
            "document.documentElement.outerHTML"
        )
        page_html = (await maybe_value(page_html_result)) or ""
        if (
            "<TITLE>Access Denied</TITLE>" in page_html
            or "Access Denied" in str(title)
        ):
            state["access_denied"] = True

        if not state["auth_code"]:
            try:
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
                    otp_field = await select_first(tab, OTP_SELECTOR)
                    await fill_text_field(
                        otp_field,
                        pyotp.TOTP(totp_secret).now(),
                        50,
                        150,
                        0.0,
                    )
                    submit_mfa = await find_mfa_submit_button(tab)
                    await click_human(submit_mfa)
                    await wait_ready(tab)
                    await wait_for_auth_code(state, 60000)
                elif "emailMfa" in page_html:
                    email_mfa_error = (
                        "Only TOTP via Third-Party Authenticator is "
                        "supported; email MFA was presented."
                    )
                    raise RuntimeError(email_mfa_error)
                elif "strongAuthenticationPhoneNumber" in page_html:
                    sms_mfa_error = (
                        "Only TOTP via Third-Party Authenticator is "
                        "supported; SMS MFA was presented."
                    )
                    raise RuntimeError(sms_mfa_error)
            except TimeoutError:
                pass

        title = await maybe_value(await tab.evaluate("document.title"))
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
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                    "type": exc.__class__.__name__,
                    "accessDenied": state.get("access_denied", False),
                }
            )
        )
    finally:
        if browser is not None:
            try:
                await browser.stop()
            except Exception:
                pass


asyncio.run(main())
