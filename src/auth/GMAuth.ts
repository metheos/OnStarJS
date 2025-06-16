// auth/GMAuth.ts
import axios, { AxiosInstance, AxiosResponse } from "axios";
import { CookieJar } from "tough-cookie";
import { HttpCookieAgent, HttpsCookieAgent } from "http-cookie-agent/http";
import * as openidClient from "openid-client";
import { custom } from "openid-client";
import fs from "fs";
import { TOTP } from "totp-generator";
import https from "https";
//import { stringify } from "uuid";
import path from "path";
import jwt from "jsonwebtoken";
import { chromium, Browser, BrowserContext, Page } from "playwright";

// Define an interface for the vehicle structure and the payload containing them
interface Vehicle {
  vin: string;
  per: string;
}

interface DecodedPayload {
  vehs: Vehicle[];
}

interface GMAuthConfig {
  username: string;
  password: string;
  deviceId: string;
  totpKey: string;
  tokenLocation?: string;
}

interface TokenSet {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
}

interface GMAPITokenResponse {
  access_token: string;
  expires_in: number;
  expires_at: number;
  token_type: string;
  scope: string;
  onstar_account_info: OnStarAccountInfo;
  user_info: UserInfo;
  id_token: string;
  expiration: number;
  upgraded: boolean;
}

interface OnStarAccountInfo {
  country_code: string;
  account_no: string;
}
interface UserInfo {
  RemoteUserId: string;
  country: string;
}
export class GMAuth {
  private config: GMAuthConfig;
  private MSTokenPath: string;
  private GMTokenPath: string;
  private oidc: {
    Issuer: typeof openidClient.Issuer;
    generators: typeof openidClient.generators;
  };
  private jar: CookieJar;
  private axiosClient: AxiosInstance;
  private csrfToken: string | null;
  private transId: string | null; // Browser automation properties
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private currentPage: Page | null = null;
  private capturedAuthCode: string | null = null;

  private currentGMAPIToken: GMAPITokenResponse | null = null;
  private debugMode: boolean = true;

  constructor(config: GMAuthConfig) {
    this.config = config;
    this.config.tokenLocation = this.config.tokenLocation ?? "./";
    this.MSTokenPath = path.join(
      this.config.tokenLocation,
      "microsoft_tokens.json",
    );
    this.GMTokenPath = path.join(this.config.tokenLocation, "gm_tokens.json");
    this.oidc = {
      Issuer: openidClient.Issuer,
      generators: openidClient.generators,
    };

    // Define modern cipher suites similar to browsers
    const modernCiphers = [
      "TLS_AES_128_GCM_SHA256",
      "TLS_AES_256_GCM_SHA384",
      "TLS_CHACHA20_POLY1305_SHA256",
      "ECDHE-ECDSA-AES128-GCM-SHA256",
      "ECDHE-RSA-AES128-GCM-SHA256",
      "ECDHE-ECDSA-AES256-GCM-SHA384",
      "ECDHE-RSA-AES256-GCM-SHA384",
      "ECDHE-ECDSA-CHACHA20_POLY1305",
      "ECDHE-RSA-CHACHA20_POLY1305",
      "ECDHE-RSA-AES128-SHA",
      "ECDHE-RSA-AES256-SHA",
      "AES128-GCM-SHA256",
      "AES256-GCM-SHA384",
      "AES128-SHA",
      "AES256-SHA",
    ].join(":");

    // Configure Node.js global HTTPS agent for openid-client
    https.globalAgent.options.ciphers = modernCiphers;
    https.globalAgent.options.minVersion = "TLSv1.2";

    // Create cookie jar with more permissive settings
    this.jar = new CookieJar(undefined, {
      looseMode: true,
      rejectPublicSuffixes: false,
      allowSpecialUseDomain: true,
    });

    this.axiosClient = axios.create({
      httpAgent: new HttpCookieAgent({ cookies: { jar: this.jar } }),
      httpsAgent: new HttpsCookieAgent({
        cookies: { jar: this.jar },
        ciphers: modernCiphers,
        minVersion: "TLSv1.2",
        keepAlive: true,
      }),
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    this.csrfToken = null;
    this.transId = null;
    // Load the current GM API token
    this.loadCurrentGMAPIToken();
  }
  // Browser management methods
  private async initBrowser(): Promise<void> {
    if (this.browser) {
      return; // Browser already initialized
    }

    this.browser = await chromium.launch({
      headless: !this.debugMode, // Show browser when debugging
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
  }
  private async closeBrowser(): Promise<void> {
    if (this.currentPage) {
      await this.currentPage.close();
      this.currentPage = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    // Reset captured auth code when closing browser
    this.capturedAuthCode = null;
  }

  // Enable debug mode to show browser and detailed logging
  public enableDebugMode(): void {
    this.debugMode = true;
  }

  public disableDebugMode(): void {
    this.debugMode = false;
  }

  async authenticate(): Promise<GMAPITokenResponse> {
    try {
      let loadedTokenSet = await this.loadMSToken();
      if (loadedTokenSet !== false) {
        // console.log("Using existing MS tokens");
        return await this.getGMAPIToken(loadedTokenSet);
      }

      // console.log("Performing full authentication");
      await this.doFullAuthSequence();
      loadedTokenSet = await this.loadMSToken();
      if (!loadedTokenSet)
        throw new Error(
          "Failed to load MS token set and could not generate a new one",
        );
      return await this.getGMAPIToken(loadedTokenSet);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.handleRequestError(error);
      } else {
        console.error("Authentication failed:", error);
      }
      throw error;
    }
  }
  async doFullAuthSequence(): Promise<TokenSet> {
    try {
      // Reset any previously captured authorization code
      this.capturedAuthCode = null;

      const { authorizationUrl, code_verifier } =
        await this.startMSAuthorizationFlow();

      // Use browser automation for the initial auth flow
      await this.submitCredentials(authorizationUrl);
      await this.handleMFA();
      const authCode = await this.getAuthorizationCode();
      if (!authCode)
        throw new Error("Failed to get authorization code. Bad TOTP Key?");

      const tokenSet = await this.getMSToken(authCode, code_verifier);
      await this.saveTokens(tokenSet);

      return tokenSet;
    } finally {
      // Always clean up browser resources
      await this.closeBrowser();
    }
  }

  private async saveTokens(tokenSet: TokenSet): Promise<void> {
    // console.log("Saving MS tokens to ", this.MSTokenPath);
    fs.writeFileSync(this.MSTokenPath, JSON.stringify(tokenSet));

    // Save the GM API token as well
    if (this.currentGMAPIToken) {
      const tokenFilePath = this.GMTokenPath; // Define the path for the token file
      // console.log("Saving GM tokens to ", this.GMTokenPath);
      fs.writeFileSync(tokenFilePath, JSON.stringify(this.currentGMAPIToken));
      // console.log("Saved current GM API token to ", tokenFilePath);
    }
  }
  private async getAuthorizationCode(): Promise<string | null> {
    // Return the authorization code captured during the browser flow
    if (this.capturedAuthCode) {
      console.log("Using authorization code captured from browser redirect");
      return this.capturedAuthCode;
    }

    // Fallback to the original HTTP method if browser capture failed
    console.log("Browser capture failed, trying fallback HTTP method");
    const authCodeRequestURL = `https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn/api/SelfAsserted/confirmed?csrf_token=${this.csrfToken}&tx=${this.transId}&p=B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn`;
    try {
      const authResponse =
        await this.captureRedirectLocation(authCodeRequestURL);
      return this.getRegexMatch(authResponse, `code=(.*)`);
    } catch (error) {
      console.error("Fallback HTTP method also failed:", error);
      return null;
    }
  }
  private async handleMFA(): Promise<void> {
    // console.log("Handling MFA via browser automation");

    if (!this.context || !this.currentPage) {
      throw new Error(
        "Browser context and page not initialized - call submitCredentials first",
      );
    }

    const page = this.currentPage;

    try {
      // Wait for the MFA page to load - it should already be there after credential submission
      await page.waitForLoadState("networkidle");

      // Look for MFA elements on the page
      await page.waitForSelector(
        'input[name="otpCode"], input[name="emailMfa"], input[name="strongAuthenticationPhoneNumber"]',
        { timeout: 10000 },
      );

      const pageContent = await page.content();

      // Determine MFA type by checking for specific elements
      let mfaType = null;
      if (
        (await page.locator('input[name="otpCode"]').count()) > 0 ||
        pageContent.includes("otpCode")
      ) {
        mfaType = "TOTP";
      } else if (
        (await page.locator('input[name="emailMfa"]').count()) > 0 ||
        pageContent.includes("emailMfa")
      ) {
        mfaType = "EMAIL";
      } else if (
        (await page
          .locator('input[name="strongAuthenticationPhoneNumber"]')
          .count()) > 0 ||
        pageContent.includes("strongAuthenticationPhoneNumber")
      ) {
        mfaType = "SMS";
      }

      if (mfaType == null) {
        throw new Error("Could not determine MFA Type. Bad email or password?");
      }

      // console.log("MFA Type:", mfaType);
      if (mfaType != "TOTP") {
        throw new Error(
          `Only TOTP via "Third-Party Authenticator" is currently supported by this implementation. Please update your OnStar account to use this method, if possible.`,
        );
      }

      // Generate TOTP code
      var totp_secret = this.config.totpKey.trim();
      // Handle instances where users blindly copy the TOTP link. We can just extract the key.
      if (totp_secret.includes("secret=")) {
        const match = this.getRegexMatch(totp_secret, "secret=(.*?)&");
        totp_secret = match ?? totp_secret;
      }
      if (totp_secret.length != 16) {
        throw new Error(
          "Provided TOTP Key does not meet expected key length. Key should be 16 alphanumeric characters.",
        );
      }

      const { otp } = TOTP.generate(totp_secret, {
        digits: 6,
        algorithm: "SHA-1",
        period: 30,
      });

      // console.log("Submitting OTP Code:", otp);
      // Fill in the OTP code
      const otpField = await page.locator('input[name="otpCode"]').first();
      await otpField.fill(otp);

      // Set up response interceptor to capture the redirect location
      let redirectLocation: string | null = null;

      page.on("response", (response) => {
        const url = response.url();
        if (
          url.includes("/confirmed") &&
          (response.status() === 302 || response.status() === 301)
        ) {
          const location = response.headers()["location"];
          if (location) {
            console.log("Captured redirect location:", location);
            redirectLocation = location;
            // Extract authorization code from the redirect location
            this.capturedAuthCode = this.getRegexMatch(
              location,
              `[?&]code=([^&]*)`,
            );
            if (this.capturedAuthCode) {
              console.log(
                "Successfully extracted authorization code from redirect",
              );
            }
          }
        }
      });

      // Submit the MFA form
      const submitButton = await page
        .locator(
          'button[type="submit"], input[type="submit"], button:has-text("Verify"), button:has-text("Continue"), button:has-text("Submit")',
        )
        .first();
      await submitButton.click();

      // Wait for the MFA submission to complete and capture the redirect
      console.log("Waiting for redirect after MFA submission...");

      // Wait for the response or navigation to complete
      await page.waitForLoadState("networkidle");

      // Give a small delay to ensure the response handler has fired
      await page.waitForTimeout(1000);

      // Check if we captured the authorization code from the response
      if (!this.capturedAuthCode && redirectLocation) {
        // Try to extract again from the captured redirect location
        this.capturedAuthCode = this.getRegexMatch(
          redirectLocation,
          `[?&]code=([^&]*)`,
        );
      }

      // Fallback: check current URL
      if (!this.capturedAuthCode) {
        const currentUrl = page.url();
        console.log("Current URL after MFA:", currentUrl);
        this.capturedAuthCode = this.getRegexMatch(
          currentUrl,
          `[?&]code=([^&]*)`,
        );
      }

      if (this.capturedAuthCode) {
        console.log("Successfully captured authorization code");
      } else {
        console.log(
          "Failed to capture authorization code from browser redirect",
        );
        if (redirectLocation) {
          console.log("Redirect location was:", redirectLocation);
        }
      }

      // Update CSRF token and transaction ID after MFA submission (if still needed)
      const updatedContent = await page.content();
      this.csrfToken = this.getRegexMatch(updatedContent, `\"csrf\":\"(.*?)\"`);
      this.transId = this.getRegexMatch(
        updatedContent,
        `\"transId\":\"(.*?)\"`,
      );

      if (!this.csrfToken || !this.transId) {
        // Try alternative patterns
        this.csrfToken = this.getRegexMatch(
          updatedContent,
          `csrf_token[\"']=[\\"'](.*?)[\\"']`,
        );
        this.transId = this.getRegexMatch(
          updatedContent,
          `tx[\"']=[\\"'](.*?)[\\"']`,
        );
      }

      // Sync cookies from browser to axios client for subsequent API calls
      await this.syncCookiesFromBrowser();
    } finally {
      // Close the page after MFA is complete
      await page.close();
      this.currentPage = null;
    }
  }

  private async syncCookiesFromBrowser(): Promise<void> {
    if (!this.context) return;

    // Get all cookies from the browser context
    const cookies = await this.context.cookies();

    // Add each cookie to the tough-cookie jar
    for (const cookie of cookies) {
      const cookieString = `${cookie.name}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}`;
      try {
        await this.jar.setCookie(cookieString, `https://${cookie.domain}`);
      } catch (error) {
        // Skip cookies that can't be set (e.g., invalid format)
        console.warn(`Failed to sync cookie ${cookie.name}:`, error);
      }
    }
  }
  private async submitCredentials(authorizationUrl: string): Promise<void> {
    // console.log("Sending GM login credentials via browser automation");

    // Initialize browser if not already done
    await this.initBrowser();
    if (!this.context) {
      throw new Error("Browser context not initialized");
    }

    const page = await this.context.newPage();

    try {
      // Navigate to the authorization URL
      console.log("Navigating to:", authorizationUrl);
      await page.goto(authorizationUrl, { waitUntil: "networkidle" });

      // Debug: Check what's actually on the page
      const pageTitle = await page.title();
      console.log("Page title:", pageTitle);

      const pageUrl = page.url();
      console.log("Current URL:", pageUrl);

      // Take a screenshot for debugging (optional)
      // await page.screenshot({ path: 'debug-login-page.png' });

      // Check for various possible email input selectors
      const emailSelectors = [
        'input[type="email"]#logonIdentifier',
        'input[name="Sign in name"]',
        "input#logonIdentifier",
        'input[type="email"]',
        'input[name="logonIdentifier"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="Email" i]',
      ];

      let emailField = null;
      let foundSelector = "";

      // Try each selector until we find one that works
      for (const selector of emailSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          emailField = page.locator(selector).first();
          foundSelector = selector;
          console.log("Found email field with selector:", selector);
          break;
        } catch (e) {
          console.log("Selector not found:", selector);
        }
      }

      if (!emailField) {
        // Debug: Print all input elements on the page
        const allInputs = await page.locator("input").all();
        console.log("All input elements found:");
        for (let i = 0; i < allInputs.length; i++) {
          const input = allInputs[i];
          const type = await input.getAttribute("type");
          const id = await input.getAttribute("id");
          const name = await input.getAttribute("name");
          const placeholder = await input.getAttribute("placeholder");
          console.log(
            `Input ${i}: type="${type}", id="${id}", name="${name}", placeholder="${placeholder}"`,
          );
        }
        throw new Error("Could not find email input field on the page");
      }

      // Step 1: Enter email and click Continue
      console.log("Filling email field with selector:", foundSelector);
      await emailField.fill(this.config.username);

      // Look for continue button
      const continueSelectors = [
        'button#continue:has-text("Continue")',
        "button#continue",
        'button:has-text("Continue")',
        'button[type="button"]:has-text("Continue")',
        'input[type="submit"]',
        'button[type="submit"]',
      ];

      let continueButton = null;
      let foundContinueSelector = "";

      for (const selector of continueSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          continueButton = page.locator(selector).first();
          foundContinueSelector = selector;
          console.log("Found continue button with selector:", selector);
          break;
        } catch (e) {
          console.log("Continue selector not found:", selector);
        }
      }

      if (!continueButton) {
        // Debug: Print all button elements
        const allButtons = await page.locator("button").all();
        console.log("All button elements found:");
        for (let i = 0; i < allButtons.length; i++) {
          const button = allButtons[i];
          const text = await button.textContent();
          const id = await button.getAttribute("id");
          const type = await button.getAttribute("type");
          console.log(
            `Button ${i}: text="${text}", id="${id}", type="${type}"`,
          );
        }
        throw new Error("Could not find continue button on the page");
      }

      console.log("Clicking continue button");
      await continueButton.click();

      // Wait for the password page to load
      await page.waitForLoadState("networkidle");
      console.log("Navigated to password page, URL:", page.url());

      // Step 2: Enter password and click Log In
      const passwordSelectors = [
        'input[type="password"]#password',
        "input#password",
        'input[type="password"]',
        'input[name="Password"]',
      ];

      let passwordField = null;
      let foundPasswordSelector = "";

      for (const selector of passwordSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          passwordField = page.locator(selector).first();
          foundPasswordSelector = selector;
          console.log("Found password field with selector:", selector);
          break;
        } catch (e) {
          console.log("Password selector not found:", selector);
        }
      }

      if (!passwordField) {
        throw new Error("Could not find password input field on the page");
      }

      console.log("Filling password field");
      await passwordField.fill(this.config.password);

      // Look for login button
      const loginSelectors = [
        'button#continue:has-text("Log In")',
        'button#continue:has-text("Sign in")',
        "button#continue",
        'button:has-text("Log In")',
        'button:has-text("Sign in")',
        'button[type="button"]:has-text("Log In")',
        'input[type="submit"]',
        'button[type="submit"]',
      ];

      let loginButton = null;

      for (const selector of loginSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          loginButton = page.locator(selector).first();
          console.log("Found login button with selector:", selector);
          break;
        } catch (e) {
          console.log("Login selector not found:", selector);
        }
      }

      if (!loginButton) {
        throw new Error("Could not find login button on the page");
      }

      console.log("Clicking login button");
      await loginButton.click();

      // Wait for navigation to MFA page
      await page.waitForLoadState("networkidle");
      console.log("Navigated to MFA page, URL:", page.url());

      // Extract CSRF token and transaction ID from the page content
      const pageContent = await page.content();
      this.csrfToken = this.getRegexMatch(pageContent, `\"csrf\":\"(.*?)\"`);
      this.transId = this.getRegexMatch(pageContent, `\"transId\":\"(.*?)\"`);

      if (!this.csrfToken || !this.transId) {
        // Try alternative patterns for CSRF and transaction ID
        this.csrfToken = this.getRegexMatch(
          pageContent,
          `csrf_token[\"']=[\\"'](.*?)[\\"']`,
        );
        this.transId = this.getRegexMatch(
          pageContent,
          `tx[\"']=[\\"'](.*?)[\\"']`,
        );
      }

      console.log("CSRF Token:", this.csrfToken ? "Found" : "Not found");
      console.log("Transaction ID:", this.transId ? "Found" : "Not found");

      if (!this.csrfToken || !this.transId) {
        console.log("Page content preview:", pageContent.substring(0, 500));
        throw new Error(
          "Failed to extract csrf token or transId after credential submission",
        );
      }

      // Store the page for MFA use - don't close it yet
      this.currentPage = page;
    } catch (error) {
      console.error("Error in submitCredentials:", error);
      await page.close();
      throw error;
    }
  }

  static GMAuthTokenIsValid(authToken: GMAPITokenResponse): boolean {
    return authToken.expires_at > Date.now() + 5 * 60 * 1000;
  }

  private async loadCurrentGMAPIToken(): Promise<void> {
    // console.log("Loading existing GM API token, if it exists.");
    const tokenFilePath = this.GMTokenPath; // Define the path for the token file

    if (fs.existsSync(tokenFilePath)) {
      try {
        const storedToken = JSON.parse(
          fs.readFileSync(tokenFilePath, "utf-8"),
        ) as GMAPITokenResponse;

        // Decode the JWT payload
        const decodedPayload = jwt.decode(storedToken.access_token);

        // Check if the stored token is for this user's account
        if (
          !decodedPayload ||
          (decodedPayload as any).uid.toUpperCase() !==
            this.config.username.toUpperCase()
        ) {
          console.log(
            "Stored GM API token was for different user, getting new token",
          );
        } else {
          const now = Math.floor(Date.now() / 1000);

          // Check if the token is still valid
          if (storedToken.expires_at && storedToken.expires_at > now + 5 * 60) {
            // console.log("GM expires at: ", storedToken.expires_at, " now: ", now);
            // console.log("Loaded existing GM API token");
            this.currentGMAPIToken = storedToken;
          } else {
            // console.log("Existing GM API token has expired");
          }
        }
      } catch (err) {
        console.log("Stored GM API token was not parseable, getting new token");
      }
    } else {
      // console.log("No existing GM API token, we'll get a new one.");
    }
  }

  private async getGMAPIToken(tokenSet: TokenSet): Promise<GMAPITokenResponse> {
    // Check if we already have a valid token
    const now = Math.floor(Date.now() / 1000);
    if (
      this.currentGMAPIToken &&
      this.currentGMAPIToken.expires_at > now + 5 * 60
    ) {
      // console.log("Returning existing GM API token");
      return this.currentGMAPIToken;
    }

    // console.log("Requesting GM API Token using MS Access Token");
    const url = "https://na-mobile-api.gm.com/sec/authz/v3/oauth/token";

    try {
      const response = await this.axiosClient.post<GMAPITokenResponse>(
        url,
        {
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: tokenSet.access_token,
          subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
          scope: "msso role_owner priv onstar gmoc user user_trailer",
          device_id: this.config.deviceId,
        },
        {
          withCredentials: true,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            accept: "application/json",
          },
        },
      );

      // Decode the JWT payload
      const decodedPayload = jwt.decode(
        response.data.access_token,
      ) as DecodedPayload;
      if (!decodedPayload?.vehs) {
        // Delete the tokens and start over
        console.log(
          "Returned GM API token was missing vehicle information. Deleting existing tokens for reauth.",
        );
        if (fs.existsSync(this.MSTokenPath)) {
          fs.renameSync(this.MSTokenPath, `${this.MSTokenPath}.old`);
        }
        if (fs.existsSync(this.GMTokenPath)) {
          fs.renameSync(this.GMTokenPath, `${this.GMTokenPath}.old`);
        }
        // Clear current token in memory and recursively call authenticate()
        this.currentGMAPIToken = null;
        return await this.authenticate();
      }

      const expires_at =
        Math.floor(Date.now() / 1000) +
        parseInt(response.data.expires_in.toString());
      response.data.expires_in = parseInt(response.data.expires_in.toString());
      response.data.expires_at = expires_at;
      // console.log(JSON.stringify(response.data));
      // console.log("GM Says we expire in ", response.data.expires_in);
      // console.log("Set GM Token expiration to ", expires_at);

      // Store the new token
      this.currentGMAPIToken = response.data;
      this.saveTokens(tokenSet);

      return response.data;
    } catch (error: any) {
      if (error.response) {
        console.error(
          `GM API Token Error ${error.response.status}: ${error.response.statusText}`,
        );
        console.error("Error details:", error.response.data);
        if (error.response.status === 401) {
          console.error(
            "Token exchange failed. MS Access token may be invalid.",
          );
        }
      } else if (error.request) {
        console.error("No response received from GM API");
        console.error(error.request);
      } else {
        console.error("Request Error:", error.message);
      }
      throw error;
    }
  }

  // Add this method to manually extract and add cookies from response headers
  private processCookieHeaders(response: AxiosResponse, url: string): void {
    const setCookieHeaders = response.headers["set-cookie"];
    if (setCookieHeaders && Array.isArray(setCookieHeaders)) {
      setCookieHeaders.forEach((cookieString) => {
        const parsedUrl = new URL(url);
        try {
          // Use setCookieSync to handle each Set-Cookie header
          this.jar.setCookieSync(cookieString, parsedUrl.origin);
          if (this.debugMode) {
            console.log(`Added cookie: ${cookieString.split(";")[0]}`);
          }
        } catch (error) {
          console.error(`Failed to add cookie: ${error}`);
        }
      });
    }
  }

  private async getRequest(url: string): Promise<AxiosResponse> {
    try {
      // Get cookies for this URL before the request
      const cookieStringBefore = await this.jar.getCookieString(url);

      if (this.debugMode) {
        console.log("Cookies before GET:", cookieStringBefore);
        console.log("GET URL:", url);
      }

      const response = await this.axiosClient.get(url, {
        withCredentials: true,
        maxRedirects: 0,
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en-US,en;q=0.9",
          Connection: "keep-alive",
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.6 Mobile/15E148 Safari/604.1",
          ...(cookieStringBefore && { Cookie: cookieStringBefore }),
        },
      });

      // Process and store cookies from the response
      this.processCookieHeaders(response, url);

      if (this.debugMode) {
        console.log(
          "Set-Cookie headers after GET:",
          response.headers["set-cookie"],
        );
        console.log(
          "Current cookies after GET:",
          await this.jar.getCookieString(url),
        );

        // Also check for cookies for the domain
        const domain = new URL(url).hostname;
        console.log(
          `Cookies for domain ${domain}:`,
          await this.jar.getCookieString(`https://${domain}/`),
        );
      }

      return response;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        this.handleRequestError(error);
      } else {
        console.error("GET Request failed:", error);
      }
      return error.response;
    }
  }

  private async postRequest(
    url: string,
    postData: any,
    csrfToken: string | null,
  ): Promise<AxiosResponse> {
    try {
      // Properly serialize form data
      const formData = new URLSearchParams();
      for (const [key, value] of Object.entries(postData)) {
        formData.append(key, value as string);
      }

      // Get cookies for the specific URL and also for the base domain
      const urlObj = new URL(url);
      const domain = urlObj.hostname;

      // Try to get cookies from both URL path and root path
      const cookieString = await this.jar.getCookieString(url);
      const domainCookieString = await this.jar.getCookieString(
        `https://${domain}/`,
      );

      // Combine cookie strings if they're different
      const combinedCookies =
        cookieString !== domainCookieString
          ? `${cookieString}; ${domainCookieString}`.replace(/;\s+;/g, "; ")
          : cookieString;

      if (this.debugMode) {
        console.log("POST URL:", url);
        console.log("Cookies before POST (URL):", cookieString);
        console.log("Cookies before POST (domain):", domainCookieString);
        console.log("Combined cookies:", combinedCookies);
        console.log("POST data:", postData);
      }

      const response = await this.axiosClient.post(url, formData.toString(), {
        withCredentials: true,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "en-US,en;q=0.9",
          Origin: "https://custlogin.gm.com",
          "x-csrf-token": csrfToken,
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.6 Mobile/15E148 Safari/604.1",
          "X-Requested-With": "XMLHttpRequest",
          "Accept-Encoding": "gzip, deflate, br",
          Connection: "keep-alive",
          // Using the combined cookies
          ...(combinedCookies && { Cookie: combinedCookies }),
        },
      });

      // Process and store cookies from the response
      this.processCookieHeaders(response, url);

      if (this.debugMode) {
        console.log(
          "Set-Cookie headers after POST:",
          response.headers["set-cookie"],
        );
        console.log(
          "Current cookies after POST:",
          await this.jar.getCookieString(url),
        );
      }

      return response;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        this.handleRequestError(error);
      } else {
        console.error("POST Request failed:", error);
      }
      return error.response;
    }
  }

  private handleRequestError(error: any): void {
    console.log("reqer");
    if (error.response) {
      console.error(
        `HTTP Error ${error.response.status}: ${error.response.statusText}`,
      );
      console.debug("Response data:", error.response.data);
      if (error.response.status === 401) {
        console.error("Authentication failed. Please check your credentials.");
      }
    } else if (error.request) {
      console.error("No response received from server");
      console.debug(error.request);
    } else {
      console.error("Request Error:", error.message);
    }
  }

  private getRegexMatch(haystack: string, regexString: string): string | null {
    const re = new RegExp(regexString);
    const r = haystack.match(re);
    return r ? r[1] : null;
  }

  private async captureRedirectLocation(url: string): Promise<string> {
    try {
      // Get cookies for this URL before the request
      const cookieStringBefore = await this.jar.getCookieString(url);

      if (this.debugMode) {
        console.log("Cookies before redirect capture:", cookieStringBefore);
        console.log("Redirect capture URL:", url);
      }

      const response = await this.axiosClient.get(url, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "en-US,en;q=0.9",
          Connection: "keep-alive",
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.6 Mobile/15E148 Safari/604.1",
          ...(cookieStringBefore && { Cookie: cookieStringBefore }),
        },
      });

      // Process and store cookies from the response
      this.processCookieHeaders(response, url);

      if (this.debugMode) {
        console.log(
          "Set-Cookie headers after redirect capture:",
          response.headers["set-cookie"],
        );
        console.log(
          "Current cookies after redirect capture:",
          await this.jar.getCookieString(url),
        );

        // Check for domain cookies too
        const domain = new URL(url).hostname;
        console.log(
          `Cookies for domain ${domain}:`,
          await this.jar.getCookieString(`https://${domain}/`),
        );
      }

      if (response.status === 302) {
        const redirectLocation = response.headers["location"];
        if (!redirectLocation) {
          throw new Error("No redirect location found in response headers");
        }
        return redirectLocation;
      }

      throw new Error(`Unexpected response status: ${response.status}`);
    } catch (error: any) {
      this.handleRequestError(error);
      throw error;
    }
  }

  private async setupOpenIDClient(): Promise<openidClient.Client> {
    // Hard-coded fallback configuration with required endpoints
    const fallbackConfig = {
      issuer:
        "https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/b2c_1a_seamless_mobile_signuporsignin/v2.0/",
      authorization_endpoint:
        "https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/b2c_1a_seamless_mobile_signuporsignin/v2.0/authorize",
      token_endpoint:
        "https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/b2c_1a_seamless_mobile_signuporsignin/v2.0/token",
      jwks_uri:
        "https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/b2c_1a_seamless_mobile_signuporsignin/discovery/v2.0/keys",
      response_types_supported: ["code", "id_token", "code id_token"],
      response_modes_supported: ["query", "fragment", "form_post"],
      grant_types_supported: [
        "authorization_code",
        "implicit",
        "refresh_token",
      ],
      subject_types_supported: ["pairwise"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid"],
    };

    let issuer: openidClient.Issuer | null = null;

    try {
      // Try direct discovery first
      const discoveryUrl =
        "https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/b2c_1a_seamless_mobile_signuporsignin/v2.0/.well-known/openid-configuration";

      if (this.debugMode) {
        console.log("Attempting OpenID discovery from:", discoveryUrl);
      }

      const response = await axios.get(discoveryUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.6 Mobile/15E148 Safari/604.1",
        },
        timeout: 10000,
      });

      // Use the discovery data but merge with fallback to ensure required fields
      const discoveredConfig = response.data;

      // Create issuer with combined configuration
      issuer = new this.oidc.Issuer({
        ...fallbackConfig,
        ...discoveredConfig,
        // Ensure these critical endpoints are defined
        authorization_endpoint:
          discoveredConfig.authorization_endpoint ||
          fallbackConfig.authorization_endpoint,
        token_endpoint:
          discoveredConfig.token_endpoint || fallbackConfig.token_endpoint,
        jwks_uri: discoveredConfig.jwks_uri || fallbackConfig.jwks_uri,
      });

      if (this.debugMode) {
        console.log("Successfully created issuer with discovery data");
      }
    } catch (error) {
      console.warn(
        "OpenID discovery failed, using fallback configuration",
        error,
      );

      // Create issuer using fallback configuration
      issuer = new this.oidc.Issuer(fallbackConfig);

      if (this.debugMode) {
        console.log("Created issuer with fallback configuration");
      }
    }

    if (!issuer) {
      throw new Error("Failed to create OpenID issuer");
    }

    // Verify the critical endpoint is available
    if (!issuer.authorization_endpoint) {
      throw new Error(
        "Issuer missing authorization_endpoint even after fallback",
      );
    }

    // Create client
    const client = new issuer.Client({
      client_id: "3ff30506-d242-4bed-835b-422bf992622e",
      redirect_uris: ["msauth.com.gm.myChevrolet://auth"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });

    client[custom.clock_tolerance] = 5; // to allow a 5 second skew

    return client;
  }

  private async startMSAuthorizationFlow(): Promise<{
    authorizationUrl: string;
    code_verifier: string;
  }> {
    // console.log("Starting PKCE auth");
    const client = await this.setupOpenIDClient();
    const code_verifier = this.oidc.generators.codeVerifier();
    const code_challenge = this.oidc.generators.codeChallenge(code_verifier);

    const state = this.oidc.generators.nonce();
    // const nonce = this.oidc.generators.nonce();
    const authorizationUrl = client.authorizationUrl({
      scope:
        "https://gmb2cprod.onmicrosoft.com/3ff30506-d242-4bed-835b-422bf992622e/Test.Read openid profile offline_access",
      code_challenge,
      code_challenge_method: "S256",
      bundleID: "com.gm.myChevrolet",
      client_id: "3ff30506-d242-4bed-835b-422bf992622e",
      mode: "dark",
      evar25:
        "mobile_mychevrolet_chevrolet_us_app_launcher_sign_in_or_create_account",
      channel: "lightreg",
      ui_locales: "en-US",
      brand: "chevrolet",
      // nonce,
      state,
    });

    return { authorizationUrl, code_verifier };
  }

  private async getMSToken(
    code: string,
    code_verifier: string,
  ): Promise<TokenSet> {
    const client = await this.setupOpenIDClient();

    try {
      const openIdTokenSet = await client.callback(
        "msauth.com.gm.myChevrolet://auth",
        { code },
        { code_verifier },
      );

      // Validate that we received the required tokens
      if (!openIdTokenSet.access_token) {
        throw new Error(
          "No access token received from authentication provider",
        );
      }

      // Convert the openid-client TokenSet to our TokenSet format
      const tokenSet: TokenSet = {
        access_token: openIdTokenSet.access_token,
        // Only include optional properties if they exist
        ...(openIdTokenSet.id_token && { id_token: openIdTokenSet.id_token }),
        ...(openIdTokenSet.refresh_token && {
          refresh_token: openIdTokenSet.refresh_token,
        }),
        ...(openIdTokenSet.expires_at && {
          expires_at: openIdTokenSet.expires_at,
        }),
        ...(openIdTokenSet.expires_in && {
          expires_in: openIdTokenSet.expires_in,
        }),
      };

      // console.log("Access Token:", tokenSet.access_token);
      // console.log("ID Token:", tokenSet.id_token);

      return tokenSet;
    } catch (err) {
      console.error("Failed to obtain access token:", err);
      throw err;
    }
  }

  private async loadMSToken(): Promise<TokenSet | false> {
    // console.log("Loading existing MS tokens, if they exist.");
    let tokenSet: TokenSet;

    if (fs.existsSync(this.MSTokenPath)) {
      let storedTokens = null;
      try {
        storedTokens = JSON.parse(
          fs.readFileSync(this.MSTokenPath, "utf-8"),
        ) as TokenSet;
      } catch (err) {
        console.log("Stored MS token was not parseable, getting new token");
        return false;
      }

      // Decode the JWT payload
      const decodedPayload = jwt.decode(storedTokens.access_token);
      if (
        !decodedPayload ||
        ((decodedPayload as any).name.toUpperCase() !==
          this.config.username.toUpperCase() &&
          (decodedPayload as any).email.toUpperCase() !==
            this.config.username.toUpperCase())
      ) {
        console.log(
          "Stored MS token was for different user, getting new token",
        );
        return false;
      }

      const now = Math.floor(Date.now() / 1000);

      if (storedTokens.expires_at && storedTokens.expires_at > now + 5 * 60) {
        // console.log("MS Access token is still valid");
        // console.log("MS expires at: ", storedTokens.expires_at, " now: ", now);
        tokenSet = storedTokens;
      } else if (storedTokens.refresh_token) {
        // console.log("Refreshing MS access token");
        const client = await this.setupOpenIDClient();
        const refreshedTokens = await client.refresh(
          storedTokens.refresh_token,
        );

        // Verify that the refreshed tokens contain the required access_token
        if (!refreshedTokens.access_token) {
          throw new Error("Refresh token response missing access_token");
        }

        // Create a valid TokenSet object
        tokenSet = {
          access_token: refreshedTokens.access_token,
          refresh_token: refreshedTokens.refresh_token,
          id_token: refreshedTokens.id_token,
          expires_in: refreshedTokens.expires_in,
          expires_at: refreshedTokens.expires_at,
        };

        // console.log("Saving current MS tokens to ", this.MSTokenPath);
        fs.writeFileSync(this.MSTokenPath, JSON.stringify(tokenSet));
      } else {
        throw new Error("Token expired and no refresh token available.");
      }
      return tokenSet;
    }

    return false;
  }
}

interface AuthConfig {
  username: string | undefined;
  password: string | undefined;
  deviceId: string | undefined;
  totpKey: string | undefined;
  tokenLocation?: string | undefined;
}

export async function getGMAPIJWT(config: AuthConfig) {
  if (
    !config.username ||
    !config.password ||
    !config.deviceId ||
    !config.totpKey
  ) {
    throw new Error("Missing required configuration parameters");
  }

  config.tokenLocation = config.tokenLocation ?? "./";

  const auth = new GMAuth(config as GMAuthConfig);
  const token = await auth.authenticate();
  // Decode the JWT payload
  const decodedPayload = jwt.decode(token.access_token) as DecodedPayload;
  return {
    token,
    auth,
    decodedPayload,
  };
}
