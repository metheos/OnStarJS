# OnStarJS Home Assistant Integration Strategy

## Overview

This document describes how Home Assistant (HA) addons or integrations can embed OnStarJS and handle PKCE-based authentication without requiring users to watch logs or manually extract codes.

## Problem Statement

Traditional automation auth flows assume:

- Developer actively monitors logs
- Browser access available to extract callback URLs
- Manual code passing is acceptable

HA environments differ:

- Addon/integration runs isolated in a container
- User interface is the HA dashboard only
- Logs are not the primary user channel
- Auth state must be machine-readable and user-discoverable

## Solution: Status File + Notification Pattern

OnStarJS writes `.auth_pending_status.json` (in configured `tokenLocation`) whenever a pending PKCE session is created. HA integrations detect this file and:

1. **Parse** the status file to extract the authorization URL
2. **Notify** the user via HA's notification system
3. **Collect** the callback code via an HA frontend dialog or service call
4. **Inject** the code into `.env` and trigger re-auth
5. **Clear** the status file after successful completion

## Status File Format

### Structure

```json
{
  "status": "pending_auth",
  "message": "Pending authentication. Complete sign-in at the URL below, then provide the callback code.",
  "authorizationUrl": "https://custlogin.gm.com/gmb2cprod.onmicrosoft.com/b2c_1a_seamless_mobile_signuporsignin/oauth2/v2.0/authorize?...",
  "created_at": 1786735774
}
```

### Fields

| Field              | Type   | Purpose                                       |
| ------------------ | ------ | --------------------------------------------- |
| `status`           | string | Always `"pending_auth"` when auth is required |
| `message`          | string | Human-readable description for logging        |
| `authorizationUrl` | string | Full OAuth authorization URL (user-clickable) |
| `created_at`       | number | Unix timestamp (seconds) of session creation  |

### File Location

- **Path**: `${tokenLocation}/.auth_pending_status.json`
- **Default**: `./.auth_pending_status.json` (addon working directory)
- **Lifecycle**: Created when pending PKCE session starts; deleted when auth succeeds or tokens clear

## HA Addon Integration Pattern

### 1. Addon Configuration Structure

```yaml
# config/addons/onstarjs/config.yaml
version: 1
slug: onstarjs
name: OnStar JS
description: "OnStar API client for Home Assistant"
image: ghcr.io/example/ha-onstarjs-addon
services:
  api:
    main: true
ports:
  8888/tcp: null
volumes:
  - config
  - share
environment:
  TOKEN_LOCATION: /share/onstarjs/tokens
  LOG_LEVEL: info
options:
  username: ""
  password: ""
  device_id: ""
  totp_key: ""
  vehicle_vin: ""
```

### 2. Addon Entry Script

```bash
#!/bin/bash
# Run OnStarJS service with error handling

set -e

# Load config from HA's configuration.yaml
CONFIG_PATH="/config/addons/onstarjs/config.yaml"
TOKEN_DIR="/share/onstarjs/tokens"

# Ensure token directory exists
mkdir -p "$TOKEN_DIR"

# Start monitoring task in background
node /app/lib/monitor-auth-status.js "$TOKEN_DIR" &

# Run main service (polling for requests, serving API, etc.)
node /app/lib/service.js
```

### 3. Auth Status Monitor

```typescript
// monitor-auth-status.ts
// Runs continuously, watches for pending auth and notifies HA

import fs from "fs";
import path from "path";
import axios from "axios";

const TOKEN_DIR = process.env.TOKEN_LOCATION || "./tokens";
const STATUS_FILE = path.join(TOKEN_DIR, ".auth_pending_status.json");
const HA_API_URL = "http://supervisor/core/api";
const HA_TOKEN = process.env.SUPERVISOR_TOKEN;

interface PendingAuthStatus {
  status: "pending_auth" | "authenticated" | "error";
  authorizationUrl?: string;
  message?: string;
  created_at?: number;
}

let lastNotifiedAt = 0;

async function checkAuthStatus(): Promise<void> {
  try {
    if (!fs.existsSync(STATUS_FILE)) {
      return; // No pending auth
    }

    const rawStatus = fs.readFileSync(STATUS_FILE, "utf-8");
    const status: PendingAuthStatus = JSON.parse(rawStatus);

    if (status.status !== "pending_auth") {
      return;
    }

    // Avoid spamming notifications (once per 5 minutes)
    const now = Date.now();
    if (now - lastNotifiedAt < 5 * 60 * 1000) {
      return;
    }

    await notifyHA(status);
    lastNotifiedAt = now;
  } catch (err) {
    console.error("Auth status check failed:", err);
  }
}

async function notifyHA(status: PendingAuthStatus): Promise<void> {
  // Send persistent notification to HA
  await axios.post(
    `${HA_API_URL}/services/persistent_notification/create`,
    {
      title: "OnStar Authentication Required",
      message: `
Your OnStar session has expired or needs initial setup.

**Action Required:**
1. Click the link below to sign in to your GM account
2. Complete any two-factor authentication
3. You will be redirected to a code (it may not work in all browsers)
4. Copy that code and paste it in the service call below

**Authorization URL:** [Click Here](${status.authorizationUrl})

**Then call this service with your code:**
- Service: \`onstarjs.provide_auth_code\`
- Data: \`code: <your-code-here>\`
      `,
      notification_id: "onstarjs_auth_required",
      data: {
        auth_url: status.authorizationUrl,
        created_at: status.created_at,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${HA_TOKEN}`,
        "Content-Type": "application/json",
      },
    },
  );

  console.log("HA notification sent for pending auth");
}

// Monitor every 30 seconds
setInterval(checkAuthStatus, 30000);

checkAuthStatus(); // Check immediately
```

### 4. Auth Code Collection Service

```typescript
// service-provide-auth-code.ts
// HA service handler for receiving the auth code from user

import fs from "fs";
import path from "path";

const TOKEN_DIR = process.env.TOKEN_LOCATION || "./tokens";
const ENV_FILE = ".env";

export async function handleProvideAuthCode(
  code: string,
  state?: string,
): Promise<{ success: boolean; message: string }> {
  if (!code || code.trim().length === 0) {
    return {
      success: false,
      message: "Auth code cannot be empty",
    };
  }

  try {
    // Parse callback URL if user provided full URL instead of just code
    let authCode = code.trim();
    if (authCode.includes("://") || authCode.startsWith("msauth.")) {
      try {
        const parsed = new URL(authCode);
        authCode = parsed.searchParams.get("code") ?? "";
        if (!authCode) {
          return {
            success: false,
            message: "No authorization code found in callback URL",
          };
        }
      } catch (e) {
        // Not a URL, treat as raw code
      }
    }

    // Update .env with the code
    const envPath = ENV_FILE;
    const envContent = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, "utf-8")
      : "";

    const lines = envContent.split(/\r?\n/);
    const updatedLines = lines.map((line) => {
      if (line.startsWith("ONSTARJS_PKCE_AUTH_CODE=")) {
        return `ONSTARJS_PKCE_AUTH_CODE=${authCode}`;
      }
      return line;
    });

    // Add the var if not present
    const hasAuthCode = updatedLines.some((l) =>
      l.startsWith("ONSTARJS_PKCE_AUTH_CODE="),
    );
    if (!hasAuthCode) {
      updatedLines.push(`ONSTARJS_PKCE_AUTH_CODE=${authCode}`);
    }

    fs.writeFileSync(envPath, updatedLines.join("\n"));

    // Trigger re-authentication
    console.log("Auth code accepted. Triggering re-authentication...");

    // Signal main service to re-run auth immediately
    fs.writeFileSync(".trigger-reauth", "");

    return {
      success: true,
      message:
        "Auth code accepted. Service is re-authenticating now. Check back in 30 seconds.",
    };
  } catch (err) {
    console.error("Error processing auth code:", err);
    return {
      success: false,
      message: `Error: ${(err as Error).message}`,
    };
  }
}
```

### 5. HA Integration Service Definition

```yaml
# config/onstarjs/services.yaml
provide_auth_code:
  name: Provide OnStar Auth Code
  description: "Complete pending OnStar PKCE authentication by providing the authorization code"
  fields:
    code:
      name: Authorization Code
      description: "The code from the GM sign-in redirect. Can be the full callback URL or just the code."
      required: true
      example: "M.R3_BAY..."
    state:
      name: State (optional)
      description: "The state parameter (usually not needed)"
      required: false
      example: ""
```

## HA Frontend Integration (Custom Card / Helpers)

### Option 1: Simple Persistent Notification (Easiest)

The notification approach (shown above) requires users to:

1. Click the link to sign in
2. Copy the code from browser redirect
3. Call the service with the code

**Pros**: Simple, no custom card needed
**Cons**: Manual code copying, not seamless

### Option 2: Custom Frontend Card (Recommended)

```typescript
// www/onstarjs-auth-card.js
// Custom HA card for auth flow

class OnStarJSAuthCard extends HTMLElement {
  setConfig(config) {
    this.config = config;
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  async render() {
    const statusPath = "/.auth_pending_status.json";

    try {
      const response = await fetch(statusPath);
      if (!response.ok) {
        // No pending auth
        this.innerHTML = "";
        return;
      }

      const status = await response.json();

      if (status.status === "pending_auth") {
        this.innerHTML = `
          <ha-card header="OnStar Authentication Required">
            <div class="card-content">
              <p>Your OnStar session needs to be authenticated.</p>
              
              <p>
                <a href="${status.authorizationUrl}" target="_blank" class="auth-link">
                  Click here to sign in to your GM account
                </a>
              </p>
              
              <p>After signing in, paste the authorization code below:</p>
              
              <ha-textfield 
                id="auth-code-input"
                label="Authorization Code"
                placeholder="M.R3_BAY..."
              ></ha-textfield>
              
              <div class="card-actions">
                <ha-button @click="${() => this.submitCode()}">
                  Authenticate
                </ha-button>
              </div>
            </div>
          </ha-card>
        `;
      }
    } catch (err) {
      // Silently ignore (file doesn't exist yet)
    }
  }

  async submitCode() {
    const input = this.querySelector("#auth-code-input");
    const code = input?.value?.trim();

    if (!code) {
      alert("Please enter the authorization code");
      return;
    }

    try {
      await this._hass.callService("onstarjs", "provide_auth_code", {
        code,
      });

      alert(
        "Code submitted. Service is authenticating. Check back in 30 seconds.",
      );
      input.value = "";
    } catch (err) {
      alert(`Error: ${err}`);
    }
  }
}

customElements.define("onstarjs-auth-card", OnStarJSAuthCard);
```

**Configuration in HA dashboard:**

```yaml
views:
  - title: OnStar
    cards:
      - type: "custom:onstarjs-auth-card"
```

### Option 3: Webhook + Browser Extension (Advanced)

For power users, provide a browser extension that:

1. Detects OAuth redirect to `msauth.com.gm.myChevrolet://auth?code=...`
2. Extracts the code
3. Posts to a webhook in the HA addon
4. Addon automatically completes auth

This eliminates manual code copying but requires addon to expose an HTTP endpoint.

## Error States and Recovery

### State: Auth Pending but Not Completing

**Symptom**: Status file exists but service never retries

**Causes**:

- `.env` not mounted as writable volume
- Permission issues in container
- Service not watching for trigger file

**Recovery**:

- Check addon logs for write errors
- Verify volume mounts in addon config
- Manually delete `.auth_pending_status.json` to reset

### State: Code Accepted But Auth Still Fails

**Symptom**: `ONSTARJS_PKCE_AUTH_CODE` set but error persists

**Causes**:

- Code expired (valid ~10 minutes)
- Invalid/malformed code
- State mismatch
- Network connectivity

**Recovery**:

- Clear `ONSTARJS_PKCE_AUTH_CODE` from .env
- Delete `.auth_pending_status.json`
- Restart addon (triggers new auth flow)

### State: Successful Auth, But Notification Persists

**Symptom**: Status file cleared but HA notification still visible

**Solution**: The notification monitor checks status file every 30s. Manual clearing:

- HA UI → Notifications → Dismiss the OnStar notification
- Or wait ~30 minutes for auto-expiry (if configured)

## Best Practices

### 1. **Immutable Auth State in Container**

- Mount `tokenLocation` as a **named volume** in Docker
- Never rely on `ONSTARJS_PKCE_AUTH_CODE` as persistent state
- Use `.env` only for initial setup and one-time code handoff

### 2. **Graceful Degradation**

- If auth fails, log clearly and retry on next service start
- Don't crash the addon; let user fix auth via UI

### 3. **User Experience**

- Provide a direct, clickable link (not just a URL string)
- Support both full callback URL and raw code in code input
- Give clear instructions at each step

### 4. **Monitoring and Logging**

```typescript
// Log auth state transitions for debugging
console.log(`[AUTH] Status transition: ${prev} → ${current}`);
console.log(`[AUTH] Status file: ${statusPath}`);
console.log(`[AUTH] Notification sent to HA`);
console.log(`[AUTH] Code accepted, re-auth triggered`);
```

### 5. **Timeout Handling**

- Authorization URLs expire in ~10 minutes
- Auth codes are valid for ~10 minutes
- Refresh flow automatically creates new pending session if needed
- UI should warn user if delay exceeds 5 minutes

## Testing Checklist

- [ ] Addon starts and creates token directory
- [ ] First auth run creates `.auth_pending_status.json`
- [ ] HA notification appears within 30 seconds
- [ ] Status file is valid JSON and parseable
- [ ] Authorization URL is clickable and working
- [ ] Providing raw code completes auth
- [ ] Providing full callback URL extracts code and completes auth
- [ ] Status file deleted after successful auth
- [ ] Tokens refreshed on next service start (no re-auth required)
- [ ] Notification dismissed after auth succeeds
- [ ] Logs are clear and include auth transition states

## Files Referenced

- [src/auth/GMAuth.ts](../src/auth/GMAuth.ts) — Status file generation (`savePendingAuthStatus()`)
- [README.md](../README.md) — PKCE auth overview
- [.env.example](../.env.example) — Environment variable reference
