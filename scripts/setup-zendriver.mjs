#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Browser,
  BrowserTag,
  canDownload,
  detectBrowserPlatform,
  install,
  resolveBuildId,
} from "@puppeteer/browsers";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const venvDir = path.resolve(
  process.env.ONSTARJS_ZENDRIVER_VENV ?? path.join(projectRoot, ".venv"),
);
const isWindows = process.platform === "win32";
const venvPython = isWindows
  ? path.join(venvDir, "Scripts", "python.exe")
  : path.join(venvDir, "bin", "python");
const browserCacheDir = path.resolve(
  process.env.ONSTARJS_BROWSER_CACHE ??
    path.join(projectRoot, ".cache", "onstarjs-browsers"),
);
const browserManifestPath = path.join(browserCacheDir, "zendriver-browser.json");

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
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}`,
    );
  }
}

function canRun(command, args) {
  const result = spawnSync(
    command,
    [
      ...args,
      "-c",
      "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)",
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
      `Unable to find Python 3. Tried: ${pythonCandidates
        .map(({ command, args }) => [command, ...args].join(" "))
        .join(", ")}`,
    );
  }

  return candidate;
}

function commandExists(command) {
  const result = isWindows
    ? spawnSync("where", [command], {
        cwd: projectRoot,
        stdio: "ignore",
        shell: false,
      })
    : spawnSync("sh", ["-c", `command -v ${command}`], {
        cwd: projectRoot,
        stdio: "ignore",
        shell: false,
      });

  return !result.error && result.status === 0;
}

function checkVirtualDisplaySupport() {
  if (process.platform !== "linux" || process.env.DISPLAY) {
    return;
  }

  if (commandExists("Xvfb")) {
    console.log("Xvfb detected for no-display Zendriver sessions");
    return;
  }

  console.warn(
    "No DISPLAY or Xvfb binary detected. Install xvfb on this Linux host " +
      "before running Zendriver auth in a no-display environment.",
  );
}

async function installPortableBrowser() {
  if (process.env.ONSTARJS_BROWSER_EXECUTABLE) {
    const configuredBrowser = path.resolve(process.env.ONSTARJS_BROWSER_EXECUTABLE);
    if (!fs.existsSync(configuredBrowser)) {
      throw new Error(
        `ONSTARJS_BROWSER_EXECUTABLE does not exist: ${configuredBrowser}`,
      );
    }
    console.log(`Using configured browser executable at ${configuredBrowser}`);
    return configuredBrowser;
  }

  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error(
      `Unsupported browser platform: ${process.platform}/${process.arch}`,
    );
  }

  fs.mkdirSync(browserCacheDir, { recursive: true });

  const installTargets = [
    { browser: Browser.CHROMIUM, tag: BrowserTag.LATEST },
    { browser: Browser.CHROME, tag: BrowserTag.STABLE },
  ];

  for (const target of installTargets) {
    const buildId = await resolveBuildId(target.browser, platform, target.tag);
    const downloadable = await canDownload({
      browser: target.browser,
      buildId,
      cacheDir: browserCacheDir,
      platform,
    });

    if (!downloadable) {
      console.log(
        `Skipping ${target.browser} ${buildId}; no download is available for ${platform}`,
      );
      continue;
    }

    let executablePath;
    try {
      console.log(`Installing ${target.browser} ${buildId} for ${platform}`);
      const installedBrowser = await install({
        browser: target.browser,
        buildId,
        buildIdAlias: "zendriver",
        cacheDir: browserCacheDir,
        platform,
        downloadProgressCallback: "default",
      });
      executablePath = installedBrowser.executablePath;
    } catch (error) {
      console.warn(
        `Failed to install ${target.browser} ${buildId}: ${error instanceof Error ? error.message : error}`,
      );
      continue;
    }

    fs.writeFileSync(
      browserManifestPath,
      `${JSON.stringify(
        {
          browser: target.browser,
          buildId,
          platform,
          executablePath,
        },
        null,
        2,
      )}\n`,
    );

    console.log(`Browser setup complete. Executable: ${executablePath}`);
    return executablePath;
  }

  throw new Error(
    `Unable to find a portable Chromium download for ${process.platform}/${process.arch}. Set ONSTARJS_BROWSER_EXECUTABLE to a local Chrome or Chromium binary and rerun setup.`,
  );
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
  run(venvPython, [
    "-m",
    "pip",
    "install",
    "zendriver",
    "browserforge[all]",
    "pyotp",
  ]);
  checkVirtualDisplaySupport();
  await installPortableBrowser();

  console.log(`Zendriver setup complete. Python: ${venvPython}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    "If venv creation failed on Debian/Ubuntu, install python3-venv or python3-full and rerun pnpm run setup:zendriver.",
  );
  process.exit(1);
}