import Request from "../../src/Request";
import RequestError from "../../src/RequestError";
import { CommandResponseStatus, RequestResponse } from "../../src/types";

describe("RequestError", () => {
  test("Property Methods", () => {
    const requestError = new RequestError("Error Message");
    const response = {
      data: {
        commandResponse: {
          requestTime: "time",
          status: CommandResponseStatus.success,
          type: "unlockDoor",
          url: "https://foo.bar",
        },
      },
    };
    const request = new Request("https://foo.bar");

    requestError.setResponse(response);
    expect(requestError.getResponse()).toEqual(response);

    requestError.setRequest(request);
    expect(requestError.getRequest()).toEqual(request);
  });

  test("Response with status and statusText", () => {
    const requestError = new RequestError("HTTP Error");
    // GM error responses have arbitrary shapes — use type assertion
    const response = {
      status: 400,
      statusText: "Bad Request",
      data: { success: false, error: 454, message: "Invalid parameters" },
    } as RequestResponse;

    requestError.setResponse(response);
    const got = requestError.getResponse();

    expect(got).toEqual(response);
    expect(got?.status).toBe(400);
    expect(got?.statusText).toBe("Bad Request");
    expect((got?.data as any)?.error).toBe(454);
  });

  test("Response without status fields (success path)", () => {
    const requestError = new RequestError("Command Failure");
    const response = {
      data: {
        commandResponse: {
          status: CommandResponseStatus.failure,
          type: "lockDoor",
          requestTime: "time",
          url: "https://example.com",
        },
      },
    };

    requestError.setResponse(response);
    const got = requestError.getResponse();

    expect(got?.status).toBeUndefined();
    expect(got?.statusText).toBeUndefined();
    expect(got?.data).toEqual(response.data);
  });

  test("Response is accessible at runtime via property", () => {
    // Verify TypeScript private doesn't block runtime access
    // (important for downstream consumers like onstar2mqtt)
    const requestError = new RequestError("HTTP Error");
    requestError.setResponse({
      status: 401,
      statusText: "Unauthorized",
      data: "Token expired",
    });

    const raw = requestError as any;
    expect(raw.response).toBeDefined();
    expect(raw.response.status).toBe(401);
    expect(raw.response.statusText).toBe("Unauthorized");
    expect(raw.response.data).toBe("Token expired");
  });
});
