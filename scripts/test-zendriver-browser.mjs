#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const isWindows = process.platform === "win32";

function existingPath(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate));
}

function getPythonExecutable() {
  const configuredPython = process.env.ONSTARJS_PYTHON ?? process.env.PYTHON;
  if (configuredPython) {
    return configuredPython;
  }

  const venvRoot = path.resolve(
    process.env.ONSTARJS_ZENDRIVER_VENV ?? path.join(projectRoot, ".venv"),
  );
  const venvPython = isWindows
    ? path.join(venvRoot, "Scripts", "python.exe")
    : path.join(venvRoot, "bin", "python");

  return fs.existsSync(venvPython)
    ? venvPython
    : isWindows
      ? "python"
      : "python3";
}

function getAuthScriptPath() {
  const authScriptPath = existingPath([
    process.env.ONSTARJS_ZENDRIVER_SCRIPT,
    path.join(projectRoot, "src", "auth", "zendriverAuth.py"),
    path.join(projectRoot, "dist", "auth", "zendriverAuth.py"),
  ]);

  if (!authScriptPath) {
    throw new Error(
      "Unable to find zendriverAuth.py. Run pnpm build or check ONSTARJS_ZENDRIVER_SCRIPT.",
    );
  }

  return authScriptPath;
}

function getBrowserExecutablePath() {
  if (process.env.ONSTARJS_BROWSER_EXECUTABLE) {
    return path.resolve(process.env.ONSTARJS_BROWSER_EXECUTABLE);
  }

  const browserCacheDir = path.resolve(
    process.env.ONSTARJS_BROWSER_CACHE ??
      path.join(projectRoot, ".cache", "onstarjs-browsers"),
  );
  const manifestPath = existingPath([
    process.env.ONSTARJS_BROWSER_MANIFEST,
    path.join(browserCacheDir, "zendriver-browser.json"),
  ]);

  if (!manifestPath) {
    throw new Error(
      "Unable to find Zendriver browser manifest. Run pnpm run setup:zendriver first.",
    );
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  if (!manifest.executablePath) {
    throw new Error(`Zendriver browser manifest has no executablePath: ${manifestPath}`);
  }

  return manifest.executablePath;
}

async function runDiagnostic() {
  const pythonExecutable = getPythonExecutable();
  const authScriptPath = getAuthScriptPath();
  const browserExecutablePath = getBrowserExecutablePath();
  const profilePath = path.resolve(projectRoot, "temp-browser-profile");
  const browserArgs = ["--lang=en-US"];
  const payload = {
    authorizationUrl: process.env.ONSTARJS_BROWSER_DIAGNOSTIC_URL ?? "about:blank",
    diagnosticOnly: process.env.ONSTARJS_BROWSER_DIAGNOSTIC_AUTH_CODE
      ? false
      : true,
    simulateNavigationAuthCode:
      process.env.ONSTARJS_BROWSER_DIAGNOSTIC_AUTH_CODE,
    browserExecutablePath,
    profilePath,
    browserArgs,
  };

  console.log(`Using Python: ${pythonExecutable}`);
  console.log(`Using auth script: ${authScriptPath}`);
  console.log(`Using browser: ${browserExecutablePath}`);

  const result = await new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, [authScriptPath], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    let stdout = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const lastLine = lines[lines.length - 1];
      if (!lastLine) {
        reject(new Error(`Zendriver diagnostic produced no JSON result; exit ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(lastLine));
      } catch (error) {
        reject(
          new Error(
            `Failed to parse Zendriver diagnostic result: ${error.message}. Last line: ${lastLine}`,
          ),
        );
      }
    });
    child.stdin.end(JSON.stringify(payload));
  });

  if (!result.ok) {
    throw new Error(
      result.detail
        ? `${result.error} (${result.detail})`
        : result.error || "Zendriver browser diagnostic failed",
    );
  }

  console.log("Zendriver browser diagnostic passed");
}

runDiagnostic().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});