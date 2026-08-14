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

Install project dependencies before first authentication:

```bash
pnpm install
```

## Usage

Use the Get Account Vehicles request to see which requests your vehicle supports if you don't already know.

## Authentication: PKCE Manual Completion

This project now uses PKCE-only authentication and does not automate browser or inbox interactions.

How it works:

1. OnStarJS reuses and refreshes existing Microsoft tokens whenever possible.
2. Only when a fresh Microsoft token set is genuinely required, OnStarJS starts a PKCE session and prints an authorization URL.
3. The user opens that URL, completes interactive sign-in/MFA in their own browser, and extracts the authorization code (for example via browser extension).
4. The user sets the code in `.env` and runs again. OnStarJS resumes PKCE immediately, exchanges the code, stores the new token set, and clears the one-time code from `.env`.

Set this value in `.env` when completing a pending PKCE session:

```env
ONSTARJS_PKCE_AUTH_CODE=<authorization-code-from-redirect>
```

Notes:

- Microsoft token state is treated as primary and is not invalidated due to GM token payload issues.
- PKCE continuation state is persisted so interrupted auth can be resumed on the next run.
- The one-time auth code is cleared after successful token exchange.

### Integration Status File

For containerized environments (Home Assistant, Docker, etc.), OnStarJS writes a machine-readable status file at `.auth_pending_status.json` (in `tokenLocation`) whenever a pending PKCE session is created. This allows integrations to detect and surface the authentication URL to users without parsing logs.

Status file example when authentication is pending:

```json
{
  "status": "pending_auth",
  "message": "Pending authentication. Complete sign-in at the URL below, then provide the callback code.",
  "authorizationUrl": "https://custlogin.gm.com/...",
  "created_at": 1786735774
}
```

Integrations can:

1. Monitor the `tokenLocation` directory for `.auth_pending_status.json`
2. When detected, parse the file and display the `authorizationUrl` to the user
3. Provide a way for the user to input the callback code and set `ONSTARJS_PKCE_AUTH_CODE` in the `.env` file
4. The status file is automatically deleted when authentication succeeds or tokens are cleared

This pattern works offline and requires no HTTP server, making it ideal for Home Assistant addons and similar isolation models.

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
