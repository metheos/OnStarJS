import dotenv from "dotenv";
import { getGMAPIJWT } from "../../src/auth/GMAuth";

// Load environment variables
dotenv.config();

describe("GM Authentication", () => {
  it("should successfully authenticate and return token details", async () => {
    // Create config object from environment variables
    const config = {
      username: process.env.ONSTAR_USERNAME,
      password: process.env.ONSTAR_PASSWORD,
      deviceId: process.env.DEVICEID,
      totpKey: process.env.ONSTAR_TOTPKEY,
    };

    // Create authenticated client
    const { token, auth } = await getGMAPIJWT(config);

    // Assertions
    expect(token).toBeDefined();
    expect(token.access_token).toBeDefined();
    expect(token.token_type).toBe("bearer");
    expect(token.expires_in).toBeGreaterThan(0);
    expect(token.expires_at).toBeDefined();
    expect(auth).toBeDefined();
    console.log(token.access_token);
  }, 30000); // Increased timeout for authentication
});
