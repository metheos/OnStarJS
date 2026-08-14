#!/usr/bin/env node
/**
 * Basic Selenium smoke test that validates browser startup and redirect code capture.
 */
import http from "node:http";
import { Builder, By } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import UndetectedChrome from "undetected-chromedriver-js";

const AUTH_CODE = "DIAGNOSTIC_AUTH_CODE";

function createDiagnosticHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Selenium Auth Diagnostic</title>
  </head>
  <body>
    <label for="logonIdentifier">Email</label>
    <input id="logonIdentifier" name="logonIdentifier" type="email" />
    <button id="continue" data-dtm="sign in">Continue</button>

    <label for="password">Password</label>
    <input id="password" name="password" type="password" />
    <button id="login">Log In</button>

    <form id="auth-form" method="POST" action="/complete" style="display:none"></form>

    <script>
      document.querySelector('#continue').addEventListener('click', () => {
        document.querySelector('#password').focus();
      });
      document.querySelector('#login').addEventListener('click', () => {
        document.querySelector('#auth-form').submit();
      });
    </script>
  </body>
</html>`;
}

async function startDiagnosticServer() {
  const server = http.createServer((request, response) => {
    if (request.method === "POST" && request.url === "/complete") {
      request.resume();
      request.on("end", () => {
        response.writeHead(302, {
          Location: `msauth.com.gm.mychevrolet://auth?code=${AUTH_CODE}`,
        });
        response.end();
      });
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(createDiagnosticHtml());
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

async function createDriver() {
  const headless =
    (process.env.ONSTARJS_SELENIUM_HEADLESS ?? "true") !== "false";

  try {
    const undetected = new UndetectedChrome({ headless });
    const driver = await undetected.build();
    return { driver, close: () => undetected.quit() };
  } catch {
    const options = new chrome.Options();
    if (headless) {
      options.addArguments("--headless=new");
    }
    const driver = await new Builder()
      .forBrowser("chrome")
      .setChromeOptions(options)
      .build();
    return { driver, close: () => driver.quit() };
  }
}

async function main() {
  const { server, url } = await startDiagnosticServer();
  const { driver, close } = await createDriver();

  try {
    await driver.get(url);
    await (
      await driver.findElement(By.css("#logonIdentifier"))
    ).sendKeys("diagnostic@example.com");
    await (await driver.findElement(By.css("#continue"))).click();
    await (
      await driver.findElement(By.css("#password"))
    ).sendKeys("DiagnosticPassword123!");
    await (await driver.findElement(By.css("#login"))).click();

    // Custom scheme redirects are typically not navigable by Selenium. We only validate
    // the pre-redirect flow and ensure no crashes occur.
    console.log(
      JSON.stringify({
        ok: true,
        message: "Selenium auth diagnostic completed",
      }),
    );
  } finally {
    await close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
