#!/usr/bin/env node

/**
 * Credential Manager for OnStarJS
 *
 * This utility helps manage OnStar credentials across different environments
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");

class CredentialManager {
  constructor() {
    this.envFile = ".env";
    this.backupDir = ".env-backups";
    this.colors = {
      red: "\x1b[31m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      blue: "\x1b[34m",
      magenta: "\x1b[35m",
      cyan: "\x1b[36m",
      reset: "\x1b[0m",
    };
  }

  log(level, message) {
    const colorMap = {
      info: this.colors.blue,
      success: this.colors.green,
      warning: this.colors.yellow,
      error: this.colors.red,
      config: this.colors.cyan,
    };

    const color = colorMap[level] || this.colors.reset;
    const icon =
      {
        info: "ℹ️ ",
        success: "✅",
        warning: "⚠️ ",
        error: "❌",
        config: "🔧",
      }[level] || "";

    console.log(`${color}${icon} ${message}${this.colors.reset}`);
  }

  async prompt(question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  async securePrompt(question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
      rl.stdoutMuted = true;
      rl._writeToOutput = function () {
        rl.output.write("*");
      };
    });
  }

  generateDeviceId() {
    return crypto.randomUUID();
  }

  maskValue(value, showChars = 3) {
    if (!value) return "(not set)";
    if (value.length <= showChars) return "***";
    return (
      value.substring(0, showChars) +
      "*".repeat(Math.min(value.length - showChars, 10))
    );
  }

  createBackup() {
    if (!fs.existsSync(this.envFile)) {
      return null;
    }

    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(this.backupDir, `.env.backup.${timestamp}`);

    fs.copyFileSync(this.envFile, backupFile);
    this.log("info", `Created backup: ${backupFile}`);
    return backupFile;
  }

  loadCurrentEnv() {
    if (!fs.existsSync(this.envFile)) {
      return {};
    }

    const content = fs.readFileSync(this.envFile, "utf8");
    const env = {};

    content.split("\n").forEach((line) => {
      const match = line.match(/^([A-Z_]+)="?([^"]*)"?$/);
      if (match) {
        env[match[1]] = match[2];
      }
    });

    return env;
  }

  async interactiveSetup() {
    console.log(
      `${this.colors.magenta}🚀 OnStarJS Interactive Credential Setup${this.colors.reset}\n`,
    );

    const current = this.loadCurrentEnv();
    const credentials = {};

    // Required fields
    const requiredFields = [
      {
        key: "ONSTAR_USERNAME",
        label: "OnStar Username (Email)",
        type: "text",
      },
      { key: "ONSTAR_PASSWORD", label: "OnStar Password", type: "password" },
      { key: "ONSTAR_PIN", label: "OnStar PIN", type: "text" },
      { key: "ONSTAR_TOTPKEY", label: "TOTP Secret Key", type: "text" },
    ];

    // Optional fields
    const optionalFields = [
      { key: "VIN", label: "Vehicle VIN (optional)", type: "text" },
      {
        key: "TOKEN_LOCATION",
        label: "Token Storage Location (optional)",
        type: "text",
      },
    ];

    // Collect required credentials
    for (const field of requiredFields) {
      const currentValue = current[field.key] || process.env[field.key];
      const displayValue = currentValue
        ? this.maskValue(currentValue)
        : "(not set)";

      let value;
      if (field.type === "password") {
        value = await this.securePrompt(
          `${field.label} [current: ${displayValue}]: `,
        );
      } else {
        value = await this.prompt(
          `${field.label} [current: ${displayValue}]: `,
        );
      }

      credentials[field.key] = value || currentValue || "";
    }

    // Generate device ID if not present
    if (!current.DEVICEID && !process.env.DEVICEID) {
      credentials.DEVICEID = this.generateDeviceId();
      this.log("config", `Generated new Device ID: ${credentials.DEVICEID}`);
    } else {
      credentials.DEVICEID = current.DEVICEID || process.env.DEVICEID;
    }

    // Collect optional credentials
    const includeOptional = await this.prompt(
      "\nInclude optional fields? (y/N): ",
    );
    if (includeOptional.toLowerCase().startsWith("y")) {
      for (const field of optionalFields) {
        const currentValue = current[field.key] || process.env[field.key];
        const displayValue = currentValue || "(not set)";

        const value = await this.prompt(
          `${field.label} [current: ${displayValue}]: `,
        );
        credentials[field.key] = value || currentValue || "";
      }
    } else {
      // Keep existing optional values
      optionalFields.forEach((field) => {
        credentials[field.key] =
          current[field.key] || process.env[field.key] || "";
      });
    }

    return credentials;
  }

  createEnvFile(credentials) {
    const timestamp = new Date().toISOString();

    const content = `# OnStarJS Environment Configuration
# Generated: ${timestamp}
# Generated by: Credential Manager

# Device Configuration
DEVICEID="${credentials.DEVICEID || ""}"
VIN="${credentials.VIN || ""}"

# OnStar Account Credentials
ONSTAR_USERNAME="${credentials.ONSTAR_USERNAME || ""}"
ONSTAR_PASSWORD="${credentials.ONSTAR_PASSWORD || ""}"
ONSTAR_PIN="${credentials.ONSTAR_PIN || ""}"
ONSTAR_TOTPKEY="${credentials.ONSTAR_TOTPKEY || ""}"

# Optional Configuration
TOKEN_LOCATION="${credentials.TOKEN_LOCATION || ""}"
`;

    // Create backup if file exists
    this.createBackup();

    // Write new file
    fs.writeFileSync(this.envFile, content, "utf8");
    this.log("success", `Created ${this.envFile}`);
  }

  displaySummary(credentials) {
    console.log(
      `\n${this.colors.green}📋 Credential Summary:${this.colors.reset}`,
    );
    console.log(`   Device ID: ${this.maskValue(credentials.DEVICEID, 8)}...`);
    console.log(`   VIN: ${credentials.VIN || "(not set)"}`);
    console.log(`   Username: ${this.maskValue(credentials.ONSTAR_USERNAME)}`);
    console.log(
      `   Password: ${credentials.ONSTAR_PASSWORD ? "***" : "(not set)"}`,
    );
    console.log(`   PIN: ${credentials.ONSTAR_PIN ? "***" : "(not set)"}`);
    console.log(`   TOTP Key: ${this.maskValue(credentials.ONSTAR_TOTPKEY)}`);
    console.log(
      `   Token Location: ${credentials.TOKEN_LOCATION || "(default)"}`,
    );
  }

  validateCredentials(credentials) {
    const required = [
      "ONSTAR_USERNAME",
      "ONSTAR_PASSWORD",
      "ONSTAR_PIN",
      "ONSTAR_TOTPKEY",
    ];
    const missing = required.filter((key) => !credentials[key]);

    if (missing.length > 0) {
      this.log("error", `Missing required credentials: ${missing.join(", ")}`);
      return false;
    }

    // Basic validation
    if (
      credentials.ONSTAR_USERNAME &&
      !credentials.ONSTAR_USERNAME.includes("@")
    ) {
      this.log("warning", "Username should be an email address");
    }

    if (credentials.ONSTAR_PIN && !/^\d{4,6}$/.test(credentials.ONSTAR_PIN)) {
      this.log("warning", "PIN should be 4-6 digits");
    }

    return true;
  }

  async run() {
    try {
      const credentials = await this.interactiveSetup();

      if (!this.validateCredentials(credentials)) {
        this.log("error", "Credential validation failed");
        process.exit(1);
      }

      this.displaySummary(credentials);

      const confirm = await this.prompt("\nSave these credentials? (Y/n): ");
      if (confirm.toLowerCase().startsWith("n")) {
        this.log("info", "Setup cancelled");
        process.exit(0);
      }

      this.createEnvFile(credentials);

      console.log(
        `\n${this.colors.green}🎉 Setup complete!${this.colors.reset}`,
      );
      console.log("You can now run your OnStarJS applications and tests.");
    } catch (error) {
      this.log("error", `Setup failed: ${error.message}`);
      process.exit(1);
    }
  }
}

// CLI interface
if (require.main === module) {
  const manager = new CredentialManager();
  manager.run();
}

module.exports = CredentialManager;
