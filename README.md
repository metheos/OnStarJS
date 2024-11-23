# OnStarJS

[![npm version](https://badge.fury.io/js/onstarjs2.svg)](https://badge.fury.io/js/onstarjs2)
[![Build Status](https://github.com/BigThunderSR/OnStarJS/workflows/build/badge.svg)](https://github.com/BigThunderSR/OnStarJS/actions?query=workflow%3Abuild)
[![Coverage Status](https://coveralls.io/repos/github/BigThunderSR/OnStarJS/badge.svg?branch=master)](https://coveralls.io/github/BigThunderSR/OnStarJS?branch=master)

An unofficial NodeJS library to make OnStar requests. This version has been forked from [samrum/OnStarJS](https://github.com/samrum/OnStarJS) and includes the new TOTP login mechanism developed by [metheos](https://github.com/metheos/).

**Use at your own risk. This is an unofficial library.**

# Usage

Use the Get Account Vehicles request to see which requests your vehicle supports if you don't already know.

# New Requirement as of 2024-11-19

Updated to use TOTP to fulfill new authentication process from GM.

You will need to change your OnStar account's MFA method to "Third-Party Authenticator App"

_The "Third-Party Authenticator App" option doesn't seem to show up on mobile, so please try from a desktop browser._

**You will need to capture your TOTP key from the "Third-Party Authenticator App" setup so that you can provide it in your .env or initialization config.**

You may be able to obtain your TOTP key by inspecting/hovering over the link under the QR code **when you are setting it up.**

If you use an authenticator app such as [Stratum](https://stratumauth.com/), [Bitwarden](https://bitwarden.com/), or [Vaultwarden](https://github.com/dani-garcia/vaultwarden) that allows you to view your TOTP key, you can view it at any time.

In the IOS Passwords app you can tap "Copy Setup URL" and obtain the secret from the copied data.

_If you cannot find the option to configure a "Third-Party Authenticator App" on your GM account page, try contacting OnStar to see if there is another way to enable it._

## Sample

Use a random version 4 uuid as a deviceId. Generator available [here](https://www.uuidgenerator.net/version4).

```
import OnStar from "onstarjs";

const onStar = OnStar.create({
  deviceId: "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
  vin: "1G2ZF58B774109863",
  username: "foo@bar.com",
  password: "p@ssw0rd",
  onStarPin: "1234",
  onStarTOTP: "XXXXXXXXXXXXXXXX"
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

Default Value: true

When false, requests resolve when the API returns an 'In Progress' response. For requests that return data, this option is ignored.

This is useful because, with the usual request polling to wait for a "Complete" response from the API, requests will take much longer to resolve.

</details>
<details>
<summary>requestPollingIntervalSeconds</summary>

Default Value: 6

When `checkRequestStatus` is true, this is how often status check requests will be made (in seconds)

</details>
<details>
<summary>requestPollingTimeoutSeconds</summary>

Default Value: 90

When `checkRequestStatus` is true, this is how long a request will make subsequent status check requests before timing out (in seconds)

</details>

## Responses

For commands that return data like diagnostics or location, the data returned by the API is accessible via `result.response.data`

# Commands

<details>
<summary>Get Account Vehicles</summary>

    onStar.getAccountVehicles();

</details>

<details>
<summary>Start</summary>

    onStar.start();

</details>

<details>
<summary>Cancel Start</summary>

    onStar.cancelStart();

</details>

<details>
<summary>Alert</summary>

    onStar.alert([options]);

| Option   | Default                    | Valid Values               |
| -------- | -------------------------- | -------------------------- |
| action   | ["Flash", "Honk"]          | ["Flash", "Honk"]          |
| delay    | 0                          | Any integer (minutes)      |
| duration | 1                          | Any integer (minutes)      |
| override | ["DoorOpen", "IgnitionOn"] | ["DoorOpen", "IgnitionOn"] |

</details>

<details>
<summary>Cancel Alert</summary>

    onStar.cancelAlert();

</details>

<details>
<summary>Lock Door</summary>

    onStar.lockDoor([options]);

| Option | Default | Valid Values          |
| ------ | ------- | --------------------- |
| delay  | 0       | Any integer (minutes) |

</details>

<details>
<summary>Unlock Door</summary>

    onStar.unlockDoor([options]);

| Option | Default | Valid Values          |
| ------ | ------- | --------------------- |
| delay  | 0       | Any integer (minutes) |

</details>

<details>
<summary>Lock Trunk</summary>

Locks the trunk but doesn't automatically close it.

    onStar.lockTrunk([options]);

| Option | Default | Valid Values          |
| ------ | ------- | --------------------- |
| delay  | 0       | Any integer (minutes) |

</details>

<details>
<summary>Unlock Trunk</summary>

Unlocks the trunk but doesn't automatically open it. All doors remain locked.

    onStar.unlockTrunk([options]);

| Option | Default | Valid Values          |
| ------ | ------- | --------------------- |
| delay  | 0       | Any integer (minutes) |

</details>

<details>
<summary>Location</summary>

Returns the location of the vehicle

    onStar.location();

Example Response

    { location: { lat: '50', long: '-75' } }

</details>

<details>
<summary>Charge Override</summary>

    onStar.chargeOverride([options]);

| Option | Default      | Valid Values                    |
| ------ | ------------ | ------------------------------- |
| mode   | "CHARGE_NOW" | "CHARGE_NOW", "CANCEL_OVERRIDE" |

</details>

<details>
<summary>Get Charging Profile</summary>

    onStar.getChargingProfile();

</details>

<details>
<summary>Set Charging Profile</summary>

    onStar.setChargingProfile([options]);

| Option     | Default     | Valid Values                                                                             |
| ---------- | ----------- | ---------------------------------------------------------------------------------------- |
| chargeMode | "IMMEDIATE" | "DEFAULT_IMMEDIATE", "IMMEDIATE", "DEPARTURE_BASED", "RATE_BASED", "PHEV_AFTER_MIDNIGHT" |
| rateType   | "MIDPEAK"   | "OFFPEAK", "MIDPEAK", "PEAK"                                                             |

</details>

<details>
<summary>Diagnostics</summary>

    onStar.diagnostics([options]);

| Option         | Default                                                                        | Valid Values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| diagnosticItem | ["ODOMETER", "TIRE PRESSURE", "AMBIENT AIR TEMPERATURE", "LAST TRIP DISTANCE"] | ["ENGINE COOLANT TEMP", "ENGINE RPM", "LAST TRIP FUEL ECONOMY", "EV ESTIMATED CHARGE END", "EV BATTERY LEVEL", "OIL LIFE", "EV PLUG VOLTAGE", "LIFETIME FUEL ECON", "HOTSPOT CONFIG", "LIFETIME FUEL USED", "ODOMETER", "HOTSPOT STATUS", "LIFETIME EV ODOMETER", "EV PLUG STATE", "EV CHARGE STATE", "TIRE PRESSURE", "AMBIENT AIR TEMPERATURE", "LAST TRIP DISTANCE", "INTERM VOLT BATT VOLT", "GET COMMUTE SCHEDULE", "GET CHARGE MODE", "EV SCHEDULED CHARGE START", "FUEL TANK INFO", "HANDS FREE CALLING", "ENERGY EFFICIENCY", "VEHICLE RANGE"] |

</details>

# Development

- Clone this repository
- Install latest LTS version of [Node.js](https://nodejs.org/en/)
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`

## Tests

### All

Run both unit and functional tests

    pnpm test

### Unit

    pnpm test:unit

### Auth

    pnpm test:auth

### Functional

These tests will execute actual requests to the OnStar API. They will perform a Get Account Vehicles request followed by a Cancel Alert request and then a Diagnostics request.

Because of this, the test will require actual OnStar credentials to run. To provide them, copy `.env.example` to `.env` and replace the placeholder values inside.

    pnpm test:functional

# Credits

Made possible by [mikenemat](https://github.com/mikenemat/)'s work in [gm-onstar-probe](https://github.com/mikenemat/gm-onstar-probe). Their work describing the process for remote start enabled the rest of the methods implemented here.

[samrum/OnStarJS](https://github.com/samrum/OnStarJS) for the original OnStarJS

New GMAuth functionality implemented by [metheos](https://github.com/metheos/)
