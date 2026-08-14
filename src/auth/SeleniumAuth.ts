import {
  Builder,
  By,
  logging,
  WebDriver,
  WebElement,
} from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import { URL } from "url";
import { getImapMfaCode } from "./ImapMfa";

import UndetectedChrome from "undetected-chromedriver-js";

const AUTH_REDIRECT_PREFIX = "msauth.com.gm.mychevrolet://auth";

const EMAIL_SELECTORS = [
  'input[type="email"]',
  'input[name="logonIdentifier"]',
  "input#logonIdentifier",
];
const CONTINUE_SELECTORS = [
  '#continue[data-dtm="sign in"]',
  'button[data-dtm="sign in"]',
  'button[aria-label="Continue"]',
  "#continue",
];
const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name="password"]',
  "input#password",
];
const SUBMIT_SELECTORS = [
  '#continue[aria-label="Sign in"]',
  'button[aria-label="Sign in"]',
  'button[aria-label="Log In"]',
  'input[type="submit"]',
  "button#login",
];
const EMAIL_MFA_CODE_SELECTORS = ["#verificationCode", 'input[name="otpCode"]'];
const EMAIL_MFA_SUBMIT_SELECTORS = [
  "#emailVerificationControl-RO_but_verify_code",
  'button[aria-label*="Submit"]',
  'button[aria-label*="Verify"]',
  "#continue",
];
const BLOCKING_OVERLAY_SELECTORS = [
  ".simplemodal-overlay",
  "#simplemodal-overlay",
  "div[aria-busy='true']",
];

const ACCESS_DENIED_MARKERS = [
  "<title>Access Denied</title>",
  "<h1>Access Denied</h1>",
  "errors.edgesuite.net",
  "you don't have permission to access",
];
const SELENIUM_VERBOSE =
  (process.env.ONSTARJS_SELENIUM_VERBOSE ?? "true").toLowerCase() !== "false";

function seleniumLog(step: string, details?: string): void {
  if (!SELENIUM_VERBOSE) {
    return;
  }
  const stamp = new Date().toISOString();
  console.log(
    `[seleniumAuth][${stamp}] ${step}${details ? ` :: ${details}` : ""}`,
  );
}

export interface SeleniumAuthPayload {
  authorizationUrl: string;
  username: string;
  password: string;
  profilePath?: string;
}

export interface SeleniumAuthResult {
  authCode?: string;
  finalUrl?: string;
  finalTitle?: string;
  accessDenied?: boolean;
}

type UndetectedChromeDriver = {
  build: () => Promise<WebDriver>;
  quit: () => Promise<void>;
};

type UndetectedChromeCtor = new (
  options: Record<string, unknown>,
) => UndetectedChromeDriver;

function tryExtractAuthCodeFromUrl(rawUrl: string | null): string | undefined {
  if (!rawUrl) {
    return undefined;
  }

  if (!rawUrl.toLowerCase().startsWith(AUTH_REDIRECT_PREFIX)) {
    return undefined;
  }

  const match = /[?&]code=([^&]*)/.exec(rawUrl);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function tryExtractAuthCodeFromText(
  rawText: string | null | undefined,
): string | undefined {
  if (!rawText) {
    return undefined;
  }

  const text = String(rawText);
  const uriRegexes = [
    /msauth\.com\.gm\.mychevrolet:\/\/auth[^"'\s<]*/gi,
    /msauth\.com\.gm\.mychevrolet%3A%2F%2Fauth[^"'\s<]*/gi,
  ];

  for (const uriRegex of uriRegexes) {
    const matches = text.match(uriRegex) ?? [];
    for (const match of matches) {
      let candidate = match;
      for (let i = 0; i < 3; i++) {
        const extracted = tryExtractAuthCodeFromUrl(candidate);
        if (extracted) {
          return extracted;
        }

        try {
          candidate = decodeURIComponent(candidate);
        } catch {
          break;
        }
      }
    }
  }

  return undefined;
}

async function tryExtractAuthCodeFromPage(
  driver: WebDriver,
): Promise<string | undefined> {
  const fromUrl = tryExtractAuthCodeFromUrl(await driver.getCurrentUrl());
  if (fromUrl) {
    return fromUrl;
  }

  const fromSource = tryExtractAuthCodeFromText(await driver.getPageSource());
  if (fromSource) {
    seleniumLog("auth-code-captured", "from page source");
    return fromSource;
  }

  return undefined;
}

function isBrowserInternalUrl(url: string): boolean {
  const lower = (url || "").toLowerCase();
  return (
    lower.startsWith("chrome://") ||
    lower.startsWith("edge://") ||
    lower.startsWith("about:")
  );
}

function isAuthNavigationReady(currentUrl: string, authUrl: string): boolean {
  if (!currentUrl) {
    return false;
  }
  if (tryExtractAuthCodeFromUrl(currentUrl)) {
    return true;
  }

  if (isBrowserInternalUrl(currentUrl)) {
    return false;
  }

  try {
    const current = new URL(currentUrl);
    const target = new URL(authUrl);
    return current.host === target.host;
  } catch {
    return false;
  }
}

async function robustNavigateToAuthorizationUrl(
  driver: WebDriver,
  authorizationUrl: string,
): Promise<string> {
  const attempts: Array<{
    name: string;
    run: () => Promise<void>;
  }> = [
    {
      name: "driver.get",
      run: async () => {
        await driver.get(authorizationUrl);
      },
    },
    {
      name: "driver.navigate().to",
      run: async () => {
        await driver.navigate().to(authorizationUrl);
      },
    },
    {
      name: "window.location.assign",
      run: async () => {
        await driver.executeScript(
          "window.location.assign(arguments[0]);",
          authorizationUrl,
        );
      },
    },
    {
      name: "new-tab-and-get",
      run: async () => {
        await driver.switchTo().newWindow("tab");
        await driver.get(authorizationUrl);
      },
    },
  ];

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    seleniumLog("navigate-attempt", `index=${i + 1}, strategy=${attempt.name}`);
    try {
      await attempt.run();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      seleniumLog(
        "navigate-attempt-error",
        `strategy=${attempt.name}, error=${msg}`,
      );
    }

    await driver.sleep(1200);
    const currentUrl = await driver.getCurrentUrl();
    seleniumLog(
      "navigate-attempt-result",
      `strategy=${attempt.name}, url=${currentUrl}`,
    );

    if (isAuthNavigationReady(currentUrl, authorizationUrl)) {
      return currentUrl;
    }
  }

  const finalUrl = await driver.getCurrentUrl();
  throw new Error(
    `Unable to navigate to authorization host. Final URL: ${finalUrl}`,
  );
}

async function firstVisible(
  driver: WebDriver,
  selectors: string[],
): Promise<{ selector: string; element: WebElement } | null> {
  seleniumLog("find-visible-start", `selectors=${selectors.join(" | ")}`);
  for (const selector of selectors) {
    const elements = await driver.findElements(By.css(selector));
    for (const element of elements) {
      if (await element.isDisplayed()) {
        seleniumLog("find-visible-hit", `selector=${selector}`);
        return { selector, element };
      }
    }
  }
  seleniumLog("find-visible-miss");
  return null;
}

async function clickFirstVisible(
  driver: WebDriver,
  selectors: string[],
): Promise<boolean> {
  const hit = await firstVisible(driver, selectors);
  if (!hit) {
    seleniumLog("click-miss", `selectors=${selectors.join(" | ")}`);
    return false;
  }
  await driver.executeScript(
    "arguments[0].scrollIntoView({block: 'center'});",
    hit.element,
  );
  await hit.element.click();
  seleniumLog("click-ok", `selector=${hit.selector}`);
  return true;
}

async function clickElementRobustly(
  driver: WebDriver,
  element: WebElement,
): Promise<void> {
  await driver
    .wait(async () => {
      for (const selector of BLOCKING_OVERLAY_SELECTORS) {
        const overlays = await driver.findElements(By.css(selector));
        for (const overlay of overlays) {
          if (await overlay.isDisplayed()) {
            seleniumLog("overlay-visible", `selector=${selector}`);
            return false;
          }
        }
      }
      return true;
    }, 6_000)
    .catch(() => {
      seleniumLog("overlay-wait-timeout", "proceeding with best-effort click");
      return false;
    });

  await driver.executeScript(
    "arguments[0].scrollIntoView({block: 'center'});",
    element,
  );

  try {
    await element.click();
    return;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    seleniumLog("click-native-failed", msg);
  }

  // JavaScript click can recover when overlays/interceptions make native click flaky.
  await driver.executeScript("arguments[0].click();", element);
}

async function clickWithStateTransition(
  driver: WebDriver,
  selectors: string[],
  label: string,
  hasTransitioned: () => Promise<boolean>,
  timeoutMs = 20_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;

  while (Date.now() < deadline) {
    attempts += 1;
    const hit = await firstVisible(driver, selectors);
    if (!hit) {
      seleniumLog(
        "click-transition-waiting",
        `${label}: no selector hit, attempt=${attempts}`,
      );
      await driver.sleep(350);
      continue;
    }

    seleniumLog(
      "click-transition-attempt",
      `${label}: selector=${hit.selector}, attempt=${attempts}`,
    );
    await clickElementRobustly(driver, hit.element);

    const transitioned = await driver
      .wait(async () => {
        return hasTransitioned();
      }, 5_000)
      .catch(() => false);

    if (transitioned) {
      seleniumLog("click-transition-success", `${label}: attempts=${attempts}`);
      return true;
    }

    seleniumLog(
      "click-transition-retry",
      `${label}: no state change after click, attempt=${attempts}`,
    );
    await driver.sleep(500);
  }

  seleniumLog("click-transition-timeout", `${label}: timeoutMs=${timeoutMs}`);
  return false;
}

async function typeFirstVisible(
  driver: WebDriver,
  selectors: string[],
  value: string,
): Promise<boolean> {
  const hit = await firstVisible(driver, selectors);
  if (!hit) {
    seleniumLog("type-miss", `selectors=${selectors.join(" | ")}`);
    return false;
  }
  await hit.element.clear();
  await hit.element.sendKeys(value);
  seleniumLog(
    "type-ok",
    `selector=${hit.selector}, valueLength=${value.length}`,
  );
  return true;
}

async function isAccessDenied(driver: WebDriver): Promise<boolean> {
  try {
    const currentUrl = (await driver.getCurrentUrl()).toLowerCase();
    if (
      currentUrl.includes("errors.edgesuite.net") ||
      currentUrl.includes("/selfasserted?")
    ) {
      seleniumLog("access-denied-detected", `url=${currentUrl}`);
      return true;
    }

    const title = (await driver.getTitle()).toLowerCase();
    if (title.includes("access denied")) {
      seleniumLog("access-denied-detected", `title=${title}`);
      return true;
    }

    const source = (await driver.getPageSource()).toLowerCase();
    const denied = ACCESS_DENIED_MARKERS.some((marker) =>
      source.includes(marker.toLowerCase()),
    );
    if (denied) {
      seleniumLog("access-denied-detected");
      return true;
    }

    // Network-level capture for Access Denied responses that do not fully render in DOM.
    const perfEntries = await driver.manage().logs().get("performance");
    for (const entry of perfEntries) {
      let payload: unknown;
      try {
        payload = JSON.parse(entry.message);
      } catch {
        continue;
      }

      const message =
        typeof payload === "object" && payload && "message" in payload
          ? (payload as { message?: unknown }).message
          : undefined;

      const method =
        typeof message === "object" && message && "method" in message
          ? (message as { method?: unknown }).method
          : undefined;

      if (method !== "Network.responseReceived") {
        continue;
      }

      const params =
        typeof message === "object" && message && "params" in message
          ? (message as { params?: unknown }).params
          : undefined;
      const response =
        typeof params === "object" && params && "response" in params
          ? (params as { response?: unknown }).response
          : undefined;

      const status =
        typeof response === "object" && response && "status" in response
          ? Number((response as { status?: unknown }).status)
          : NaN;
      const url =
        typeof response === "object" && response && "url" in response
          ? String((response as { url?: unknown }).url ?? "")
          : "";
      const normalizedUrl = url.toLowerCase();

      const isAuthUrl =
        normalizedUrl.includes("custlogin.gm.com") ||
        normalizedUrl.includes("/selfasserted?") ||
        normalizedUrl.includes("errors.edgesuite.net");

      if (isAuthUrl && status >= 400) {
        seleniumLog(
          "access-denied-network-detected",
          `status=${status}, url=${url}`,
        );
        return true;
      }
    }

    return false;
  } catch {
    seleniumLog("access-denied-check-failed");
    return false;
  }
}

async function buildDriver(profilePath?: string): Promise<{
  driver: WebDriver;
  undetected?: UndetectedChromeDriver;
}> {
  const lifecycleEvent = (process.env.npm_lifecycle_event ?? "").toLowerCase();
  const isAuthTestRun =
    lifecycleEvent === "test:auth" || lifecycleEvent === "test:reauth";
  const explicitHeadless = process.env.ONSTARJS_SELENIUM_HEADLESS;

  // Default to headed mode for auth reliability. Tests that exercise real login
  // are also forced headed unless explicitly overridden outside those scripts.
  const headless = isAuthTestRun
    ? false
    : explicitHeadless
      ? explicitHeadless.toLowerCase() === "true"
      : false;
  seleniumLog(
    "driver-config",
    `headless=${headless}, lifecycle=${lifecycleEvent || "n/a"}, authTestRun=${isAuthTestRun}`,
  );

  const chromeArgs = [
    "--disable-dev-shm-usage",
    "--disable-notifications",
    "--disable-popup-blocking",
    "--window-size=1366,900",
  ];

  if (profilePath) {
    chromeArgs.push(`--user-data-dir=${profilePath}`);
  }

  if (headless) {
    chromeArgs.push("--headless=new");
  }
  seleniumLog("driver-args", chromeArgs.join(" "));

  try {
    const Ctor = UndetectedChrome as unknown as UndetectedChromeCtor;
    const undetected = new Ctor({
      headless,
      arguments: chromeArgs,
      windowSize: { width: 1366, height: 900 },
      loggingPrefs: { performance: "ALL", browser: "ALL" },
      "goog:loggingPrefs": { performance: "ALL", browser: "ALL" },
    });

    const driver = await undetected.build();
    seleniumLog("driver-build", "undetected-chromedriver-js");
    return { driver, undetected };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    seleniumLog("driver-build-fallback", `reason=${message}`);
    // Fallback keeps auth available even if undetected-chromedriver setup fails.
    const options = new chrome.Options();
    chromeArgs.forEach((arg) => options.addArguments(arg));
    const prefs = new logging.Preferences();
    prefs.setLevel(logging.Type.PERFORMANCE, logging.Level.ALL);
    prefs.setLevel(logging.Type.BROWSER, logging.Level.ALL);
    options.setLoggingPrefs(prefs);

    const driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();
    seleniumLog("driver-build", "selenium-chrome-fallback");
    return { driver };
  }
}

export async function runSeleniumAuth(
  payload: SeleniumAuthPayload,
): Promise<SeleniumAuthResult> {
  seleniumLog(
    "run-start",
    `url=${payload.authorizationUrl}, userLength=${payload.username.length}, profile=${payload.profilePath ?? "none"}`,
  );
  const { driver, undetected } = await buildDriver(payload.profilePath);

  try {
    seleniumLog("timeouts-configure");
    await driver.manage().setTimeouts({
      pageLoad: 120_000,
      script: 30_000,
      implicit: 500,
    });

    seleniumLog("navigate-start", payload.authorizationUrl);
    const navigatedUrl = await robustNavigateToAuthorizationUrl(
      driver,
      payload.authorizationUrl,
    );
    seleniumLog("navigate-done", navigatedUrl);

    if (await isAccessDenied(driver)) {
      seleniumLog("run-stop", "access denied immediately after navigation");
      return {
        accessDenied: true,
        finalTitle: await driver.getTitle(),
        finalUrl: await driver.getCurrentUrl(),
      };
    }

    const maybeCodeFromInitialUrl = tryExtractAuthCodeFromUrl(
      await driver.getCurrentUrl(),
    );
    if (maybeCodeFromInitialUrl) {
      seleniumLog("auth-code-captured", "from initial URL");
      return {
        authCode: maybeCodeFromInitialUrl,
        finalTitle: await driver.getTitle(),
        finalUrl: await driver.getCurrentUrl(),
      };
    }

    seleniumLog("wait-email-field");
    await driver.wait(async () => {
      return Boolean(await firstVisible(driver, EMAIL_SELECTORS));
    }, 30_000);

    seleniumLog("enter-username");
    await typeFirstVisible(driver, EMAIL_SELECTORS, payload.username);

    const continueClickStartUrl = await driver.getCurrentUrl();
    seleniumLog("click-continue");
    await clickWithStateTransition(
      driver,
      CONTINUE_SELECTORS,
      "continue",
      async () => {
        if (await firstVisible(driver, PASSWORD_SELECTORS)) {
          return true;
        }

        const currentUrl = await driver.getCurrentUrl();
        if (tryExtractAuthCodeFromUrl(currentUrl)) {
          return true;
        }

        return currentUrl !== continueClickStartUrl;
      },
      35_000,
    );

    seleniumLog("wait-password-field");
    await driver.wait(async () => {
      return Boolean(await firstVisible(driver, PASSWORD_SELECTORS));
    }, 30_000);

    seleniumLog("enter-password");
    await typeFirstVisible(driver, PASSWORD_SELECTORS, payload.password);

    const signInClickStartUrl = await driver.getCurrentUrl();
    seleniumLog("click-sign-in");
    await clickWithStateTransition(
      driver,
      SUBMIT_SELECTORS,
      "sign-in",
      async () => {
        const currentUrl = await driver.getCurrentUrl();
        if (currentUrl !== signInClickStartUrl) {
          return true;
        }

        if (tryExtractAuthCodeFromUrl(currentUrl)) {
          return true;
        }

        if (await firstVisible(driver, EMAIL_MFA_CODE_SELECTORS)) {
          return true;
        }

        return isBrowserInternalUrl(currentUrl)
          ? false
          : await isAccessDenied(driver);
      },
      45_000,
    );

    const authDeadline = Date.now() + 5 * 60 * 1000;
    let loopCount = 0;

    while (Date.now() < authDeadline) {
      loopCount += 1;
      if (loopCount % 10 === 0) {
        const remaining = Math.max(0, authDeadline - Date.now());
        seleniumLog(
          "auth-loop",
          `iteration=${loopCount}, remainingMs=${remaining}`,
        );
      }

      if (await isAccessDenied(driver)) {
        seleniumLog("run-stop", "access denied during auth loop");
        return {
          accessDenied: true,
          finalTitle: await driver.getTitle(),
          finalUrl: await driver.getCurrentUrl(),
        };
      }

      const currentUrl = await driver.getCurrentUrl();
      const authCode = tryExtractAuthCodeFromUrl(currentUrl);
      if (authCode) {
        seleniumLog("auth-code-captured", `iteration=${loopCount}`);
        return {
          authCode,
          finalTitle: await driver.getTitle(),
          finalUrl: currentUrl,
        };
      }

      if (loopCount % 3 === 0) {
        const pageCode = await tryExtractAuthCodeFromPage(driver);
        if (pageCode) {
          seleniumLog(
            "auth-code-captured",
            `iteration=${loopCount}, source=page`,
          );
          return {
            authCode: pageCode,
            finalTitle: await driver.getTitle(),
            finalUrl: currentUrl,
          };
        }
      }

      const mfaInput = await firstVisible(driver, EMAIL_MFA_CODE_SELECTORS);
      if (mfaInput) {
        seleniumLog("mfa-detected", `selector=${mfaInput.selector}`);
        const code = await getImapMfaCode();
        seleniumLog("mfa-code-received", `length=${code.length}`);
        await mfaInput.element.clear();
        await mfaInput.element.sendKeys(code);
        seleniumLog("mfa-submit-click");
        const mfaClickStartUrl = await driver.getCurrentUrl();
        await clickWithStateTransition(
          driver,
          EMAIL_MFA_SUBMIT_SELECTORS,
          "mfa-submit",
          async () => {
            const currentUrl = await driver.getCurrentUrl();
            if (tryExtractAuthCodeFromUrl(currentUrl)) {
              return true;
            }

            if (currentUrl !== mfaClickStartUrl) {
              return true;
            }

            return !(await firstVisible(driver, EMAIL_MFA_CODE_SELECTORS));
          },
          45_000,
        );
      }

      await driver.sleep(500);
    }

    seleniumLog("run-timeout", `deadlineMs=${authDeadline}`);
    return {
      finalTitle: await driver.getTitle(),
      finalUrl: await driver.getCurrentUrl(),
    };
  } finally {
    if (undetected) {
      seleniumLog("driver-close", "undetected.quit()");
      await undetected.quit();
    } else {
      seleniumLog("driver-close", "driver.quit()");
      await driver.quit();
    }
  }
}
