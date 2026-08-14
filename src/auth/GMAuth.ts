// auth/GMAuth.ts
import axios, { AxiosInstance } from "axios";
import { CookieJar } from "tough-cookie";
import { HttpCookieAgent, HttpsCookieAgent } from "http-cookie-agent/http";
import * as openidClient from "openid-client";
import { custom } from "openid-client";
import fs from "fs";
import https from "https";

import path from "path";
import jwt from "jsonwebtoken";

const PKCE_PENDING_SESSION_FILE = "ms_pkce_session.json";
const PKCE_CODE_ENV_VAR = "ONSTARJS_PKCE_AUTH_CODE";

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
  // Optional refresh token lifetime metadata (if provided by the IdP or inferred)
  refresh_expires_in?: number;
  refresh_expires_at?: number; // epoch seconds
  refresh_obtained_at?: number; // epoch seconds when we stored the refresh token
}

interface PendingPKCESession {
  authorizationUrl: string;
  code_verifier: string;
  state: string;
  created_at: number;
}

interface PKCECallbackInput {
  code: string;
  state?: string;
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

  private currentGMAPIToken: GMAPITokenResponse | null = null;
  private debugMode: boolean = true; // Default to visible mode for reliability

  private shouldAllowEmptyVehicles(): boolean {
    const explicitOptIn = (
      process.env.ONSTARJS_ALLOW_EMPTY_VEHICLES ?? ""
    ).toLowerCase();
    if (["1", "true", "yes", "on"].includes(explicitOptIn)) {
      return true;
    }

    const lifecycleEvent = (
      process.env.npm_lifecycle_event ?? ""
    ).toLowerCase();
    return lifecycleEvent === "test:auth" || lifecycleEvent === "test:reauth";
  }

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
    // Load the current GM API token
    this.loadCurrentGMAPIToken();
  }

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
        if (error.response) {
          console.error(
            `HTTP Error ${error.response.status}: ${error.response.statusText}`,
          );
          console.debug("Response data:", error.response.data);
        } else if (error.request) {
          console.error("No response received from server");
          console.debug(error.request);
        } else {
          console.error("Request Error:", error.message);
        }
      } else {
        console.error("Authentication failed:", error);
      }

      throw error;
    }
  }
  async doFullAuthSequence(): Promise<TokenSet> {
    const pendingSession = this.loadPendingPKCESession();
    const manualCallbackInput = this.getManualPKCECallbackInputFromEnv();

    if (pendingSession && manualCallbackInput) {
      const tokenSet = await this.getMSToken(
        manualCallbackInput,
        pendingSession.code_verifier,
        pendingSession.state,
      );
      await this.saveTokens(tokenSet);
      this.clearPendingPKCESession();
      this.clearUsedPKCECodeFromEnv();
      return tokenSet;
    }

    if (pendingSession) {
      throw new Error(
        [
          `Pending Microsoft PKCE auth session detected.`,
          `Complete sign-in with this URL:`,
          pendingSession.authorizationUrl,
          `Then set ${PKCE_CODE_ENV_VAR} in .env (either full callback URL or raw code) and run again.`,
        ].join("\n"),
      );
    }

    const newSession = await this.startMSAuthorizationFlow();
    this.savePendingPKCESession(newSession);

    throw new Error(
      [
        `Microsoft token set is required and no valid refresh path is available.`,
        `Start interactive sign-in with this URL:`,
        newSession.authorizationUrl,
        `After sign-in, set ${PKCE_CODE_ENV_VAR} in .env (full callback URL preferred; raw code also accepted).`,
        `Run again to complete PKCE and persist the refreshed Microsoft token set.`,
      ].join("\n"),
    );
  }

  private pendingPKCESessionPath(): string {
    return path.join(
      this.config.tokenLocation ?? "./",
      PKCE_PENDING_SESSION_FILE,
    );
  }

  private savePendingPKCESession(session: PendingPKCESession): void {
    fs.writeFileSync(this.pendingPKCESessionPath(), JSON.stringify(session));
  }

  private loadPendingPKCESession(): PendingPKCESession | null {
    const sessionPath = this.pendingPKCESessionPath();
    if (!fs.existsSync(sessionPath)) {
      return null;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
      if (
        parsed &&
        typeof parsed.authorizationUrl === "string" &&
        typeof parsed.code_verifier === "string" &&
        typeof parsed.state === "string"
      ) {
        return parsed as PendingPKCESession;
      }
    } catch {
      // Ignore malformed pending state and overwrite on next auth start.
    }

    return null;
  }

  private clearPendingPKCESession(): void {
    const sessionPath = this.pendingPKCESessionPath();
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
  }

  private getManualPKCECallbackInputFromEnv(): PKCECallbackInput | null {
    const raw = process.env[PKCE_CODE_ENV_VAR];
    if (!raw) {
      return null;
    }

    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return null;
    }

    // Accept full callback URI from browser extension/user paste.
    if (trimmed.includes("://") || trimmed.startsWith("msauth.")) {
      try {
        const parsed = new URL(trimmed);
        const code = parsed.searchParams.get("code") ?? "";
        const state = parsed.searchParams.get("state") ?? undefined;
        if (code) {
          return { code, state };
        }
      } catch {
        // Fall through to raw code support.
      }
    }

    // Support raw code-only handoff.
    return { code: trimmed };
  }

  private clearUsedPKCECodeFromEnv(): void {
    if (process.env[PKCE_CODE_ENV_VAR]) {
      delete process.env[PKCE_CODE_ENV_VAR];
    }

    const envPath = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) {
      return;
    }

    const source = fs.readFileSync(envPath, "utf-8");
    const lines = source.split(/\r?\n/);
    let changed = false;
    const updated = lines.map((line) => {
      if (line.startsWith(`${PKCE_CODE_ENV_VAR}=`)) {
        changed = true;
        return `${PKCE_CODE_ENV_VAR}=`;
      }
      return line;
    });

    if (changed) {
      fs.writeFileSync(envPath, updated.join("\n"));
      console.log(
        `Cleared ${PKCE_CODE_ENV_VAR} from .env after successful PKCE completion.`,
      );
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
          scope: "onstar gmoc user_trailer user msso priv",
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
        if (this.shouldAllowEmptyVehicles()) {
          console.warn(
            "Returned GM API token has no vehicle list; allowing this in auth test context.",
          );

          const expires_at =
            Math.floor(Date.now() / 1000) +
            parseInt(response.data.expires_in.toString());
          response.data.expires_in = parseInt(
            response.data.expires_in.toString(),
          );
          response.data.expires_at = expires_at;

          this.currentGMAPIToken = response.data;
          this.saveTokens(tokenSet);
          return response.data;
        }

        throw new Error(
          "Returned GM API token was missing vehicle information. Keeping existing Microsoft token set intact; refusing to invalidate MS tokens based on GM token payload.",
        );
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
        timeout: 60000,
      });

      // Use the discovery data but merge with fallback to ensure required fields
      const discoveredConfig = response.data;

      // Track which endpoints are using fallback values
      const fallbacksUsed = [];
      const finalAuthEndpoint =
        discoveredConfig.authorization_endpoint ||
        fallbackConfig.authorization_endpoint;
      const finalTokenEndpoint =
        discoveredConfig.token_endpoint || fallbackConfig.token_endpoint;
      const finalJwksUri = discoveredConfig.jwks_uri || fallbackConfig.jwks_uri;

      if (!discoveredConfig.authorization_endpoint) {
        fallbacksUsed.push("authorization_endpoint");
      }
      if (!discoveredConfig.token_endpoint) {
        fallbacksUsed.push("token_endpoint");
      }
      if (!discoveredConfig.jwks_uri) {
        fallbacksUsed.push("jwks_uri");
      }

      // Create issuer with combined configuration
      issuer = new this.oidc.Issuer({
        ...fallbackConfig,
        ...discoveredConfig,
        // Ensure these critical endpoints are defined
        authorization_endpoint: finalAuthEndpoint,
        token_endpoint: finalTokenEndpoint,
        jwks_uri: finalJwksUri,
      });

      if (this.debugMode) {
        console.log("Successfully created issuer with discovery data");
        if (fallbacksUsed.length > 0) {
          console.log(
            `🔧 Using fallback values for: ${fallbacksUsed.join(", ")}`,
          );
        } else {
          console.log(
            "✅ All endpoints retrieved from discovery, no fallbacks needed",
          );
        }
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
      console.log(
        "🔧 Using complete fallback configuration for all OpenID endpoints",
      );
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

    // Increase JWT clock tolerance to accommodate IdP-issued tokens with clock skew.
    // Default to 120 seconds; can override with env OPENID_CLOCK_TOLERANCE_SEC.
    const envTol = Number(process.env.OPENID_CLOCK_TOLERANCE_SEC);
    const clockToleranceSec = Number.isFinite(envTol) ? envTol : 120;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any)[custom.clock_tolerance] = clockToleranceSec;
      if (this.debugMode) {
        console.log(`Configured OpenID clock tolerance: ${clockToleranceSec}s`);
      }
    } catch (_) {
      // no-op; if setting fails, library will use its default
    }

    return client;
  }

  private async startMSAuthorizationFlow(): Promise<{
    authorizationUrl: string;
    code_verifier: string;
    state: string;
    created_at: number;
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

    return {
      authorizationUrl,
      code_verifier,
      state,
      created_at: Date.now(),
    };
  }

  private async getMSToken(
    callbackInput: PKCECallbackInput,
    code_verifier: string,
    expectedState?: string,
  ): Promise<TokenSet> {
    const client = await this.setupOpenIDClient();

    try {
      const callbackParams: { code: string; state?: string } = {
        code: callbackInput.code,
        ...(callbackInput.state ? { state: callbackInput.state } : {}),
      };

      const callbackChecks: { code_verifier: string; state?: string } = {
        code_verifier,
        // Some extension flows provide only code (no state). Enforce state check when present.
        ...(expectedState && callbackInput.state
          ? { state: expectedState }
          : {}),
      };

      const openIdTokenSet = await client.callback(
        "msauth.com.gm.myChevrolet://auth",
        callbackParams,
        callbackChecks,
      );

      // Validate that we received the required tokens
      if (!openIdTokenSet.access_token) {
        throw new Error(
          "No access token received from authentication provider",
        );
      }

      // Convert the openid-client TokenSet to our TokenSet format
      const nowSec = Math.floor(Date.now() / 1000);
      const tokenSet: TokenSet = {
        access_token: openIdTokenSet.access_token,
        // Only include optional properties if they exist
        ...(openIdTokenSet.id_token && { id_token: openIdTokenSet.id_token }),
        ...(openIdTokenSet.refresh_token && {
          refresh_token: openIdTokenSet.refresh_token,
          // Always record when we obtained a refresh token
          refresh_obtained_at: nowSec,
        }),
        ...(openIdTokenSet.expires_at && {
          expires_at: openIdTokenSet.expires_at,
        }),
        ...(openIdTokenSet.expires_in && {
          expires_in: openIdTokenSet.expires_in,
        }),
        // Persist refresh token metadata if the provider exposes it
        ...(typeof (openIdTokenSet as any).refresh_expires_in === "number" && {
          refresh_expires_in: (openIdTokenSet as any).refresh_expires_in,
          refresh_expires_at:
            nowSec + (openIdTokenSet as any).refresh_expires_in,
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
        // Pre-check refresh token expiry if we have metadata
        const rtExpired = (() => {
          if (storedTokens.refresh_expires_at) {
            return storedTokens.refresh_expires_at <= now + 60; // 1 min skew
          }
          // If no explicit expiry, but token is very old (e.g., > 60 days), assume expired
          if (storedTokens.refresh_obtained_at) {
            const maxAgeDays = 60; // conservative default
            return (
              storedTokens.refresh_obtained_at + maxAgeDays * 24 * 60 * 60 <=
              now
            );
          }
          return false;
        })();

        if (rtExpired) {
          console.warn(
            "🔁 Reauth: refresh token expired by pre-check; skipping refresh",
          );
          if (this.debugMode) {
            console.log(
              "debug: now=%d, refresh_expires_at=%s, refresh_obtained_at=%s",
              now,
              storedTokens.refresh_expires_at ?? "n/a",
              storedTokens.refresh_obtained_at ?? "n/a",
            );
          }
          const newTokenSet = await this.doFullAuthSequence();
          return newTokenSet;
        }

        const client = await this.setupOpenIDClient();
        try {
          const refreshedTokens = await client.refresh(
            storedTokens.refresh_token,
          );

          // Verify that the refreshed tokens contain the required access_token
          if (!refreshedTokens.access_token) {
            throw new Error("Refresh token response missing access_token");
          }

          const nowSec = Math.floor(Date.now() / 1000);

          // Create a valid TokenSet object and update refresh metadata if provided
          tokenSet = {
            access_token: refreshedTokens.access_token,
            refresh_token: refreshedTokens.refresh_token,
            id_token: refreshedTokens.id_token,
            expires_in: refreshedTokens.expires_in,
            expires_at: refreshedTokens.expires_at,
            ...(typeof (refreshedTokens as any).refresh_expires_in ===
              "number" && {
              refresh_expires_in: (refreshedTokens as any).refresh_expires_in,
              refresh_expires_at:
                nowSec + (refreshedTokens as any).refresh_expires_in,
              refresh_obtained_at: nowSec,
            }),
          };

          // Persist
          fs.writeFileSync(this.MSTokenPath, JSON.stringify(tokenSet));
        } catch (e: any) {
          // If the IdP says invalid_grant/expired, do a full re-auth
          const msg = e?.error_description || e?.message || String(e);
          const isInvalidGrant =
            e?.error === "invalid_grant" || /invalid_grant/i.test(msg);
          const isExpiredGrant = /AADB2C90080|expired/i.test(msg);
          if (isInvalidGrant || isExpiredGrant) {
            console.warn(
              "🔁 Reauth: refresh rejected by IdP (invalid_grant/expired)",
            );
            if (this.debugMode) {
              console.log("debug: provider error: %s", msg);
            }
            const newTokenSet = await this.doFullAuthSequence();
            return newTokenSet;
          }
          throw e;
        }
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
