import RequestService from "../../src/RequestService";
import { testConfig, authToken, expiredAuthToken } from "./testData";
import { HttpClient, CommandResponseStatus } from "../../src/types";
import Request, { RequestMethod } from "../../src/Request";

describe("RequestService", () => {
  let requestService: RequestService;
  let httpClient: HttpClient;

  const commandResponseUrl = "requestCheckUrl";

  beforeEach(() => {
    const requestTime = Date.now() + 1000;

    httpClient = {
      post: jest
        .fn()
        .mockResolvedValue({
          data: {
            commandResponse: {
              requestTime,
              status: CommandResponseStatus.success,
              url: commandResponseUrl,
            },
          },
        })
        .mockResolvedValueOnce({
          data: {
            commandResponse: {
              requestTime,
              status: CommandResponseStatus.inProgress,
              url: commandResponseUrl,
            },
          },
        }),
      get: jest.fn().mockResolvedValue({
        data: {
          commandResponse: {
            requestTime,
            status: CommandResponseStatus.success,
            url: commandResponseUrl,
          },
        },
      }),
    };

    requestService = new RequestService(testConfig, httpClient)
      .setAuthToken(authToken)
      .setRequestPollingIntervalSeconds(0)
      .setRequestPollingTimeoutSeconds(0);

    // Mock getAuthToken to return a Promise that resolves to the mocked token
    jest
      .spyOn(requestService, "getAuthToken")
      .mockReturnValue(authToken as any);
  });

  test("start", async () => {
    const result = await requestService.start();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("cancelStart", async () => {
    const result = await requestService.cancelStart();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("lockDoor", async () => {
    const result = await requestService.lockDoor();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("unlockDoor", async () => {
    const result = await requestService.unlockDoor();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("lockTrunk", async () => {
    const result = await requestService.lockTrunk();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("unlockTrunk", async () => {
    const result = await requestService.unlockTrunk();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("alert", async () => {
    const result = await requestService.alert();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("cancelAlert", async () => {
    const result = await requestService.cancelAlert();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("chargeOverride", async () => {
    const result = await requestService.chargeOverride();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("getChargingProfile", async () => {
    const result = await requestService.getChargingProfile();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("setChargingProfile", async () => {
    const result = await requestService.setChargingProfile();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("diagnostics", async () => {
    const healthPayload = {
      name: "VEHICLE_STATUS",
      status: "GOOD",
      diagnostics: [],
    };
    httpClient.get = jest.fn().mockResolvedValue({ data: healthPayload });

    const result = await requestService.setClient(httpClient).diagnostics();

    expect(result.status).toEqual(CommandResponseStatus.success);
    expect(result.response?.data).toEqual(healthPayload);
    // Confirm URL used is healthstatus with VIN
    const urlCalled = (httpClient.get as jest.Mock).mock.calls[0][0];
    expect(urlCalled).toContain("/api/v1/vh/vehiclehealth/v1/healthstatus/");
    expect(urlCalled).toContain(testConfig.vin.toUpperCase());
  });

  test("getAccountVehicles", async () => {
    // Override post for this test to simulate GraphQL v3 response
    httpClient.post = jest.fn().mockResolvedValue({
      data: {
        errors: [],
        data: {
          vehicles: [
            {
              vin: "TESTVIN",
              vehicleId: "123",
              make: "Chevrolet",
              model: "Blazer EV",
              year: "2024",
            },
          ],
        },
        extensions: null,
        dataPresent: true,
      },
    });

    const data = await requestService
      .setClient(httpClient)
      .getAccountVehicles();

    expect(data).toHaveProperty("data.vehicles");
    expect(Array.isArray((data as any).data.vehicles)).toBe(true);
  });

  test("location", async () => {
    const result = await requestService.location();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("location triggers update then polls until ready", async () => {
    // First GET returns PENDING, second returns NONE
    const pendingPayload = {
      vehicle: { vin: testConfig.vin, squishVin: "SQUISH" },
      telemetry: {
        data: { session: { updatePending: "PENDING" } },
      },
    };
    const readyPayload = {
      vehicle: { vin: testConfig.vin, squishVin: "SQUISH" },
      telemetry: {
        data: {
          session: { updatePending: "NONE" },
          position: { lat: 1.23, lng: 4.56, geohash: "abc" },
        },
      },
    };

    httpClient.get = jest
      .fn()
      .mockResolvedValueOnce({ data: pendingPayload })
      .mockResolvedValueOnce({ data: readyPayload });

    // Ensure we actually poll: non-zero timeout, zero interval to avoid delays
    requestService
      .setClient(httpClient)
      .setRequestPollingTimeoutSeconds(5)
      .setRequestPollingIntervalSeconds(0);

    const result = await requestService.location();
    expect(result.status).toEqual(CommandResponseStatus.success);
    expect(
      (result.response as any)?.data?.telemetry?.data?.session?.updatePending,
    ).toEqual("NONE");

    // Validate we called sms=true then sms=false
    expect(
      (httpClient.get as jest.Mock).mock.calls.length,
    ).toBeGreaterThanOrEqual(2);
    const firstUrl = (httpClient.get as jest.Mock).mock.calls[0][0];
    const secondUrl = (httpClient.get as jest.Mock).mock.calls[1][0];
    expect(firstUrl).toContain("sms=true");
    expect(secondUrl).toContain("sms=false");
  });

  test("requestWithExpiredAuthToken", async () => {
    httpClient.post = jest
      .fn()
      .mockResolvedValue({
        data: {
          commandResponse: {
            requestTime: Date.now() + 1000,
            status: CommandResponseStatus.success,
            url: commandResponseUrl,
          },
        },
      })
      .mockResolvedValueOnce({
        data: "encodedToken",
      });

    requestService.setAuthToken(expiredAuthToken);

    const result = await requestService.setClient(httpClient).start();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("requestCheckExceedsTimeoutError", async () => {
    httpClient.post = jest.fn().mockResolvedValue({
      data: {
        commandResponse: {
          requestTime: Date.now() - 1000,
          status: CommandResponseStatus.inProgress,
          url: commandResponseUrl,
        },
      },
    });

    await expect(requestService.setClient(httpClient).start()).rejects.toThrow(
      /^Command Timeout$/,
    );
  });

  test("requestStatusFailureError", async () => {
    httpClient.post = jest.fn().mockResolvedValue({
      data: {
        commandResponse: {
          requestTime: Date.now() + 1000,
          status: "failure",
        },
      },
    });

    await expect(requestService.setClient(httpClient).start()).rejects.toThrow(
      /^Command Failure$/,
    );
  });

  test("axiosRequestResponseError", async () => {
    httpClient.post = jest.fn().mockRejectedValue({
      isAxiosError: true,
      response: {
        status: "400",
        statusText: "invalid_client",
        data: "data",
      },
      request: {
        body: "requestBody",
      },
    });

    await expect(requestService.setClient(httpClient).start()).rejects.toThrow(
      /^Request Failed with status 400 - invalid_client$/,
    );
  });

  test("axiosRequestNoResponseError", async () => {
    httpClient.post = jest.fn().mockRejectedValue({
      isAxiosError: true,
      request: {
        body: "requestBody",
      },
    });

    await expect(requestService.setClient(httpClient).start()).rejects.toThrow(
      /^No response$/,
    );
  });

  test("axiosRequestError", async () => {
    httpClient.post = jest.fn().mockRejectedValue({
      isAxiosError: true,
      message: "Test error",
    });

    await expect(requestService.setClient(httpClient).start()).rejects.toThrow(
      /^Test error$/,
    );
  });

  test("requestError", async () => {
    httpClient.post = jest.fn().mockRejectedValue(new Error("errorMessage"));

    await expect(requestService.setClient(httpClient).start()).rejects.toThrow(
      /^errorMessage$/,
    );
  });

  test("setClient", () => {
    const newHttpClient: HttpClient = {
      post: jest.fn(),
      get: jest.fn(),
    };

    requestService.setClient(newHttpClient);
    expect(requestService["client"]).toEqual(newHttpClient);
  });

  test("setAuthToken", () => {
    requestService.setAuthToken(expiredAuthToken);
    expect(requestService["authToken"]).toEqual(expiredAuthToken);
  });

  test("setRequestPollingTimeoutSeconds", () => {
    requestService.setRequestPollingTimeoutSeconds(120);
    expect(requestService["requestPollingTimeoutSeconds"]).toEqual(120);
  });

  test("setRequestPollingIntervalSeconds", () => {
    requestService.setRequestPollingIntervalSeconds(10);
    expect(requestService["requestPollingIntervalSeconds"]).toEqual(10);
  });

  test("setCheckRequestStatus", () => {
    requestService.setCheckRequestStatus(true);
    expect(requestService["checkRequestStatus"]).toEqual(true);
  });

  test("getAuthToken", async () => {
    const token = await requestService.getAuthToken();
    expect(token).toEqual(authToken);
  });

  test("sendRequest", async () => {
    const request = new Request("https://foo.bar");
    const result = await requestService["sendRequest"](request);
    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("sendRequest without commandResponse", async () => {
    httpClient.post = jest.fn().mockResolvedValue({
      data: {},
    });

    const request = new Request("https://foo.bar");
    const result = await requestService
      .setClient(httpClient)
      ["sendRequest"](request);
    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("sendRequest with inProgress status and connect type", async () => {
    httpClient.post = jest.fn().mockResolvedValue({
      data: {
        commandResponse: {
          requestTime: Date.now() + 1000,
          status: CommandResponseStatus.inProgress,
          url: commandResponseUrl,
          type: "connect",
        },
      },
    });

    const request = new Request("https://foo.bar");
    const result = await requestService
      .setClient(httpClient)
      ["sendRequest"](request);
    expect(result.status).toEqual(CommandResponseStatus.inProgress);
  });

  test("getHeaders without auth required", async () => {
    const request = new Request("https://foo.bar").setAuthRequired(false);
    const headers = await requestService["getHeaders"](request);
    expect(headers).not.toHaveProperty("Authorization");
  });

  test("upgradeRequest throws Not Implemented error", async () => {
    await expect(requestService["upgradeRequest"]()).rejects.toThrow(
      "Not Implemented",
    );
  });

  test("makeClientRequest with GET method", async () => {
    const request = new Request("https://foo.bar").setMethod(RequestMethod.Get);
    const response = await requestService["makeClientRequest"](request);
    expect(response).toHaveProperty("data");
  });

  test("makeClientRequest with POST method", async () => {
    const request = new Request("https://foo.bar").setMethod(
      RequestMethod.Post,
    );
    const response = await requestService["makeClientRequest"](request);
    expect(response).toHaveProperty("data");
  });

  test("connectRequest", async () => {
    const result = await requestService["connectRequest"]();
    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("upgradeRequest", async () => {
    await expect(requestService["upgradeRequest"]()).rejects.toThrow(
      "Not Implemented",
    );
  });

  test("connectAndUpgradeAuthToken", async () => {
    jest.spyOn(requestService as any, "connectRequest").mockResolvedValue({});
    jest.spyOn(requestService as any, "upgradeRequest").mockResolvedValue({});

    await requestService["connectAndUpgradeAuthToken"]();
    expect(requestService["authToken"]?.upgraded).toBeTruthy();
  });

  test("checkRequestPause", async () => {
    jest.useFakeTimers();
    const pausePromise = requestService["checkRequestPause"]();
    jest.advanceTimersByTime(1000);
    await expect(pausePromise).resolves.toBeUndefined();
    jest.useRealTimers();
  });
});
