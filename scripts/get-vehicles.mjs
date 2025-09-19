import 'dotenv/config';
import OnStar from '../dist/index.mjs';

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

async function main() {
  // Read required credentials from environment (.env or system env)
  const config = {
    deviceId: requireEnv('DEVICEID'),
    vin: requireEnv('VIN'),
    username: requireEnv('ONSTAR_USERNAME'),
    password: requireEnv('ONSTAR_PASSWORD'),
    onStarPin: requireEnv('ONSTAR_PIN'),
    onStarTOTP: requireEnv('ONSTAR_TOTPKEY'),
    tokenLocation: process.env.TOKEN_LOCATION || './',

    // Optional request/429 handling knobs (safe defaults)
    checkRequestStatus: true,
    max429Retries: Number(process.env.MAX_429_RETRIES || 4),
    initial429DelayMs: Number(process.env.INITIAL_429_DELAY_MS || 1500),
    backoffFactor: Number(process.env.BACKOFF_FACTOR || 2),
    jitterMs: Number(process.env.JITTER_MS || 500),
    max429DelayMs: Number(process.env.MAX_429_DELAY_MS || 60000),
  };

  const client = OnStar.create(config);

  console.log('info: Requesting vehicles', { timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19) });

  try {
    const result = await client.getAccountVehicles();
    console.log('\n=== getAccountVehicles Result ===');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('\n❌ getAccountVehicles failed');
    if (err && typeof err === 'object') {
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
