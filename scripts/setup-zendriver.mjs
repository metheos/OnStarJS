#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const venvDir = path.resolve(
  process.env.ONSTARJS_ZENDRIVER_VENV ?? path.join(projectRoot, ".venv"),
);
const isWindows = process.platform === "win32";
const venvPython = isWindows
  ? path.join(venvDir, "Scripts", "python.exe")
  : path.join(venvDir, "bin", "python");

const pythonCandidates = [
  process.env.ONSTARJS_PYTHON
    ? { command: process.env.ONSTARJS_PYTHON, args: [] }
    : undefined,
  process.env.PYTHON ? { command: process.env.PYTHON, args: [] } : undefined,
  ...(isWindows
    ? [
        { command: "py", args: ["-3"] },
        { command: "python", args: [] },
        { command: "python3", args: [] },
      ]
    : [
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
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function canRun(command, args) {
  const result = spawnSync(command, [...args, "--version"], {
    cwd: projectRoot,
    stdio: "ignore",
    shell: false,
  });

  return !result.error && result.status === 0;
}

function findPython() {
  const candidate = pythonCandidates.find(({ command, args }) =>
    canRun(command, args),
  );

  if (!candidate) {
    throw new Error(
      `Unable to find Python 3. Tried: ${pythonCandidates
        .map(({ command, args }) => [command, ...args].join(" "))
        .join(", ")}`,
    );
  }

  return candidate;
}

try {
  const python = findPython();

  if (!fs.existsSync(venvPython)) {
    console.log(`Creating Zendriver virtual environment at ${venvDir}`);
    run(python.command, [...python.args, "-m", "venv", venvDir]);
  } else {
    console.log(`Using existing Zendriver virtual environment at ${venvDir}`);
  }

  run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
  run(venvPython, ["-m", "pip", "install", "zendriver", "pyotp"]);

  console.log(`Zendriver setup complete. Python: ${venvPython}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    "If venv creation failed on Debian/Ubuntu, install python3-venv or python3-full and rerun pnpm run setup:zendriver.",
  );
  process.exit(1);
}