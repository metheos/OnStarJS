// import TokenHandler from "./TokenHandler";
import Request, { RequestMethod } from "./Request";
import RequestResult from "./RequestResult";
import RequestError from "./RequestError";
import {
  AlertRequestAction,
  AlertRequestOptions,
  AlertRequestOverride,
  ChargeOverrideMode,
  ChargeOverrideOptions,
  ChargingProfileChargeMode,
  ChargingProfileRateType,
  DoorRequestOptions,
  TrunkRequestOptions,
  HttpClient,
  OAuthToken,
  OnStarConfig,
  RequestResponse,
  Result,
  SetChargingProfileRequestOptions,
  CommandResponseStatus,
  GMAuthConfig,
} from "./types";
import onStarAppConfig from "./onStarAppConfig.json";
import axios from "axios";
import { getGMAPIJWT } from "./auth/GMAuth";

enum OnStarApiCommand {
  Alert = "alert",
  CancelAlert = "cancelAlert",
  CancelStart = "cancelStart",
  ChargeOverride = "chargeOverride",
  GetChargingProfile = "getChargingProfile",
  LockDoor = "lock",
  SetChargingProfile = "setChargingProfile",
  Start = "start",
  UnlockDoor = "unlock",
  LockTrunk = "lockTrunk",
  UnlockTrunk = "unlockTrunk",
}

class RequestService {
  private config: OnStarConfig;
  private gmAuthConfig: GMAuthConfig;
  private authToken?: OAuthToken;
  private checkRequestStatus: boolean;
  private requestPollingTimeoutSeconds: number;
  private requestPollingIntervalSeconds: number;

  constructor(
    config: OnStarConfig,
    private client: HttpClient,
  ) {
    this.config = {
      ...config,
      vin: config.vin.toUpperCase(),
    };

    this.gmAuthConfig = {
      username: this.config.username,
      password: this.config.password,
      deviceId: this.config.deviceId,
      totpKey: this.config.onStarTOTP,
      tokenLocation: this.config.tokenLocation ?? "./",
    };

    this.checkRequestStatus = this.config.checkRequestStatus ?? true;
    this.requestPollingTimeoutSeconds =
      config.requestPollingTimeoutSeconds ?? 90;
    this.requestPollingIntervalSeconds =
      config.requestPollingIntervalSeconds ?? 6;
  }

  setClient(client: HttpClient) {
    this.client = client;

    return this;
  }

  setAuthToken(authToken: OAuthToken) {
    this.authToken = authToken;

    return this;
  }

  setRequestPollingTimeoutSeconds(seconds: number) {
    this.requestPollingTimeoutSeconds = seconds;

    return this;
  }

  setRequestPollingIntervalSeconds(seconds: number) {
    this.requestPollingIntervalSeconds = seconds;

    return this;
  }

  setCheckRequestStatus(checkStatus: boolean) {
    this.checkRequestStatus = checkStatus;

    return this;
  }

  async start(): Promise<Result> {
    const request = this.getCommandRequest(OnStarApiCommand.Start);

    return this.sendRequest(request);
  }

  async cancelStart(): Promise<Result> {
    const request = this.getCommandRequest(OnStarApiCommand.CancelStart);

    return this.sendRequest(request);
  }

  async lockDoor(options: DoorRequestOptions = {}): Promise<Result> {
    const request = this.getCommandRequest(OnStarApiCommand.LockDoor).setBody({
      lockDoorRequest: {
        delay: 0,
        ...options,
      },
    });

    return this.sendRequest(request);
  }

  async unlockDoor(options: DoorRequestOptions = {}): Promise<Result> {
    const request = this.getCommandRequest(OnStarApiCommand.UnlockDoor).setBody(
      {
        unlockDoorRequest: {
          delay: 0,
          ...options,
        },
      },
    );

    return this.sendRequest(request);
  }

  async lockTrunk(options: TrunkRequestOptions = {}): Promise<Result> {
    const request = this.getCommandRequest(OnStarApiCommand.LockTrunk).setBody({
      lockTrunkRequest: {
        delay: 0,
        ...options,
      },
    });

    return this.sendRequest(request);
  }

  async unlockTrunk(options: DoorRequestOptions = {}): Promise<Result> {
    const request = this.getCommandRequest(
      OnStarApiCommand.UnlockTrunk,
    ).setBody({
      unlockTrunkRequest: {
        delay: 0,
        ...options,
      },
    });

    return this.sendRequest(request);
  }

  async alert(options: AlertRequestOptions = {}): Promise<Result> {
    const request = this.getCommandRequest(OnStarApiCommand.Alert).setBody({
      alertRequest: {
        action: [AlertRequestAction.Honk, AlertRequestAction.Flash],
        delay: 0,
        duration: 1,
        override: [
          AlertRequestOverride.DoorOpen,
          AlertRequestOverride.IgnitionOn,
        ],
        ...options,
      },
    });

    return this.sendRequest(request);
  }

  async cancelAlert(): Promise<Result> {
    const request = this.getCommandRequest(OnStarApiCommand.CancelAlert);

    return this.sendRequest(request);
  }

  async chargeOverride(options: ChargeOverrideOptions = {}): Promise<Result> {
    const request = this.getCommandRequest(
      OnStarApiCommand.ChargeOverride,
    ).setBody({
      chargeOverrideRequest: {
        mode: ChargeOverrideMode.ChargeNow,
        ...options,
      },
    });

    return this.sendRequest(request);
  }

  async getChargingProfile(): Promise<Result> {
    const request = this.getCommandRequest(OnStarApiCommand.GetChargingProfile);

    return this.sendRequest(request);
  }

  async setChargingProfile(
    options: SetChargingProfileRequestOptions = {},
  ): Promise<Result> {
    const request = this.getCommandRequest(
      OnStarApiCommand.SetChargingProfile,
    ).setBody({
      chargingProfile: {
        chargeMode: ChargingProfileChargeMode.Immediate,
        rateType: ChargingProfileRateType.Midpeak,
        ...options,
      },
    });

    return this.sendRequest(request);
  }

  async diagnostics(): Promise<
    import("./types").TypedResult<import("./types").HealthStatusResponse>
  > {
    // vehicle health status API
    const url = `${onStarAppConfig.serviceUrl}/api/v1/vh/vehiclehealth/v1/healthstatus/${this.config.vin}`;

    const request = new Request(url)
      .setMethod(RequestMethod.Get)
      .setContentType("application/json")
      .setCheckRequestStatus(false);

    return this.sendRequest(request) as Promise<
      import("./types").TypedResult<import("./types").HealthStatusResponse>
    >;
  }

  async getAccountVehicles(): Promise<
    import("./types").GarageVehiclesResponse
  > {
    // v3 GraphQL garage API per captured data
    const url = `${onStarAppConfig.serviceUrl}/mbff/garage/v1`;
    const graphQL =
      "query getVehiclesMBFF {" +
      "vehicles {" +
      "vin vehicleId make model nickName year imageUrl onstarCapable vehicleType roleCode onstarStatusCode onstarAccountNumber preDelivery orderNum orderStatus" +
      "}" +
      "}";

    const request = new Request(url)
      .setMethod(RequestMethod.Post)
      .setContentType("text/plain; charset=utf-8")
      .setBody(graphQL)
      .setCheckRequestStatus(false);

    const result = await this.sendRequest(request);
    const payload: any = result.response?.data;
    if (result.status !== CommandResponseStatus.success) {
      console.error("getAccountVehicles failed", {
        status: result.status,
        data: payload,
      });
      throw new Error("getAccountVehicles request did not succeed");
    }
    if (payload && Array.isArray(payload.errors) && payload.errors.length) {
      console.error("getAccountVehicles GraphQL errors", {
        errors: payload.errors,
      });
      throw new Error("getAccountVehicles GraphQL errors present");
    }
    return payload as import("./types").GarageVehiclesResponse;
  }

  async location(): Promise<Result> {
    const base = `${onStarAppConfig.serviceUrl}/veh/datadelivery/digitaltwin/v1/vehicles/${this.config.vin}`;

    const makeReq = (sms: boolean) =>
      new Request(`${base}?sms=${sms ? "true" : "false"}&region=na`)
        .setMethod(RequestMethod.Get)
        .setContentType("application/json")
        .setCheckRequestStatus(false);

    // Kick off a fresh location update
    let result = await this.sendRequest(makeReq(true));
    const timeoutMs = this.requestPollingTimeoutSeconds * 1000;
    const intervalMs = this.requestPollingIntervalSeconds * 1000;
    const startTs = Date.now();

    // Try to poll until updatePending != PENDING
    const getPending = (r: Result) => {
      const data: any = r.response?.data;
      return data?.telemetry?.data?.session?.updatePending as
        | string
        | undefined;
    };

    let pending = getPending(result);
    if (pending === "PENDING") {
      while (Date.now() - startTs < timeoutMs) {
        await this.delay(intervalMs);
        result = await this.sendRequest(makeReq(false));
        pending = getPending(result);
        if (pending && pending !== "PENDING") break;
      }
    }

    return result;
  }

  private getCommandRequest(command: OnStarApiCommand): Request {
    return new Request(this.getCommandUrl(command));
  }

  // Legacy init helpers removed (readGMAccessToken, buildInitQueryParams, randomHex)

  private getApiUrlForPath(path: string): string {
    return `${onStarAppConfig.serviceUrl}/veh/cmd/v3/${path}`;
  }

  private getCommandUrl(command: string): string {
    return this.getApiUrlForPath(`${command}/${this.config.vin}`);
  }

  private async getHeaders(request: Request): Promise<any> {
    const headers: any = {
      accept: "application/json",
      "accept-encoding": "gzip",
      "accept-language": "en-US",
      appversion: "myOwner-chevrolet-android-7.17.0-0",
      locale: "en-US",
      "content-type": request.getContentType(),
      "user-agent": onStarAppConfig.userAgent,
    };

    if (request.isAuthRequired()) {
      const authToken = await this.getAuthToken();
      headers["Authorization"] = `Bearer ${authToken.access_token}`;
    }

    return headers;
  }

  async getAuthToken(): Promise<OAuthToken> {
    const { token, auth, decodedPayload } = await getGMAPIJWT(
      this.gmAuthConfig,
    );
    this.authToken = token;

    const authorizedVins: string[] = [];
    decodedPayload.vehs.forEach((veh: { vin: string }) => {
      authorizedVins.push(veh.vin);
    });
    if (!authorizedVins.includes(this.config.vin)) {
      throw new Error(
        `Provided VIN does not appear to be an authorized VIN for this OnStar account. ${this.config.vin} not in ${authorizedVins}`,
      );
    }

    return this.authToken;
  }

  private async sendRequest(request: Request): Promise<Result> {
    const max429Retries = this.config.max429Retries ?? 3;
    const retryPost = this.config.retryOn429ForPost ?? false;
    const baseDelay = this.config.initial429DelayMs ?? 1000;
    const backoff = this.config.backoffFactor ?? 2;
    const jitter = this.config.jitterMs ?? 250;
    const maxDelay = this.config.max429DelayMs ?? 30000;

    let attempt = 0;

    while (true) {
      try {
        const response = await this.makeClientRequest(request);
        const { data } = response;

        const checkRequestStatus =
          request.getCheckRequestStatus() ?? this.checkRequestStatus;

        if (checkRequestStatus && typeof data === "object") {
          const { commandResponse } = data;

          if (commandResponse) {
            const { requestTime, status, url, type } = commandResponse;

            const requestTimestamp = new Date(requestTime).getTime();

            if (status === CommandResponseStatus.failure) {
              throw new RequestError("Command Failure")
                .setResponse(response)
                .setRequest(request);
            }

            if (
              Date.now() >=
              requestTimestamp + this.requestPollingTimeoutSeconds * 1000
            ) {
              throw new RequestError("Command Timeout")
                .setResponse(response)
                .setRequest(request);
            }

            if (
              status === CommandResponseStatus.inProgress &&
              type !== "connect"
            ) {
              await this.checkRequestPause();

              const request = new Request(url)
                .setMethod(RequestMethod.Get)
                .setUpgradeRequired(false)
                .setCheckRequestStatus(checkRequestStatus);

              return this.sendRequest(request);
            }

            return new RequestResult(status).setResponse(response).getResult();
          }
        }

        return new RequestResult(CommandResponseStatus.success)
          .setResponse(response)
          .getResult();
      } catch (error) {
        // If we received a 429 and we can/should retry, apply backoff and retry
        const isAxios = axios.isAxiosError(error);
        const status = isAxios ? error.response?.status : undefined;
        const method = request.getMethod();
        const methodStr = method === RequestMethod.Get ? "GET" : "POST";

        if (
          status === 429 &&
          (method === RequestMethod.Get || retryPost) &&
          attempt < max429Retries
        ) {
          attempt++;
          // Determine delay: prefer Retry-After header if present
          let delayMs = baseDelay * Math.pow(backoff, attempt - 1);
          let retryAfter: any = undefined;
          let usedRetryAfter = false;
          if (isAxios) {
            retryAfter =
              error.response?.headers?.["retry-after"] ??
              error.response?.headers?.["Retry-After"];
            const parsed = this.parseRetryAfter(retryAfter);
            if (parsed !== null) {
              delayMs = parsed;
              usedRetryAfter = true;
            }
          }
          // Cap and add small jitter
          delayMs =
            Math.min(delayMs, maxDelay) + Math.floor(Math.random() * jitter);

          console.warn("[throttle] 429 received; scheduling retry", {
            url: request.getUrl(),
            method: methodStr,
            attempt,
            maxRetries: max429Retries,
            retryAfter,
            usedRetryAfter,
            delayMs,
          });

          await this.delay(delayMs);
          // loop and retry
          continue;
        }

        if (status === 429) {
          let reason = "not-eligible";
          if (!(method === RequestMethod.Get || retryPost)) {
            reason = "post-retry-disabled";
          } else if (attempt >= max429Retries) {
            reason = "max-retries-exceeded";
          }
          console.warn("[throttle] 429 received; not retrying", {
            url: request.getUrl(),
            method: methodStr,
            attempt,
            maxRetries: max429Retries,
            reason,
          });
        }

        if (error instanceof RequestError) {
          throw error;
        }

        let errorObj = new RequestError();

        if (isAxios) {
          if (error.response) {
            errorObj.message = `Request Failed with status ${error.response.status} - ${error.response.statusText}`;
            errorObj.setResponse({ data: error.response.data });
            // Attach our logical Request, not axios' raw request, to avoid circular refs
            errorObj.setRequest(request);
          } else if (error.request) {
            errorObj.message = "No response";
            errorObj.setRequest(request);
          } else {
            errorObj.message = error.message;
          }
        } else if (error instanceof Error) {
          errorObj.message = error.message;
        }

        throw errorObj;
      }
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Parses Retry-After header which can be seconds (number) or http-date.
  private parseRetryAfter(retryAfter: any): number | null {
    if (!retryAfter) return null;
    if (typeof retryAfter === "number") {
      return retryAfter * 1000;
    }
    const asNum = Number(retryAfter);
    if (!Number.isNaN(asNum)) {
      return asNum * 1000;
    }
    const date = new Date(retryAfter);
    const ts = date.getTime();
    if (!Number.isNaN(ts)) {
      const diff = ts - Date.now();
      return diff > 0 ? diff : 0;
    }
    return null;
  }

  private async makeClientRequest(request: Request): Promise<RequestResponse> {
    const headers = await this.getHeaders(request);
    let requestOptions: any = {
      headers: {
        ...headers,
        ...request.getHeaders(),
      },
    };

    if (request.getMethod() === RequestMethod.Post) {
      const axiosResp = await this.client.post(
        request.getUrl(),
        request.getBody(),
        requestOptions,
      );
      return { data: (axiosResp as any).data };
    } else {
      const axiosResp = await this.client.get(request.getUrl(), requestOptions);
      return { data: (axiosResp as any).data };
    }
  }

  private checkRequestPause() {
    return new Promise((resolve) =>
      setTimeout(resolve, this.requestPollingIntervalSeconds * 1000),
    );
  }
}

export default RequestService;
