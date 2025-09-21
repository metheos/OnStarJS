import "dotenv/config";
import OnStar from "../dist/index.mjs";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

async function main() {
  const config = {
    deviceId: requireEnv("DEVICEID"),
    vin: requireEnv("VIN"),
    username: requireEnv("ONSTAR_USERNAME"),
    password: requireEnv("ONSTAR_PASSWORD"),
    onStarPin: requireEnv("ONSTAR_PIN"),
    onStarTOTP: requireEnv("ONSTAR_TOTPKEY"),
    tokenLocation: process.env.TOKEN_LOCATION || "./",

    // Optional throttle/poll controls
    checkRequestStatus: false,
    max429Retries: Number(process.env.MAX_429_RETRIES || 4),
    initial429DelayMs: Number(process.env.INITIAL_429_DELAY_MS || 1500),
    backoffFactor: Number(process.env.BACKOFF_FACTOR || 2),
    jitterMs: Number(process.env.JITTER_MS || 500),
    max429DelayMs: Number(process.env.MAX_429_DELAY_MS || 60000),
  };

  const client = OnStar.create(config);

  console.log("info: Requesting location", {
    timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
  });

  try {
    const result = await client.location();
    const data = result?.response?.data;

    console.log("\n=== location Result ===");
    console.log(JSON.stringify(result, null, 2));

    const pos = data?.telemetry?.data?.position;
    if (pos) {
      console.log("\nPosition:", {
        lat: pos.lat,
        lng: pos.lng,
        geohash: pos.geohash,
      });
    } else {
      console.log("\nNo position found in telemetry data.");
    }
  } catch (err) {
    console.error("\n❌ location failed");
    if (err && typeof err === "object") {
      const safe = {
        message: err.message,
        status: err.response?.status,
        statusText: err.response?.statusText,
        headers: err.response?.headers,
        data: err.response?.data,
      };
      console.error(JSON.stringify(safe, null, 2));
    } else {
      console.error(String(err));
    }
    process.exitCode = 1;
  }
}

main();
