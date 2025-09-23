import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import OnStar, {
  AlertRequestAction,
  AlertRequestOverride,
  ChargingProfileChargeMode,
  ChargingProfileRateType,
  ChargeOverrideMode,
} from "../dist/index.mjs";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function toNum(value, def = undefined) {
  if (value === undefined || value === null || value === "") return def;
  const n = Number(value);
  return Number.isFinite(n) ? n : def;
}

function logInfo(msg, extra = {}) {
  console.log("info:", msg, {
    timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
    ...extra,
  });
}

async function promptEnumList(rl, label, values, defList = []) {
  const opts = values.join(", ");
  const defStr = defList && defList.length ? defList.join(",") : "";
  const ans = (
    await rl.question(
      `${label} [${opts}] (comma-separated)${defStr ? ` [default: ${defStr}]` : ""}: `,
    )
  ).trim();
  const chosen = (ans ? ans : defStr)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // Validate; keep only known values
  return chosen.filter((v) => values.includes(v));
}

async function promptEnum(rl, label, values, defValue = undefined) {
  const opts = values.join(", ");
  const ans = (
    await rl.question(
      `${label} [${opts}]${defValue ? ` [default: ${defValue}]` : ""}: `,
    )
  ).trim();
  const val = ans || defValue;
  if (val && values.includes(val)) return val;
  return defValue ?? values[0];
}

async function promptNumber(rl, label, def = 0) {
  const ans = (await rl.question(`${label} [default: ${def}]: `)).trim();
  const n = toNum(ans, def);
  return n;
}

async function main() {
  // Build config from env (.env supported via dotenv/config)
  const config = {
    deviceId: requireEnv("DEVICEID"),
    vin: requireEnv("VIN"),
    username: requireEnv("ONSTAR_USERNAME"),
    password: requireEnv("ONSTAR_PASSWORD"),
    onStarPin: requireEnv("ONSTAR_PIN"),
    onStarTOTP: requireEnv("ONSTAR_TOTPKEY"),
    tokenLocation: process.env.TOKEN_LOCATION || "./",

    // Optional request/429 handling knobs
    checkRequestStatus: process.env.CHECK_REQUEST_STATUS
      ? String(process.env.CHECK_REQUEST_STATUS).toLowerCase() !== "false"
      : true,
    requestPollingIntervalSeconds: toNum(
      process.env.REQUEST_POLL_INTERVAL_SECONDS,
      undefined,
    ),
    requestPollingTimeoutSeconds: toNum(
      process.env.REQUEST_POLL_TIMEOUT_SECONDS,
      undefined,
    ),
    max429Retries: toNum(process.env.MAX_429_RETRIES, 4),
    initial429DelayMs: toNum(process.env.INITIAL_429_DELAY_MS, 1500),
    backoffFactor: toNum(process.env.BACKOFF_FACTOR, 2),
    jitterMs: toNum(process.env.JITTER_MS, 500),
    max429DelayMs: toNum(process.env.MAX_429_DELAY_MS, 60000),
    retryOn429ForPost:
      String(process.env.RETRY_POST_ON_429 || "").toLowerCase() === "true",
  };

  const client = OnStar.create(config);

  const rl = readline.createInterface({ input, output });
  console.log("\nOnStarJS RequestService Interactive CLI\n");
  console.log("Environment VIN:", config.vin);

  // Action registry — mirrors RequestService public API exposed via OnStar wrapper
  const actions = [
    {
      key: "getAccountVehicles",
      label: "getAccountVehicles()",
      run: () => client.getAccountVehicles(),
    },
    {
      key: "diagnostics",
      label: "diagnostics()",
      run: () => client.diagnostics(),
    },
    { key: "location", label: "location()", run: () => client.location() },
    { key: "start", label: "start()", run: () => client.start() },
    {
      key: "cancelStart",
      label: "cancelStart()",
      run: () => client.cancelStart(),
    },
    {
      key: "lockDoor",
      label: "lockDoor(options)",
      run: async () => {
        const delay = await promptNumber(rl, "delay (seconds)", 0);
        return client.lockDoor({ delay });
      },
    },
    {
      key: "unlockDoor",
      label: "unlockDoor(options)",
      run: async () => {
        const delay = await promptNumber(rl, "delay (seconds)", 0);
        return client.unlockDoor({ delay });
      },
    },
    {
      key: "lockTrunk",
      label: "lockTrunk(options)",
      run: async () => {
        const delay = await promptNumber(rl, "delay (seconds)", 0);
        return client.lockTrunk({ delay });
      },
    },
    {
      key: "unlockTrunk",
      label: "unlockTrunk(options)",
      run: async () => {
        const delay = await promptNumber(rl, "delay (seconds)", 0);
        return client.unlockTrunk({ delay });
      },
    },
    {
      key: "alert",
      label: "alert(options)",
      run: async () => {
        const actions = await promptEnumList(
          rl,
          "action",
          Object.values(AlertRequestAction),
          [AlertRequestAction.Honk, AlertRequestAction.Flash],
        );
        const delay = await promptNumber(rl, "delay (seconds)", 0);
        const duration = await promptNumber(rl, "duration (seconds)", 1);
        const override = await promptEnumList(
          rl,
          "override",
          Object.values(AlertRequestOverride),
          [AlertRequestOverride.DoorOpen, AlertRequestOverride.IgnitionOn],
        );
        return client.alert({ action: actions, delay, duration, override });
      },
    },
    {
      key: "cancelAlert",
      label: "cancelAlert()",
      run: () => client.cancelAlert(),
    },
    {
      key: "chargeOverride",
      label: "chargeOverride(options)",
      run: async () => {
        const mode = await promptEnum(
          rl,
          "mode",
          Object.values(ChargeOverrideMode),
          ChargeOverrideMode.ChargeNow,
        );
        return client.chargeOverride({ mode });
      },
    },
    {
      key: "getChargingProfile",
      label: "getChargingProfile()",
      run: () => client.getChargingProfile(),
    },
    {
      key: "setChargingProfile",
      label: "setChargingProfile(options)",
      run: async () => {
        const chargeMode = await promptEnum(
          rl,
          "chargeMode",
          Object.values(ChargingProfileChargeMode),
          ChargingProfileChargeMode.Immediate,
        );
        const rateType = await promptEnum(
          rl,
          "rateType",
          Object.values(ChargingProfileRateType),
          ChargingProfileRateType.Midpeak,
        );
        return client.setChargingProfile({ chargeMode, rateType });
      },
    },
    {
      key: "toggleCheckRequestStatus",
      label: "toggle checkRequestStatus (client)",
      run: async () => {
        const current = config.checkRequestStatus !== false;
        const next = !current;
        client.setCheckRequestStatus(next);
        logInfo("checkRequestStatus set", { value: next });
        return {
          status: "success",
          response: { data: { checkRequestStatus: next } },
        };
      },
    },
  ];

  async function chooseAction() {
    console.log("\nSelect an action:");
    for (let i = 0; i < actions.length; i++) {
      console.log(`${i + 1}. ${actions[i].label}`);
    }
    console.log(`${actions.length + 1}. Exit`);
    const ans = await rl.question("Enter choice number: ");
    const choice = Number(ans.trim());
    if (!Number.isFinite(choice) || choice < 1 || choice > actions.length + 1) {
      console.log("Invalid choice. Try again.");
      return true;
    }
    if (choice === actions.length + 1) return false;

    const action = actions[choice - 1];
    logInfo(`Executing ${action.label} ...`);
    try {
      const result = await action.run();
      console.log("\n=== Result ===");
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error("\n❌ call failed");
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
    }

    return true;
  }

  let cont = true;
  while (cont) {
    cont = await chooseAction();
  }

  rl.close();
}

main().catch((e) => {
  console.error("Fatal error:", e?.message || e);
  process.exitCode = 1;
});
