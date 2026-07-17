#!/usr/bin/env node
/**
 * Sets up the Python environment for invisible_playwright-based authentication.
 *
 * Steps:
 *  1. Locate a Python 3.11+ interpreter.
 *  2. Create (or reuse) a virtual environment.
 *  3. Install invisible_playwright (from GitHub) and pyotp.
 *  4. Download the patched Firefox binary via `python -m invisible_playwright fetch`.
 *
 * invisible_playwright manages its own browser download (~100 MB, SHA256-verified),
 * so no separate browser installation step is required.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

const isWindows = process.platform === "win32";

const venvDir = path.resolve(
  process.env.ONSTARJS_PYTHON_VENV ?? path.join(projectRoot, ".venv"),
);
const venvPython = isWindows
  ? path.join(venvDir, "Scripts", "python.exe")
  : path.join(venvDir, "bin", "python");

// invisible_playwright requires Python 3.11+
const pythonCandidates = [
  process.env.ONSTARJS_PYTHON
    ? { command: process.env.ONSTARJS_PYTHON, args: [] }
    : undefined,
  process.env.PYTHON ? { command: process.env.PYTHON, args: [] } : undefined,
  ...(isWindows
    ? [
        { command: "py", args: ["-3.11"] },
        { command: "py", args: ["-3"] },
        { command: "python", args: [] },
        { command: "python3", args: [] },
      ]
    : [
        { command: "python3.13", args: [] },
        { command: "python3.12", args: [] },
        { command: "python3.11", args: [] },
        { command: "python3", args: [] },
        { command: "python", args: [] },
      ]),
].filter(Boolean);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}`,
    );
  }
}

function canRun(command, args) {
  // Require Python >= 3.11 for invisible_playwright
  const result = spawnSync(
    command,
    [
      ...args,
      "-c",
      "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)",
    ],
    {
      cwd: projectRoot,
      stdio: "ignore",
      shell: false,
    },
  );
  return !result.error && result.status === 0;
}

function findPython() {
  const candidate = pythonCandidates.find(({ command, args }) =>
    canRun(command, args),
  );

  if (!candidate) {
    throw new Error(
      `Unable to find Python 3.11 or later. Tried: ${pythonCandidates
        .map(({ command, args }) => [command, ...args].join(" "))
        .join(", ")}`,
    );
  }

  return candidate;
}

try {
  const python = findPython();

  if (!fs.existsSync(venvPython)) {
    console.log(`Creating Python virtual environment at ${venvDir}`);
    run(python.command, [...python.args, "-m", "venv", venvDir]);
  } else {
    console.log(`Using existing Python virtual environment at ${venvDir}`);
  }

  run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);

  console.log("Installing python dependencies...");
  run(venvPython, [
    "-m",
    "pip",
    "install",
    "git+https://github.com/feder-cr/invisible_playwright.git",
    "pyotp",
    "dotenv"
  ]);

  console.log(
    "Downloading invisible_playwright Firefox binary (~100 MB, one-time)...",
  );
  run(venvPython, ["-m", "invisible_playwright", "fetch"]);

  console.log(`invisible_playwright setup complete. Python: ${venvPython}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    "If venv creation failed on Debian/Ubuntu, install python3-venv or python3-full and retry.\n" +
      "invisible_playwright requires Python 3.11 or later.",
  );
  process.exit(1);
}
