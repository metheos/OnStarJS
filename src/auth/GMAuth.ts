// auth/GMAuth.ts
import axios, { AxiosInstance, AxiosResponse } from "axios";
import { CookieJar } from "tough-cookie";
import { HttpCookieAgent, HttpsCookieAgent } from "http-cookie-agent/http";
import * as openidClient from "openid-client";
import { custom } from "openid-client";
import fs from "fs";
import { TOTP } from "totp-generator";
import { stringify } from "uuid";
import path from "path";

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
  private transId: string | null;

  private currentGMAPIToken: GMAPITokenResponse | null = null;

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
    this.jar = new CookieJar();
    this.axiosClient = axios.create({
      httpAgent: new HttpCookieAgent({ cookies: { jar: this.jar } }),
      httpsAgent: new HttpsCookieAgent({ cookies: { jar: this.jar } }),
    });
    this.csrfToken = null;
    this.transId = null;
    // Load the current GM API token
    this.loadCurrentGMAPIToken();
  }

  async authenticate(): Promise<GMAPITokenResponse> {
    try {
      let loadedTokenSet = await this.loadAccessToken();
      if (loadedTokenSet !== false) {
        // console.log("Using existing MS tokens");
        return await this.getGMAPIToken(loadedTokenSet);
      }

      // console.log("Performing full authentication");
      await this.doFullAuthSequence();
      loadedTokenSet = await this.loadAccessToken();
      if (!loadedTokenSet) throw new Error("Failed to load MS token set");
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
    const { authorizationUrl, code_verifier } =
      await this.startAuthorizationFlow();

    const authResponse = await this.getRequest(authorizationUrl);
    this.csrfToken = this.getRegexMatch(
      authResponse.data,
      `\"csrf\":\"(.*?)\"`,
    );
    this.transId = this.getRegexMatch(
      authResponse.data,
      `\"transId\":\"(.*?)\"`,
    );

    if (!this.csrfToken || !this.transId) {
      throw new Error("Failed to extract csrf token or transId");
    }

    await this.submitCredentials();
    await this.handleMFA();
    const authCode = await this.getAuthorizationCode();
    if (!authCode) throw new Error("Failed to get authorization code");

    const tokenSet = await this.getAccessToken(authCode, code_verifier);
    await this.saveTokens(tokenSet);

    return tokenSet;
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
    const authCodeRequestURL = `https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn/api/SelfAsserted/confirmed?csrf_token=${this.csrfToken}&tx=${this.transId}&p=B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn`;
    const authResponse = await this.captureRedirectLocation(authCodeRequestURL);
    return this.getRegexMatch(authResponse, `code=(.*)`);
  }

  private async handleMFA(): Promise<void> {
    // console.log("Loading MFA Page");
    const mfaRequestURL = `https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn/api/CombinedSigninAndSignup/confirmed?rememberMe=true&csrf_token=${this.csrfToken}&tx=${this.transId}&p=B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn`;

    const authResponse = await this.getRequest(mfaRequestURL);
    this.csrfToken = this.getRegexMatch(
      authResponse.data,
      `\"csrf\":\"(.*?)\"`,
    );
    this.transId = this.getRegexMatch(
      authResponse.data,
      `\"transId\":\"(.*?)\"`,
    );

    if (!this.csrfToken || !this.transId) {
      throw new Error("Failed to extract csrf token or transId during MFA");
    }

    const { otp } = TOTP.generate(this.config.totpKey, {
      digits: 6,
      algorithm: "SHA-1",
      period: 30,
    });

    // console.log("Submitting OTP Code:", otp);
    const postMFACodeRespURL = `https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn/SelfAsserted?tx=${this.transId}&p=B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn`;

    const MFACodeDataResp = {
      otpCode: otp,
      request_type: "RESPONSE",
    };

    await this.postRequest(postMFACodeRespURL, MFACodeDataResp, this.csrfToken);
  }

  private async submitCredentials(): Promise<void> {
    // console.log("Sending GM login credentials");
    const cpe1Url = `https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn/SelfAsserted?tx=${this.transId}&p=B2C_1A_SEAMLESS_MOBILE_SignUpOrSignIn`;

    const cpe1Data = {
      request_type: "RESPONSE",
      logonIdentifier: this.config.username,
      password: this.config.password,
    };

    await this.postRequest(cpe1Url, cpe1Data, this.csrfToken);
  }

  static authTokenIsValid(authToken: GMAPITokenResponse): boolean {
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
        const now = Math.floor(Date.now() / 1000);

        // Check if the token is still valid
        if (storedToken.expires_at && storedToken.expires_at > now + 5 * 60) {
          // console.log("GM expires at: ", storedToken.expires_at, " now: ", now);
          // console.log("Loaded existing GM API token");
          this.currentGMAPIToken = storedToken;
        } else {
          // console.log("Existing GM API token has expired");
        }
      } catch (err) {
        console.error("Error loading stored GM API token:", err);
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

  private async getRequest(url: string): Promise<AxiosResponse> {
    try {
      const response = await this.axiosClient.get(url, {
        withCredentials: true,
        maxRedirects: 0,
      });
      // console.log("Response Status:", response.status);
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
      const response = await this.axiosClient.post(url, postData, {
        withCredentials: true,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          accept: "application/json, text/javascript, */*; q=0.01",
          origin: "https://custlogin.gm.com",
          "x-csrf-token": csrfToken,
        },
      });
      // console.log("Response Status:", response.status);
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
    // console.log("Requesting PKCE code");
    try {
      const response = await this.axiosClient.get(url, {
        maxRedirects: 0,
        validateStatus: (status) => status >= 200 && status < 400,
      });

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

  private async setupClient(): Promise<openidClient.Client> {
    // console.log("Doing auth discovery");
    const issuer = await this.oidc.Issuer.discover(
      "https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/b2c_1a_seamless_mobile_signuporsignin/v2.0/.well-known/openid-configuration",
    );

    const client = new issuer.Client({
      client_id: "3ff30506-d242-4bed-835b-422bf992622e",
      redirect_uris: ["msauth.com.gm.myChevrolet://auth"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
    client[custom.clock_tolerance] = 5; // to allow a 5 second skew

    return client;
  }

  private async startAuthorizationFlow(): Promise<{
    authorizationUrl: string;
    code_verifier: string;
  }> {
    // console.log("Starting PKCE auth");
    const client = await this.setupClient();
    const code_verifier = this.oidc.generators.codeVerifier();
    const code_challenge = this.oidc.generators.codeChallenge(code_verifier);

    const authorizationUrl = client.authorizationUrl({
      scope:
        "https://gmb2cprod.onmicrosoft.com/3ff30506-d242-4bed-835b-422bf992622e/Test.Read openid profile offline_access",
      code_challenge,
      code_challenge_method: "S256",
    });

    return { authorizationUrl, code_verifier };
  }

  private async getAccessToken(
    code: string,
    code_verifier: string,
  ): Promise<TokenSet> {
    const client = await this.setupClient();

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

  private async loadAccessToken(): Promise<TokenSet | false> {
    // console.log("Loading existing MS tokens, if they exist.");
    let tokenSet: TokenSet;

    if (fs.existsSync(this.MSTokenPath)) {
      let storedTokens = null;
      try {
        storedTokens = JSON.parse(
          fs.readFileSync(this.MSTokenPath, "utf-8"),
        ) as TokenSet;
      } catch (err) {
        console.error("Error parsing stored tokens:", err);
        throw err;
      }
      const now = Math.floor(Date.now() / 1000);

      if (storedTokens.expires_at && storedTokens.expires_at > now + 5 * 60) {
        // console.log("MS Access token is still valid");
        // console.log("MS expires at: ", storedTokens.expires_at, " now: ", now);
        tokenSet = storedTokens;
      } else if (storedTokens.refresh_token) {
        // console.log("Refreshing MS access token");
        const client = await this.setupClient();
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
  return {
    token,
    auth,
  };
}
