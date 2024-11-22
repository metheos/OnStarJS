import dotenv from "dotenv";
dotenv.config();
import OnStar from "../../src/index";

jest.setTimeout(15000);

const {
  DEVICEID,
  VIN,
  ONSTAR_USERNAME,
  ONSTAR_PASSWORD,
  ONSTAR_PIN,
  ONSTAR_TOTPKEY,
} = process.env;

if (
  !DEVICEID ||
  !VIN ||
  !ONSTAR_USERNAME ||
  !ONSTAR_PASSWORD ||
  !ONSTAR_PIN ||
  !ONSTAR_TOTPKEY
) {
  throw new Error("Missing environment config for functional tests");
}

describe("OnStarJs", () => {
  let onStar: OnStar;

  beforeAll(() => {
    onStar = OnStar.create({
      deviceId: DEVICEID,
      vin: VIN,
      username: ONSTAR_USERNAME,
      password: ONSTAR_PASSWORD,
      onStarPin: ONSTAR_PIN,
      onStarTOTP: ONSTAR_TOTPKEY,
      checkRequestStatus: false,
    });
  });

  test("Unupgraded Command Successful", async () => {
    const result = await onStar.getAccountVehicles();
    // if (result.response) {
    //   console.log(JSON.stringify(result.response.data, null, 2));
    // }

    expect(result.status).toEqual("success");
    expect(result.response?.data).toHaveProperty("vehicles");
  });

  test("Upgraded Command Successful", async () => {
    const result = await onStar.cancelAlert();

    expect(result.status).toEqual("success");
    expect(result.response?.data).toHaveProperty("commandResponse");
  });

  test.skip("Diagnostics Request Successful", async () => {
    onStar.setCheckRequestStatus(true);

    const result = await onStar.diagnostics();

    if (!result.response?.data || typeof result.response?.data === "string") {
      throw new Error("Invalid response returned");
    }
    // console.log(JSON.stringify(result.response.data, null, 2));

    expect(result.status).toEqual("success");
    expect(result.response?.data.commandResponse?.status).toEqual("success");
    expect(result.response?.data.commandResponse?.body).toHaveProperty(
      "diagnosticResponse",
    );
  }, 90000);
});
