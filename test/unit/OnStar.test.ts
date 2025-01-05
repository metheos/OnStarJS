import { mock, instance, verify, when } from "ts-mockito";

import OnStar from "../../src/index";
import RequestService from "../../src/RequestService";
import { testConfig, authToken } from "./testData";
import { Result } from "../../src/types";

let onStar: OnStar;
let requestService: RequestService;

describe("OnStar", () => {
  beforeEach(() => {
    requestService = mock(RequestService);
    onStar = new OnStar(instance(requestService));
  });

  test("create", () => {
    expect(OnStar.create(testConfig)).toBeInstanceOf(OnStar);
  });

  test("start", async () => {
    await onStar.start();
  });

  test("cancelStart", async () => {
    await onStar.cancelStart();
  });

  test("lockDoor", async () => {
    await onStar.lockDoor();
  });

  test("unlockDoor", async () => {
    await onStar.unlockDoor();
  });

  test("alert", async () => {
    await onStar.alert();
  });

  test("cancelAlert", async () => {
    await onStar.cancelAlert();
  });

  test("chargeOverride", async () => {
    await onStar.chargeOverride();
  });

  test("getChargingProfile", async () => {
    await onStar.getChargingProfile();
  });

  test("setChargingProfile", async () => {
    await onStar.setChargingProfile();
  });

  test("diagnostics", async () => {
    await onStar.diagnostics();
  });

  test("getAccountVehicles", async () => {
    await onStar.getAccountVehicles();
  });

  test("lockTrunk", async () => {
    await onStar.lockTrunk();
  });

  test("unlockTrunk", async () => {
    await onStar.unlockTrunk();
  });

  test("location", async () => {
    const result: Result = { status: "success" };
    when(requestService.location()).thenResolve(result);

    const response = await onStar.location();

    expect(response).toEqual(result);
    verify(requestService.location()).once();
  });

  test("setCheckRequestStatus", () => {
    onStar.setCheckRequestStatus(true);

    verify(requestService.setCheckRequestStatus(true)).once();
  });
});
