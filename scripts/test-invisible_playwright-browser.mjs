#!/usr/bin/env node
/**
 * Runs a self-contained diagnostic for the invisible_playwright auth flow.
 *
 * Starts a local HTTP server serving a simplified login page that mirrors the
 * real GM/Microsoft auth UI, then invokes invisiblePlaywrightAuth.py against
 * it and verifies the auth code is captured correctly.
 *
 * Usage:
 *   pnpm test:invisible_playwright:browser
 *
 * Or point at the real auth URL:
 *   ONSTARJS_BROWSER_DIAGNOSTIC_URL=<real-auth-url> pnpm test:invisible_playwright:browser
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const isWindows = process.platform === "win32";

function getPythonExecutable() {
  const configuredPython = process.env.ONSTARJS_PYTHON ?? process.env.PYTHON;
  if (configuredPython) {
    return configuredPython;
  }

  const venvRoot = path.resolve(
    process.env.ONSTARJS_PYTHON_VENV ?? path.join(projectRoot, ".venv"),
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
  const candidates = [
    process.env.ONSTARJS_AUTH_SCRIPT,
    path.join(projectRoot, "src", "auth", "invisiblePlaywrightAuth.py"),
    path.join(projectRoot, "dist", "auth", "invisiblePlaywrightAuth.py"),
  ].filter(Boolean);

  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      "Unable to find invisiblePlaywrightAuth.py. Run pnpm build or check ONSTARJS_AUTH_SCRIPT.",
    );
  }
  return found;
}

function createDiagnosticHtml({ expectedEmail, expectedPassword }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>invisible_playwright Auth Diagnostic</title>
  </head>
  <body>
    <main>
      <section id="email-step">
        <label for="logonIdentifier">Email</label>
        <input
          id="logonIdentifier"
          name="logonIdentifier"
          type="email"
          aria-label="Email"
          autocomplete="username"
        />
        <button id="continue" data-dtm="sign in" aria-label="Continue">
          Continue
        </button>
      </section>
      <section id="password-step" hidden>
        <label for="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          aria-label="Password"
          autocomplete="current-password"
        />
        <button id="login" aria-label="Log In">Log In</button>
      </section>
      <!-- Hidden form that POSTs to the diagnostic server, which responds
           with an HTTP 302 redirect to the custom auth scheme — the same
           redirect the real MS auth server issues. -->
      <form id="auth-form" method="POST" action="/complete" style="display:none"></form>
      <pre id="diagnostic-output"></pre>
    </main>
    <script>
      const expectedEmail = ${JSON.stringify(expectedEmail)};
      const expectedPassword = ${JSON.stringify(expectedPassword)};
      const output = document.querySelector('#diagnostic-output');
      const emailStep = document.querySelector('#email-step');
      const passwordStep = document.querySelector('#password-step');
      const emailInput = document.querySelector('#logonIdentifier');
      const passwordInput = document.querySelector('#password');

      function fail(message, details) {
        output.textContent = JSON.stringify({ ok: false, message, details });
        document.title = 'Diagnostic failure';
      }

      document.querySelector('#continue').addEventListener('click', () => {
        if (emailInput.value !== expectedEmail) {
          fail('email mismatch', {
            expectedLength: expectedEmail.length,
            actual: emailInput.value,
            actualLength: emailInput.value.length,
          });
          return;
        }
        emailStep.hidden = true;
        passwordStep.hidden = false;
        passwordInput.focus();
      });

      document.querySelector('#login').addEventListener('click', () => {
        if (passwordInput.value !== expectedPassword) {
          fail('password mismatch', {
            expectedLength: expectedPassword.length,
            actualLength: passwordInput.value.length,
          });
          return;
        }
        // POST to the diagnostic server → HTTP 302 → msauth:// custom scheme.
        // This mirrors exactly what the real Microsoft auth server does,
        // exercising the on_response Location-header capture path.
        document.querySelector('#auth-form').submit();
      });
    </script>
  </body>
</html>`;
}

async function startDiagnosticServer(options) {
  const server = http.createServer((request, response) => {
    if (request.url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }

    // The form in the diagnostic page POSTs here.  Respond with an HTTP 302
    // redirect to the custom auth scheme — exactly what the real MS auth
    // server does.  The Python on_response handler captures the Location
    // header and extracts the auth code from it.
    if (request.method === "POST" && request.url === "/complete") {
      // Drain the POST body before responding
      request.resume();
      request.on("end", () => {
        response.writeHead(302, {
          Location: `msauth.com.gm.mychevrolet://auth?code=${encodeURIComponent(options.authCode)}`,
          "cache-control": "no-store",
        });
        response.end();
      });
      return;
    }

    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(createDiagnosticHtml(options));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}/`,
  };
}

async function runDiagnostic() {
  const pythonExecutable = getPythonExecutable();
  const authScriptPath = getAuthScriptPath();

  const expectedEmail = "diagnostic@example.com";
  const expectedPassword = "DiagnosticPassword123!";
  const expectedAuthCode = "DIAGNOSTIC_AUTH_CODE";
  const useConfiguredUrl = Boolean(process.env.ONSTARJS_BROWSER_DIAGNOSTIC_URL);

  const diagnosticServer = useConfiguredUrl
    ? null
    : await startDiagnosticServer({
        expectedEmail,
        expectedPassword,
        authCode: expectedAuthCode,
      });

  const payload = {
    authorizationUrl:
      process.env.ONSTARJS_BROWSER_DIAGNOSTIC_URL ?? diagnosticServer.url,
    diagnosticOnly:
      useConfiguredUrl && !process.env.ONSTARJS_BROWSER_DIAGNOSTIC_AUTH_CODE,
    simulateNavigationAuthCode:
      process.env.ONSTARJS_BROWSER_DIAGNOSTIC_AUTH_CODE,
    username: expectedEmail,
    password: expectedPassword,
    totpKey: "ABCDEFGHIJKLMNOP",
  };

  console.log(`Using Python:      ${pythonExecutable}`);
  console.log(`Using auth script: ${authScriptPath}`);

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
        reject(
          new Error(
            `invisible_playwright diagnostic produced no JSON result; exit ${code}`,
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(lastLine));
      } catch (error) {
        reject(
          new Error(
            `Failed to parse invisible_playwright diagnostic result: ${error.message}. Last line: ${lastLine}`,
          ),
        );
      }
    });
    child.stdin.end(JSON.stringify(payload));
  }).finally(
    () =>
      new Promise((resolve) => {
        if (!diagnosticServer) {
          resolve();
          return;
        }
        diagnosticServer.server.close(resolve);
      }),
  );

  if (!result.ok) {
    throw new Error(
      result.detail
        ? `${result.error} (${result.detail})`
        : result.error || "invisible_playwright browser diagnostic failed",
    );
  }

  if (!useConfiguredUrl && result.authCode !== expectedAuthCode) {
    throw new Error(
      `Diagnostic did not capture expected auth code. Expected ${expectedAuthCode}, got ${result.authCode}`,
    );
  }

  console.log("invisible_playwright browser diagnostic passed");
}

runDiagnostic().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
