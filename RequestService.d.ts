import {
  AlertRequestOptions,
  ChargeOverrideOptions,
  DiagnosticsRequestOptions,
  DoorRequestOptions,
  TrunkRequestOptions,
  HttpClient,
  OAuthToken,
  OnStarConfig,
  Result,
  SetChargingProfileRequestOptions,
} from "./types";
declare class RequestService {
  private client;
  private config;
  private gmAuthConfig;
  private authToken?;
  private checkRequestStatus;
  private requestPollingTimeoutSeconds;
  private requestPollingIntervalSeconds;
  private tokenRefreshPromise?;
  private tokenUpgradePromise?;
  constructor(config: OnStarConfig, client: HttpClient);
  setClient(client: HttpClient): this;
  setAuthToken(authToken: OAuthToken): this;
  setRequestPollingTimeoutSeconds(seconds: number): this;
  setRequestPollingIntervalSeconds(seconds: number): this;
  setCheckRequestStatus(checkStatus: boolean): this;
  start(): Promise<Result>;
  cancelStart(): Promise<Result>;
  lockDoor(options?: DoorRequestOptions): Promise<Result>;
  unlockDoor(options?: DoorRequestOptions): Promise<Result>;
  lockTrunk(options?: TrunkRequestOptions): Promise<Result>;
  unlockTrunk(options?: DoorRequestOptions): Promise<Result>;
  alert(options?: AlertRequestOptions): Promise<Result>;
  cancelAlert(): Promise<Result>;
  chargeOverride(options?: ChargeOverrideOptions): Promise<Result>;
  getChargingProfile(): Promise<Result>;
  setChargingProfile(
    options?: SetChargingProfileRequestOptions,
  ): Promise<Result>;
  diagnostics(options?: DiagnosticsRequestOptions): Promise<Result>;
  getAccountVehicles(): Promise<Result>;
  location(): Promise<Result>;
  private getCommandRequest;
  private getApiUrlForPath;
  private getCommandUrl;
  private getHeaders;
  private connectRequest;
  private upgradeRequest;
  private authTokenRequest;
  private getAuthToken;
  private refreshAuthToken;
  private createNewAuthToken;
  private connectAndUpgradeAuthToken;
  private sendRequest;
  private makeClientRequest;
  private checkRequestPause;
}
export default RequestService;