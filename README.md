# OnStarJS (OnStarJS2)

[![npm](https://img.shields.io/npm/v/onstarjs2.svg?color=green)](https://www.npmjs.com/package/onstarjs2)
[![Create Github Release](https://github.com/BigThunderSR/OnStarJS/actions/workflows/release.yml/badge.svg?event=push)](https://github.com/BigThunderSR/OnStarJS/actions/workflows/release.yml)
[![Publish Package](https://github.com/BigThunderSR/OnStarJS/actions/workflows/publish.yml/badge.svg?event=push)](https://github.com/BigThunderSR/OnStarJS/actions/workflows/publish.yml)
[![Coverage Status](https://img.shields.io/coveralls/github/BigThunderSR/OnStarJS?branch=master)](https://coveralls.io/github/BigThunderSR/OnStarJS?branch=master&kill_cache=1)

<!-- [![Coverage Status](https://coveralls.io/repos/github/BigThunderSR/OnStarJS/badge.svg?branch=master)](https://coveralls.io/github/BigThunderSR/OnStarJS?branch=master&kill_cache=1) -->
<!-- [![npm version](https://badge.fury.io/js/onstarjs2.svg?icon=si%3Anpm)](https://badge.fury.io/js/onstarjs2?icon=si%3Anpm) -->
<!-- [![Build Status](https://github.com/BigThunderSR/OnStarJS/workflows/build/badge.svg)](https://github.com/BigThunderSR/OnStarJS/actions?query=workflow%3Abuild) -->

An unofficial NodeJS library to make OnStar requests. This version has been forked from [samrum/OnStarJS](https://github.com/samrum/OnStarJS) and includes the new TOTP login mechanism and support for the v3 API implemented by [metheos](https://github.com/metheos/).

Published as OnStarJS2 at <https://www.npmjs.com/package/onstarjs2> [![npm](https://img.shields.io/npm/v/onstarjs2.svg?color=green)](https://www.npmjs.com/package/onstarjs2)

**Use at your own risk. This is an unofficial library.**

## Prerequisites

GM authentication uses [invisible_playwright](https://github.com/feder-cr/invisible_playwright), a patched Firefox browser with fingerprinting applied at the C++ level and humanized mouse/keyboard events built in. Run the one-time setup before the first authentication:

```bash
pnpm run setup:invisible_playwright
```

This creates a `.venv` Python environment, installs `invisible_playwright` and `pyotp`, and downloads the patched Firefox binary (~100 MB, SHA256-verified).

Set `ONSTARJS_PYTHON` if you need to point to a specific Python 3.11+ interpreter.

## Usage

Use the Get Account Vehicles request to see which requests your vehicle supports if you don't already know.

## Authentication: MFA Setup

OnStarJS requires Multi-Factor Authentication (MFA) for GM account security. This library supports **email-based MFA only**.

**Important Timeline:** By the end of August 2026, GM will discontinue TOTP and will only support email and SMS MFA. This library supports email MFA exclusively (SMS is not supported). If your account is currently configured for TOTP, you should migrate to email MFA before the deadline.

### Email MFA (Recommended) — Current Method

GM is transitioning all accounts to email-based multi-factor authentication.

**How It Works:**

1. When you log in, GM sends a 6-digit verification code to your registered email address.
2. OnStarJS connects to your email via IMAP, retrieves the code, and submits it automatically.
3. The entire process is transparent to your application.

**Required Setup:**

Add the following variables to your `.env` file:

```env
# Required
IMAP_SERVER=<your-email-provider-imap-server>
IMAP_PASSWORD=<your-email-app-password-or-password>

# Optional (defaults shown)
IMAP_PORT=993
IMAP_USERNAME=<your-email-address>  # defaults to ONSTAR_USERNAME
IMAP_SUBJECT_PREFIX="Your GM Verification Code:"
IMAP_SENDER="GeneralMotors@em.gm.com"
IMAP_MAILBOX="INBOX"
```

**Security Notes:**

- IMAP credentials are read from environment variables only; they are never stored or logged to disk.
- Connection uses IMAP4_SSL (port 993) with full TLS encryption.
- OnStarJS searches explicitly by sender and subject prefix to prevent accepting unrelated emails.
- OnStarJS rejects emails older than 60 seconds.
- For services requiring app passwords (Gmail, Microsoft, Yahoo, etc.), use an **app-specific password**, not your account password.

**Provider-Specific Setup:**

<details>
<summary>Gmail / Google Workspace</summary>

1. Enable 2-Step Verification on your Google Account ([visit 2-Step Verification settings](https://myaccount.google.com/two-step-verification/status)).
2. Create an **App Password** ([visit App Passwords](https://myaccount.google.com/apppasswords)):
   - Select "Mail" and "Windows Computer" (or your device type).
   - Google will generate a 16-character password.
3. Add to `.env`:
   ```env
   IMAP_SERVER=imap.gmail.com
   IMAP_PASSWORD=<16-character-app-password>
   IMAP_USERNAME=your-email@gmail.com
   ```

**Important:** Regular account passwords do NOT work with Gmail's IMAP access. You must use an App Password.

</details>

<details>
<summary>Outlook / Hotmail / Microsoft 365</summary>

1. Enable 2-Step Verification in your [Microsoft account security settings](https://account.microsoft.com/security).
2. Create an **App Password** ([visit App Passwords](https://account.microsoft.com/security/app-passwords)):
   - Microsoft will generate a 16-character password.
3. Enable IMAP in your [Outlook mail settings](https://outlook.live.com/mail/options/mail/accounts) (usually enabled by default).
4. Add to `.env`:
   ```env
   IMAP_SERVER=imap-mail.outlook.com
   IMAP_PASSWORD=<16-character-app-password>
   IMAP_USERNAME=your-email@outlook.com
   ```

**Note:** Outlook may rate-limit frequent IMAP connections; if you see timeouts, wait a few minutes before retrying.

</details>

<details>
<summary>Yahoo Mail</summary>

1. Enable 2-Step Verification in your [Yahoo Account Security settings](https://login.yahoo.com/account/security).
2. Create an **App Password** ([visit App Passwords](https://login.yahoo.com/account/security)):
   - Yahoo will generate a 16-character password.
3. Ensure IMAP is enabled in [Yahoo Mail settings](https://mail.yahoo.com/) (Settings → Forwarding and POP/IMAP → Enable IMAP).
4. Add to `.env`:
   ```env
   IMAP_SERVER=imap.mail.yahoo.com
   IMAP_PASSWORD=<16-character-app-password>
   IMAP_USERNAME=your-email@yahoo.com
   ```

</details>

<details>
<summary>Apple iCloud Mail</summary>

1. Enable 2-Step Verification on your [Apple ID settings](https://appleid.apple.com/account/security).
2. Create an **App-Specific Password** ([visit App Passwords](https://appleid.apple.com/account/security)):
   - Apple will generate a 16-character password.
3. Add to `.env`:
   ```env
   IMAP_SERVER=imap.mail.me.com
   IMAP_PASSWORD=<16-character-app-password>
   IMAP_USERNAME=your-email@icloud.com
   ```

</details>

<details>
<summary>FastMail</summary>

1. Enable 2-Step Verification in [FastMail security settings](https://www.fastmail.com/secure/).
2. Create an **App Password** (Settings → Security → Managed passwords):
   - FastMail will display your app password.
3. Add to `.env`:
   ```env
   IMAP_SERVER=imap.fastmail.com
   IMAP_PASSWORD=<app-password>
   IMAP_USERNAME=your-email@fastmail.com
   ```

</details>

<details>
<summary>Custom Email Provider (ProtonMail, Tutanota, etc.)</summary>

For other providers, check their documentation for:

- IMAP server hostname and port
- Whether app-specific passwords are required
- Whether IMAP is enabled by default or must be activated

Add to `.env`:

```env
IMAP_SERVER=<your-provider-imap-server>
IMAP_PORT=993  # or your provider's IMAP port
IMAP_PASSWORD=<your-app-password-or-password>
IMAP_USERNAME=<your-email-address>
IMAP_MAILBOX=<your-email-mailbox-name>  # often "INBOX", sometimes "Inbox" or other variants
```

**ProtonMail Note:** ProtonMail does not support standard IMAP. Use the email MFA method with your regular Gmail/Outlook forwarding address instead.

**Tutanota Note:** Tutanota does not support standard IMAP. Consider using a secondary email address for receiving GM codes.

</details>

**Troubleshooting Email MFA:**

- **"IMAP_SERVER is not set"**: Add `IMAP_SERVER` and `IMAP_PASSWORD` to your `.env` file.
- **"IMAP login failed"**: Verify the app password is correct (not your account password) and that IMAP is enabled for your account.
- **Timeout waiting for email**: Check that your email provider is receiving the GM code. Verify the sender (`IMAP_SENDER`) and subject prefix (`IMAP_SUBJECT_PREFIX`) match your actual GM emails. Check your spam/junk folder.
- **System time is off**: Email timestamp validation will reject codes if your system clock is significantly skewed. Sync your system time via NTP.

---

### TOTP (Third-Party Authenticator App) — Deprecated

> ⚠️ **DEPRECATED:** TOTP support will be **removed in a future release**.
>
> **Important:** GM will discontinue TOTP and only support email and SMS MFA by the end of August 2026. This library supports email MFA exclusively (SMS is not supported). If your account currently uses TOTP, **you must migrate to email MFA before that deadline**. After August 2026, TOTP will not work with GM's authentication system, and this library's TOTP support will be removed.

**If you currently use TOTP and have not yet migrated to email MFA:**

Your GM account must have "Third-Party Authenticator App" configured as your MFA method. If you haven't already:

1. Log into your GM OnStar account via the web (desktop browser recommended).
2. Navigate to account security settings and select "Third-Party Authenticator App" for MFA.
3. Scan the QR code with an authenticator app (Stratum, Bitwarden, Vaultwarden, iOS Passwords app, etc.).
4. Extract your TOTP secret key and provide it in your configuration:

```javascript
const onStar = OnStar.create({
  deviceId: "...",
  vin: "...",
  username: "...",
  password: "...",
  onStarPin: "...",
  onStarTOTP: "YOUR_TOTP_SECRET_KEY_HERE", // 16-character string
});
```

Or via environment variable:

```env
ONSTAR_TOTP=YOUR_TOTP_SECRET_KEY_HERE
```

**Note:** TOTP keys are 16 alphanumeric characters. Valid system time (NTP sync) is required for TOTP to work correctly.

**Migration Path:** To move from TOTP to email MFA, update your GM account to use email-based MFA and then use the email MFA configuration above instead of `onStarTOTP`.

---

## Sample

Use a random version 4 uuid as a deviceId. Generator available [at this link](https://www.uuidgenerator.net/version4).

```javascript
import OnStar from "onstarjs";

const onStar = OnStar.create({
  deviceId: "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
  vin: "1G2ZF58B774109863",
  username: "foo@bar.com",
  password: "p@ssw0rd",
  onStarPin: "1234",
  onStarTOTP: "XXXXXXXXXXXXXXXX",
});

try {
  await onStar.alert({
    action: ["Flash"],
  });

  await onStar.start();
} catch (e) {
  console.error(e);
}
```

## Additional Configuration Options

<details>
<summary>checkRequestStatus</summary>

Default Value: `true`

When false, requests resolve when the API returns an 'In Progress' response. For requests that return data, this option is ignored.

This is useful because, with the usual request polling to wait for a "Complete" response from the API, requests will take much longer to resolve.

</details>
<details>
<summary>requestPollingIntervalSeconds</summary>

Default Value: `6`

When `checkRequestStatus` is true, this is how often status check requests will be made (in seconds)

</details>
<details>
<summary>requestPollingTimeoutSeconds</summary>

Default Value: `90`

When `checkRequestStatus` is true, this is how long a request will make subsequent status check requests before timing out (in seconds)

</details>

## Responses

For commands that return data like diagnostics or location, the data returned by the API is accessible via `result.response.data`

## Commands

### Action Command API Compatibility

Action commands (start, cancel start, lock/unlock doors and trunk, alert, cancel alert, flash lights, and stop lights) automatically use the latest API version (v3) and will fall back to the legacy API (v1) if the vehicle doesn't support the newer version. This ensures compatibility across all vehicle types (ICE, Hybrid, and EV) without requiring manual configuration.

The library caches which API version works for your vehicle in memory during the session to optimize subsequent requests.

<details id="get-account-vehicles">
<summary>Get Account Vehicles</summary>

Returns a list of all vehicles associated with your OnStar account, including VINs, make, model, year, and OnStar account status.

```javascript
onStar.getAccountVehicles();
```

</details>

<details id="get-vehicle-details">
<summary>Get Vehicle Details</summary>

Returns detailed vehicle information including make, model, year, RPO codes, permissions, available vehicle commands, colors, metadata, and OnStar account info.

```javascript
onStar.getVehicleDetails([vin]);
```

| Option | Default        | Valid Values  |
| ------ | -------------- | ------------- |
| vin    | Configured VIN | Any valid VIN |

</details>

<details id="get-onstar-plan">
<summary>Get OnStar Plan</summary>

Returns OnStar subscription plan information including offers, active plans, orders, plan expiry info, and OnStar account status (status, owner account, shared flag).

**Note:** Plan detail fields (`planInfo`, `planExpiryInfo`, `activePlans`, `orders`, `offers`) are only populated for primary account holders. Shared accounts will receive `onstarInfo` with the active status but plan details will be empty or trigger partial errors that are handled gracefully.

> **⚠️ Changes in v2.16.0:**
>
> - **Fixed `offers` field names** — The `offers` sub-fields have been corrected to match the current API schema (`productCode`, `offerName`, `associatedOfferingCode`, `retailPrice`, `billingCadence`, `productRank`). The previous sub-fields (`offerId`, `expirationDate`, `category`) no longer exist in the API.
> - **Partial error tolerance** — Previously, any GraphQL error in the response caused the method to throw. Now, if `vehicleDetails` data is present alongside errors (e.g. shared accounts where offers fail), the method returns the partial data with a warning instead of throwing.
> - **New fields added** — `onstarInfo`, `activePlans`, and `orders` are now included in the response. These are additive and non-breaking.

```javascript
onStar.getOnstarPlan([vin]);
```

| Option | Default        | Valid Values  |
| ------ | -------------- | ------------- |
| vin    | Configured VIN | Any valid VIN |

</details>

<details id="get-vehicle-recall-info">
<summary>Get Vehicle Recall Info</summary>

Returns vehicle recall information including recall status, repair status, descriptions, and completion dates.

```javascript
onStar.getVehicleRecallInfo([vin]);
```

| Option | Default        | Valid Values  |
| ------ | -------------- | ------------- |
| vin    | Configured VIN | Any valid VIN |

</details>

<details id="get-warranty-info">
<summary>Get Warranty Info</summary>

Returns vehicle warranty information including warranty types (powertrain, bumper-to-bumper, corrosion, emissions, etc.), coverage dates, mileage limits, and current status.

```javascript
onStar.getWarrantyInfo([vin]);
```

| Option | Default        | Valid Values  |
| ------ | -------------- | ------------- |
| vin    | Configured VIN | Any valid VIN |

</details>

<details id="get-sxm-subscription-info">
<summary>Get SXM Subscription Info</summary>

Returns SiriusXM satellite radio subscription information including device ID, subscription status, channel account details, and deactivation info.

```javascript
onStar.getSxmSubscriptionInfo([vin]);
```

| Option | Default        | Valid Values  |
| ------ | -------------- | ------------- |
| vin    | Configured VIN | Any valid VIN |

</details>

<details id="diagnostics">
<summary>Diagnostics</summary>

Returns comprehensive vehicle diagnostics including odometer, tire pressure, fuel economy, battery levels, and other vehicle health information.

**Note:** The v3 API automatically returns all available diagnostic data. The previous `diagnosticItem` options parameter from the v1 API is no longer supported.

```javascript
onStar.diagnostics();
```

</details>

<details id="location">
<summary>Location</summary>

Returns the vehicle's current location.

```javascript
onStar.location();
```

Example Response

```json
{ "location": { "lat": "50", "long": "-75" } }
```

</details>

<details id="start">
<summary>Start</summary>

Starts the vehicle's engine remotely.

```javascript
onStar.start();
```

</details>

<details id="cancel-start">
<summary>Cancel Start</summary>

Cancels a remote start command that is currently active.

```javascript
onStar.cancelStart();
```

</details>

<details id="alert">
<summary>Alert</summary>

Triggers the vehicle's alerts remotely by flashing lights and/or honking the horn.

```javascript
onStar.alert([options]);
```

| Option   | Default                    | Valid Values               |
| -------- | -------------------------- | -------------------------- |
| action   | ["Flash", "Honk"]          | ["Flash", "Honk"]          |
| delay    | 0                          | Any integer (minutes)      |
| duration | 1                          | Any integer (minutes)      |
| override | ["DoorOpen", "IgnitionOn"] | ["DoorOpen", "IgnitionOn"] |

</details>

<details id="cancel-alert">
<summary>Cancel Alert</summary>

Cancels an active alert command.

```javascript
onStar.cancelAlert();
```

</details>

<details id="flash-lights">
<summary>Flash Lights</summary>

Flashes the vehicle's lights remotely without honking the horn.

```javascript
onStar.flashLights([options]);
```

| Option   | Default      | Valid Values               |
| -------- | ------------ | -------------------------- |
| delay    | 0            | Any integer (minutes)      |
| duration | 1            | Any integer (minutes)      |
| override | ["DoorOpen"] | ["DoorOpen", "IgnitionOn"] |

</details>

<details id="stop-lights">
<summary>Stop Lights</summary>

Stops an active flash lights command.

```javascript
onStar.stopLights();
```

</details>

<details id="lock-door">
<summary>Lock Door</summary>

Locks all the vehicle's doors remotely.

```javascript
onStar.lockDoor([options]);
```

| Option | Default | Valid Values          |
| ------ | ------- | --------------------- |
| delay  | 0       | Any integer (minutes) |

</details>

<details id="unlock-door">
<summary>Unlock Door</summary>

Unlocks all the vehicle's doors remotely.

```javascript
onStar.unlockDoor([options]);
```

| Option | Default | Valid Values          |
| ------ | ------- | --------------------- |
| delay  | 0       | Any integer (minutes) |

</details>

<details id="lock-trunk">
<summary>Lock Trunk</summary>

Locks the vehicle's trunk remotely but doesn't automatically close it.

```javascript
onStar.lockTrunk([options]);
```

| Option | Default | Valid Values          |
| ------ | ------- | --------------------- |
| delay  | 0       | Any integer (minutes) |

</details>

<details id="unlock-trunk">
<summary>Unlock Trunk</summary>

Unlocks the vehicle's trunk remotely but doesn't automatically open it. All doors remain locked.

```javascript
onStar.unlockTrunk([options]);
```

| Option | Default | Valid Values          |
| ------ | ------- | --------------------- |
| delay  | 0       | Any integer (minutes) |

</details>

<details id="get-ev-charging-metrics">
<summary>Get EV Charging Metrics</summary>

Returns current EV charging metrics and status information for electric vehicles.

```javascript
onStar.getEVChargingMetrics([options]);
```

| Option        | Default      | Valid Values             |
| ------------- | ------------ | ------------------------ |
| clientVersion | "8.5.0.8060" | Any version string       |
| os            | "a"          | "a" (Android), "I" (iOS) |

</details>

<details id="refresh-ev-charging-metrics">
<summary>Refresh EV Charging Metrics</summary>

Returns fresh EV charging metrics and status information for electric vehicles. Unlike `getEVChargingMetrics()` which retrieves existing data, this method forces the vehicle to generate updated telemetry before returning.

```javascript
onStar.refreshEVChargingMetrics([options]);
```

| Option        | Default      | Valid Values             |
| ------------- | ------------ | ------------------------ |
| clientVersion | "8.5.0.8060" | Any version string       |
| os            | "a"          | "a" (Android), "I" (iOS) |

</details>

<details id="set-charge-level-target">
<summary>Set Charge Level Target</summary>

Sets the target charge level percentage for electric vehicles.

```javascript
onStar.setChargeLevelTarget(tcl, [options]);
```

| Option           | Default        | Valid Values             |
| ---------------- | -------------- | ------------------------ |
| tcl              | (required)     | 0-100 (percentage)       |
| noMetricsRefresh | false          | true, false              |
| clientRequestId  | auto-generated | Any UUID string          |
| clientVersion    | "8.5.0.8060"   | Any version string       |
| os               | "a"            | "a" (Android), "I" (iOS) |

</details>

<details id="stop-charging">
<summary>Stop Charging</summary>

Stops the current charging session for electric vehicles.

```javascript
onStar.stopCharging([options]);
```

| Option           | Default        | Valid Values             |
| ---------------- | -------------- | ------------------------ |
| noMetricsRefresh | false          | true, false              |
| clientRequestId  | auto-generated | Any UUID string          |
| clientVersion    | "8.5.0.8060"   | Any version string       |
| os               | "a"            | "a" (Android), "I" (iOS) |

</details>

<details>
<summary>⚠️ Charge Override (Deprecated)</summary>

**Deprecated:** This v1 API method is no longer available. Use [`setChargeLevelTarget()`](#set-charge-level-target) and [`stopCharging()`](#stop-charging) instead for EV charging control.

```javascript
// DEPRECATED - Do not use
onStar.chargeOverride([options]);
```

</details>

<details>
<summary>⚠️ Get Charging Profile (Deprecated)</summary>

**Deprecated:** This v1 API method is no longer available. Use [`getEVChargingMetrics()`](#get-ev-charging-metrics) instead to retrieve current charging information.

```javascript
// DEPRECATED - Do not use
onStar.getChargingProfile();
```

</details>

<details>
<summary>⚠️ Set Charging Profile (Deprecated)</summary>

**Deprecated:** This v1 API method is no longer available. Use [`setChargeLevelTarget()`](#set-charge-level-target) instead to configure EV charging settings.

```javascript
// DEPRECATED - Do not use
onStar.setChargingProfile([options]);
```

</details>

## Development

- Clone this repository
- Install latest LTS version of [Node.js](https://nodejs.org/en/)
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`

## Tests

### All

Run both unit and functional tests.

`pnpm test`

### Unit

`pnpm test:unit`

### Auth

`pnpm test:auth`

### Reauth

Tests the re-authentication flow by simulating expired tokens and browser reinitialization scenarios. This is particularly useful for testing long-running applications that need to re-authenticate periodically.

`pnpm test:reauth`

### Functional

These tests will execute actual requests to the OnStar API. They will perform a Get Account Vehicles request followed by a Cancel Alert request and then a Diagnostics request.

Because of this, the test will require actual OnStar credentials to run. To provide them, copy `.env.example` to `.env` and replace the placeholder values inside.

`pnpm test:functional`

## Credits

- [mikenemat](https://github.com/mikenemat/)'s [gm-onstar-probe](https://github.com/mikenemat/gm-onstar-probe) - Their work describing the process for remote start enabled the rest of the methods implemented here
- [samrum/OnStarJS](https://github.com/samrum/OnStarJS) - Original OnStarJS implementation
- [metheos](https://github.com/metheos/) - New GMAuth functionality, TOTP authentication implementation, and v3 API support
