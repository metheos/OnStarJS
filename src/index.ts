import axios from "axios";

// import TokenHandler from "./TokenHandler";
import RequestService from "./RequestService";

import {
  OnStarConfig,
  Result,
  AlertRequestOptions,
  DoorRequestOptions,
  TrunkRequestOptions,
  StartRequestOptions,
  GarageVehiclesResponse,
  HealthStatusResponse,
  TypedResult,
} from "./types";

class OnStar {
  constructor(private requestService: RequestService) {}

  static create(config: OnStarConfig): OnStar {
    const requestService = new RequestService(config, axios);

    return new OnStar(requestService);
  }

  async getAccountVehicles(): Promise<GarageVehiclesResponse> {
    return this.requestService.getAccountVehicles();
  }

  async start(options?: StartRequestOptions): Promise<Result> {
    return this.requestService.start(options);
  }

  async cancelStart(): Promise<Result> {
    return this.requestService.cancelStart();
  }

  async lockDoor(options?: DoorRequestOptions): Promise<Result> {
    return this.requestService.lockDoor(options);
  }

  async unlockDoor(options?: DoorRequestOptions): Promise<Result> {
    return this.requestService.unlockDoor(options);
  }

  async lockTrunk(options?: TrunkRequestOptions): Promise<Result> {
    return this.requestService.lockTrunk(options);
  }

  async unlockTrunk(options?: TrunkRequestOptions): Promise<Result> {
    return this.requestService.unlockTrunk(options);
  }

  async alert(options?: AlertRequestOptions): Promise<Result> {
    return this.requestService.alert(options);
  }

  async cancelAlert(): Promise<Result> {
    return this.requestService.cancelAlert();
  }

  // async chargeOverride(options?: ChargeOverrideOptions): Promise<Result> {
  //   return this.requestService.chargeOverride(options);
  // }

  // async getChargingProfile(): Promise<Result> {
  //   return this.requestService.getChargingProfile();
  // }

  // async setChargingProfile(
  //   options?: SetChargingProfileRequestOptions,
  // ): Promise<Result> {
  //   return this.requestService.setChargingProfile(options);
  // }

  async diagnostics(): Promise<TypedResult<HealthStatusResponse>> {
    return this.requestService.diagnostics();
  }

  async location(): Promise<Result> {
    return this.requestService.location();
  }

  // EV: Set target charge level percentage
  async setChargeLevelTarget(
    tcl: number,
    opts?: {
      noMetricsRefresh?: boolean;
      clientRequestId?: string;
      clientVersion?: string;
      os?: "A" | "I";
    },
  ): Promise<Result> {
    return this.requestService.setChargeLevelTarget(tcl, opts);
  }

  setCheckRequestStatus(checkStatus: boolean) {
    this.requestService.setCheckRequestStatus(checkStatus);
  }
}

export default OnStar;
export * from "./types";
