import RequestService from "../../src/RequestService";
import { testConfig, authToken, expiredAuthToken } from "./testData";
import { HttpClient, CommandResponseStatus } from "../../src/types";
import Request from "../../src/Request";

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
    const result = await requestService.diagnostics();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("getAccountVehicles", async () => {
    const result = await requestService.getAccountVehicles();

    expect(result.status).toEqual(CommandResponseStatus.success);
  });

  test("location", async () => {
    const result = await requestService.location();

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

    await expect(
      requestService.setClient(httpClient).start(),
    ).rejects.toThrowError(/^Command Timeout$/);
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

    await expect(
      requestService.setClient(httpClient).start(),
    ).rejects.toThrowError(/^Command Failure$/);
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

    await expect(
      requestService.setClient(httpClient).start(),
    ).rejects.toThrowError(/^Request Failed with status 400 - invalid_client$/);
  });

  test("axiosRequestNoResponseError", async () => {
    httpClient.post = jest.fn().mockRejectedValue({
      isAxiosError: true,
      request: {
        body: "requestBody",
      },
    });

    await expect(
      requestService.setClient(httpClient).start(),
    ).rejects.toThrowError(/^No response$/);
  });

  test("axiosRequestError", async () => {
    httpClient.post = jest.fn().mockRejectedValue({
      isAxiosError: true,
      message: "Test error",
    });

    await expect(
      requestService.setClient(httpClient).start(),
    ).rejects.toThrowError(/^Test error$/);
  });

  test("requestError", async () => {
    httpClient.post = jest.fn().mockRejectedValue(new Error("errorMessage"));

    await expect(
      requestService.setClient(httpClient).start(),
    ).rejects.toThrowError(/^errorMessage$/);
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

  test("getHeaders", async () => {
    const request = new Request("https://foo.bar");
    const headers = await requestService["getHeaders"](request);
    expect(headers).toHaveProperty("Authorization");
  });

  test("checkRequestPause", async () => {
    jest.useFakeTimers();
    const pausePromise = requestService["checkRequestPause"]();
    jest.advanceTimersByTime(1000);
    await expect(pausePromise).resolves.toBeUndefined();
    jest.useRealTimers();
  });

  // Additional tests for increased coverage

  test("refreshAuthToken", async () => {
    jest
      .spyOn(requestService as any, "createNewAuthToken")
      .mockResolvedValue("newToken");
    const token = await requestService["refreshAuthToken"]();
    expect(token).toEqual("newToken");
  });
  /*
  test("createNewAuthToken", async () => {
    httpClient.post = jest.fn().mockResolvedValue({
      data: {
        access_token: "newAccessToken",
      },
    });

    const token = await requestService["createNewAuthToken"]();
    //console.log(token);
    let response = JSON.parse(JSON.stringify(token));
    expect(token.token_type).toBe("bearer");
    expect(Math.floor(response.expires_at)).toBeGreaterThanOrEqual(
      Math.floor(Date.now() / 1000),
    );
    expect(response.expires_at).toBeGreaterThanOrEqual(1798);
  });
*/
});
