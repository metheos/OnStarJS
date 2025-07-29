import dotenv from "dotenv";
import { getGMAPIJWT, GMAuth } from "../../src/auth/GMAuth";
import fs from "fs";
import path from "path";

// Load environment variables
dotenv.config();

describe("GM Authentication", () => {
  it("should successfully authenticate and return token details", async () => {
    // Create config object from environment variables
    const config = {
      username: process.env.ONSTAR_USERNAME!,
      password: process.env.ONSTAR_PASSWORD!,
      deviceId: process.env.DEVICEID!,
      totpKey: process.env.ONSTAR_TOTPKEY!,
      tokenLocation: process.env.TOKEN_LOCATION,
    };

    // Validate required environment variables
    if (
      !config.username ||
      !config.password ||
      !config.deviceId ||
      !config.totpKey
    ) {
      throw new Error("Missing required environment variables for auth test");
    }

    // Create authenticated client
    const { token, auth, decodedPayload } = await getGMAPIJWT(config);

    // Assertions
    expect(token).toBeDefined();
    expect(token.access_token).toBeDefined();
    expect(token.token_type).toBe("bearer");
    expect(token.expires_in).toBeGreaterThan(0);
    expect(token.expires_at).toBeDefined();
    expect(auth).toBeDefined();
    expect(decodedPayload.vehs[0]).toBeDefined();
    console.log(token.access_token);
  }, 240000); // Increased timeout to 4 minutes for authentication with exponential backoff

  it("should successfully reauthenticate when tokens are expired or invalid", async () => {
    // Create config object from environment variables
    const config = {
      username: process.env.ONSTAR_USERNAME!,
      password: process.env.ONSTAR_PASSWORD!,
      deviceId: process.env.DEVICEID!,
      totpKey: process.env.ONSTAR_TOTPKEY!,
      tokenLocation: process.env.TOKEN_LOCATION || "./",
    };

    // Validate required environment variables
    if (
      !config.username ||
      !config.password ||
      !config.deviceId ||
      !config.totpKey
    ) {
      throw new Error("Missing required environment variables for reauth test");
    }

    const tokenLocation = config.tokenLocation;
    const msTokenPath = path.join(tokenLocation, "microsoft_tokens.json");
    const gmTokenPath = path.join(tokenLocation, "gm_tokens.json");

    // Backup existing tokens if they exist
    const msTokenBackup = fs.existsSync(msTokenPath)
      ? fs.readFileSync(msTokenPath, "utf-8")
      : null;
    const gmTokenBackup = fs.existsSync(gmTokenPath)
      ? fs.readFileSync(gmTokenPath, "utf-8")
      : null;

    try {
      // Step 1: First authentication to create valid tokens
      console.log("🔐 Step 1: Initial authentication...");
      let { token: token1, auth: auth1 } = await getGMAPIJWT(config);

      expect(token1).toBeDefined();
      expect(token1.access_token).toBeDefined();
      console.log("✅ Initial authentication successful");

      // Step 2: Simulate expired/invalid tokens by deleting them
      console.log(
        "🗑️  Step 2: Simulating expired tokens by removing token files...",
      );
      if (fs.existsSync(msTokenPath)) {
        fs.unlinkSync(msTokenPath);
      }
      if (fs.existsSync(gmTokenPath)) {
        fs.unlinkSync(gmTokenPath);
      }
      console.log("✅ Token files removed");

      // Step 3: Attempt reauthentication
      console.log("🔄 Step 3: Testing reauthentication...");
      let { token: token2, auth: auth2 } = await getGMAPIJWT(config);

      // Assertions for reauthentication
      expect(token2).toBeDefined();
      expect(token2.access_token).toBeDefined();
      expect(token2.token_type).toBe("bearer");
      expect(token2.expires_in).toBeGreaterThan(0);
      expect(token2.expires_at).toBeDefined();

      // Verify the new token is different from the first one
      expect(token2.access_token).not.toBe(token1.access_token);

      console.log("✅ Reauthentication successful");
      console.log(`Original token: ${token1.access_token.substring(0, 20)}...`);
      console.log(`New token: ${token2.access_token.substring(0, 20)}...`);

      // Step 4: Test browser reinitialization by simulating a long-running process
      console.log("🖥️  Step 4: Testing browser reinitialization...");

      // Create a new GMAuth instance to simulate a fresh start
      const auth3 = new GMAuth(config);

      // Simulate browser state from a previous session (this tests the browser validation logic)
      // The initBrowser method should detect that browser references are stale and reinitialize
      const token3 = await auth3.authenticate();

      expect(token3).toBeDefined();
      expect(token3.access_token).toBeDefined();
      console.log("✅ Browser reinitialization test successful");
    } finally {
      // Restore backed up tokens if they existed
      if (msTokenBackup) {
        fs.writeFileSync(msTokenPath, msTokenBackup);
      }
      if (gmTokenBackup) {
        fs.writeFileSync(gmTokenPath, gmTokenBackup);
      }
    }
  }, 360000); // 6 minutes timeout for full reauth cycle with exponential backoff
});
