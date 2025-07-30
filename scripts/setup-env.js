#!/usr/bin/env node

/**
 * Environment Setup Script for OnStarJS
 *
 * This script dynamically generates a .env file from environment variables
 * (GitHub Codespace secrets, system env vars, etc.)
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

const ENV_FILE = ".env";
const ENV_EXAMPLE = ".env.example";

// ANSI color codes for console output
const colors = {
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  reset: "\x1b[0m",
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  config: (msg) => console.log(`${colors.cyan}🔧 ${msg}${colors.reset}`),
};

// Configuration for environment variables
const ENV_CONFIG = {
  required: [
    { name: "ONSTAR_USERNAME", description: "OnStar account email" },
    { name: "ONSTAR_PASSWORD", description: "OnStar account password" },
    { name: "ONSTAR_PIN", description: "OnStar PIN" },
    { name: "ONSTAR_TOTPKEY", description: "TOTP secret key" },
  ],
  optional: [
    {
      name: "DEVICEID",
      description: "Device UUID (auto-generated if not provided)",
    },
    { name: "VIN", description: "Vehicle Identification Number" },
    { name: "TOKEN_LOCATION", description: "Token storage location" },
  ],
};

/**
 * Generate a UUID v4
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Check if environment variable exists and is not empty
 */
function checkEnvVar(varName) {
  const value = process.env[varName];
  return value && value.trim().length > 0;
}

/**
 * Get masked version of sensitive data for logging
 */
function maskSensitive(value, prefix = 3) {
  if (!value) return "(not set)";
  if (value.length <= prefix) return "***";
  return value.substring(0, prefix) + "***";
}

/**
 * Create the .env file content
 */
function createEnvContent() {
  const deviceId = process.env.DEVICEID || generateUUID();
  const timestamp = new Date().toISOString();

  return `# Auto-generated .env file for OnStarJS
# Generated on: ${timestamp}
# Generator: Node.js setup script

# Device Configuration
DEVICEID="${deviceId}"
VIN="${process.env.VIN || ""}"

# OnStar Account Credentials
ONSTAR_USERNAME="${process.env.ONSTAR_USERNAME || ""}"
ONSTAR_PASSWORD="${process.env.ONSTAR_PASSWORD || ""}"
ONSTAR_PIN="${process.env.ONSTAR_PIN || ""}"
ONSTAR_TOTPKEY="${process.env.ONSTAR_TOTPKEY || ""}"

# Optional Configuration
TOKEN_LOCATION="${process.env.TOKEN_LOCATION || ""}"
`;
}

/**
 * Ask user for confirmation
 */
function askConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith("y"));
    });
  });
}

/**
 * Check for missing environment variables
 */
function checkEnvironmentVariables() {
  log.info("Checking environment variables...");

  const missing = [];
  const found = [];

  // Check required variables
  ENV_CONFIG.required.forEach(({ name, description }) => {
    if (checkEnvVar(name)) {
      log.success(`Found ${name}: ${description}`);
      found.push(name);
    } else {
      log.error(`Missing ${name}: ${description}`);
      missing.push({ name, description });
    }
  });

  // Check optional variables
  ENV_CONFIG.optional.forEach(({ name, description }) => {
    if (checkEnvVar(name)) {
      log.success(`Found ${name}: ${description}`);
      found.push(name);
    } else {
      log.info(`Optional ${name} not set: ${description}`);
    }
  });

  return { missing, found };
}

/**
 * Display setup instructions for missing variables
 */
function displaySetupInstructions(missing) {
  log.error("Missing required environment variables!");
  console.log();

  console.log(`${colors.cyan}💡 Setup Instructions:${colors.reset}`);
  console.log();

  console.log(`${colors.yellow}For GitHub Codespaces:${colors.reset}`);
  console.log("  1. Go to your repository settings");
  console.log('  2. Navigate to "Secrets and variables" > "Codespaces"');
  console.log("  3. Add the following secrets:");
  missing.forEach(({ name, description }) => {
    console.log(`     - ${name}: ${description}`);
  });
  console.log();

  console.log(`${colors.yellow}For local development:${colors.reset}`);
  console.log("  Run the following commands:");
  missing.forEach(({ name }) => {
    console.log(
      `  export ${name}='your-${name.toLowerCase().replace("onstar_", "").replace("_", "-")}'`,
    );
  });
  console.log();

  console.log(`${colors.yellow}Alternative:${colors.reset}`);
  console.log(`  Manually edit ${ENV_FILE} or copy from ${ENV_EXAMPLE}`);
}

/**
 * Main execution function
 */
async function main() {
  console.log(`${colors.magenta}🚀 OnStarJS Environment Setup${colors.reset}`);
  console.log();

  // Check if .env already exists
  if (fs.existsSync(ENV_FILE)) {
    log.warning(`${ENV_FILE} already exists.`);
    const overwrite = await askConfirmation(
      "Do you want to overwrite it? (y/N): ",
    );
    if (!overwrite) {
      log.info("Setup cancelled. Existing .env file was not modified.");
      process.exit(0);
    }
  }

  // Check environment variables
  const { missing, found } = checkEnvironmentVariables();

  if (missing.length > 0) {
    console.log();
    displaySetupInstructions(missing);
    process.exit(1);
  }

  // Generate DEVICEID if not provided
  if (!process.env.DEVICEID) {
    const deviceId = generateUUID();
    process.env.DEVICEID = deviceId;
    log.config(`Generated new DEVICEID: ${deviceId}`);
  }

  // Create .env file
  try {
    const envContent = createEnvContent();
    fs.writeFileSync(ENV_FILE, envContent, "utf8");
    log.success(`Created ${ENV_FILE}`);
  } catch (error) {
    log.error(`Failed to create ${ENV_FILE}: ${error.message}`);
    process.exit(1);
  }

  // Display summary
  console.log();
  log.success("Environment setup complete!");
  console.log(`📁 Your ${ENV_FILE} file contains:`);
  console.log(`   - DEVICEID: ${maskSensitive(process.env.DEVICEID, 8)}...`);
  console.log(`   - VIN: ${process.env.VIN || "(not set)"}`);
  console.log(
    `   - ONSTAR_USERNAME: ${maskSensitive(process.env.ONSTAR_USERNAME)}`,
  );
  console.log(`   - ONSTAR_PASSWORD: ***`);
  console.log(`   - ONSTAR_PIN: ***`);
  console.log(
    `   - ONSTAR_TOTPKEY: ${maskSensitive(process.env.ONSTAR_TOTPKEY)}`,
  );
  console.log(
    `   - TOKEN_LOCATION: ${process.env.TOKEN_LOCATION || "(default)"}`,
  );
  console.log();
  console.log(
    `${colors.green}🚀 You can now run your OnStarJS tests and applications!${colors.reset}`,
  );
}

// Handle errors gracefully
process.on("uncaughtException", (error) => {
  log.error(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log.error(`Unhandled rejection: ${reason}`);
  process.exit(1);
});

// Run the main function
if (require.main === module) {
  main().catch((error) => {
    log.error(`Setup failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { main, createEnvContent, checkEnvironmentVariables };
