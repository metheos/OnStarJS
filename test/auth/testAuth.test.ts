import dotenv from "dotenv";
import { getGMAPIJWT } from "../../src/auth/GMAuth";
import fs from "fs";
import os from "os";
import path from "path";

// Load environment variables
dotenv.config();

type AuthTestConfig = {
  username: string;
  password: string;
  deviceId: string;
  totpKey: string;
  tokenLocation: string;
};

function createIsolatedTokenDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "onstarjs-auth-test-"));
}

function createAuthTestConfig(tokenLocation: string): AuthTestConfig {
  const username = process.env.ONSTAR_USERNAME;
  const password = process.env.ONSTAR_PASSWORD;
  const deviceId = process.env.DEVICEID;
  const totpKey = process.env.ONSTAR_TOTPKEY;

  const missingVars = [
    ["ONSTAR_USERNAME", username],
    ["ONSTAR_PASSWORD", password],
    ["DEVICEID", deviceId],
    ["ONSTAR_TOTPKEY", totpKey],
  ].filter(([, value]) => !value);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables for auth test: ${missingVars
        .map(([name]) => name)
        .join(", ")}`,
    );
  }

  return {
    username: username!,
    password: password!,
    deviceId: deviceId!,
    totpKey: totpKey!,
    tokenLocation,
  };
}

describe("GM Authentication (PKCE manual flow)", () => {
  const originalPkceCodeEnv = process.env.ONSTARJS_PKCE_AUTH_CODE;

  afterEach(() => {
    if (originalPkceCodeEnv !== undefined) {
      process.env.ONSTARJS_PKCE_AUTH_CODE = originalPkceCodeEnv;
      return;
    }

    delete process.env.ONSTARJS_PKCE_AUTH_CODE;
  });

  it("initiates PKCE and writes pending session when no Microsoft token set exists", async () => {
    const tokenLocation = createIsolatedTokenDir();
    const config = createAuthTestConfig(tokenLocation);
    const pendingSessionPath = path.join(tokenLocation, "ms_pkce_session.json");
    const msTokenPath = path.join(tokenLocation, "microsoft_tokens.json");
    const gmTokenPath = path.join(tokenLocation, "gm_tokens.json");

    try {
      delete process.env.ONSTARJS_PKCE_AUTH_CODE;

      await expect(getGMAPIJWT(config)).rejects.toThrow(
        /Microsoft token set is required and no valid refresh path is available\./,
      );

      expect(fs.existsSync(pendingSessionPath)).toBe(true);
      expect(fs.existsSync(msTokenPath)).toBe(false);
      expect(fs.existsSync(gmTokenPath)).toBe(false);

      const pendingRaw = fs.readFileSync(pendingSessionPath, "utf-8");
      const pending = JSON.parse(pendingRaw);

      expect(typeof pending.authorizationUrl).toBe("string");
      expect(pending.authorizationUrl).toContain("oauth2/v2.0/authorize");
      expect(typeof pending.code_verifier).toBe("string");
      expect(typeof pending.state).toBe("string");
      expect(typeof pending.created_at).toBe("number");
    } finally {
      fs.rmSync(tokenLocation, { recursive: true, force: true });
    }
  }, 600000);

  it("reuses existing pending PKCE session until callback/code is provided", async () => {
    const tokenLocation = createIsolatedTokenDir();
    const config = createAuthTestConfig(tokenLocation);
    const pendingSessionPath = path.join(tokenLocation, "ms_pkce_session.json");

    try {
      delete process.env.ONSTARJS_PKCE_AUTH_CODE;

      await expect(getGMAPIJWT(config)).rejects.toThrow(
        /Microsoft token set is required and no valid refresh path is available\./,
      );

      const firstPendingRaw = fs.readFileSync(pendingSessionPath, "utf-8");
      const firstPending = JSON.parse(firstPendingRaw);

      await expect(getGMAPIJWT(config)).rejects.toThrow(
        /Pending Microsoft PKCE auth session detected\./,
      );

      const secondPendingRaw = fs.readFileSync(pendingSessionPath, "utf-8");
      const secondPending = JSON.parse(secondPendingRaw);

      expect(secondPending.authorizationUrl).toBe(
        firstPending.authorizationUrl,
      );
      expect(secondPending.code_verifier).toBe(firstPending.code_verifier);
      expect(secondPending.state).toBe(firstPending.state);
    } finally {
      fs.rmSync(tokenLocation, { recursive: true, force: true });
    }
  }, 600000);
});
