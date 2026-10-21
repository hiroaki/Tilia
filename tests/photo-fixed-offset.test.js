import { afterEach, expect, it } from "vitest";
import { createPhotoProvider } from "../src/plugins/domains/photo-provider.js";
import { createScopeController } from "../src/ownership/index.js";
import { semanticErrorCodes } from "../src/domains/index.js";

const owners = [];
afterEach(async () => { for (const owner of owners.splice(0)) await owner.close(); });
async function prepare(provider, data, mode) {
  const owner = createScopeController(); owners.push(owner);
  return provider.prepareCreate({ value: { data, preferences: { requestedTimeMode: mode } }, entryScope: owner.scope });
}

it.each([["+09:00", 540], ["-05:00", -300], ["+05:30", 330], ["+05:45", 345], ["-03:30", -210]])("interprets %s wall time across date boundaries without modifying capturedAt", async (mode, minutes) => {
  const capturedAt = new Date(2024, 0, 1, 1, 15).getTime();
  const expected = Date.UTC(2024, 0, 1, 1, 15) - minutes * 60000;
  const provider = createPhotoProvider({ captureTimeline: () => ({ points: [
    { timestamp: expected - 1000, lat: 35, lon: 135 }, { timestamp: expected + 1000, lat: 37, lon: 137 },
  ] }) });
  const { snapshot } = await prepare(provider, { capturedAt }, mode);
  expect(snapshot.data.capturedAt).toBe(capturedAt);
  expect(snapshot.derived).toMatchObject({ inferredTimestamp: expected, resolvedTimeMode: mode, inferredLocation: { lat: 36, lon: 136 } });
});
it.each([[" +0900 ", "+09:00"], ["Z", "+00:00"], ["-00:00", "+00:00"]])("normalizes %s and preserves GPS precedence", async (mode, normalized) => {
  const { snapshot } = await prepare(createPhotoProvider(), { coordinate: { lat: 35, lon: 135 }, capturedAt: 0 }, mode);
  expect(snapshot.preferences.requestedTimeMode).toBe(normalized);
  expect(snapshot.derived).toMatchObject({ inferredLocation: null, inferredTimestamp: null, locationSource: "exif-gps" });
});
it.each(["+24:00", "+09:60", "custom", 540])("rejects invalid domain mode %s with INPUT_INVALID", async mode => {
  await expect(prepare(createPhotoProvider(), {}, mode)).rejects.toMatchObject({ code: semanticErrorCodes.inputInvalid, details: { field: "requestedTimeMode" } });
});
it("rejects an unmatched offset mutation while retaining the old committed snapshot", async () => {
  const timestamp = Date.UTC(2024, 0, 1);
  const provider = createPhotoProvider({ captureTimeline: () => ({ points: [
    { timestamp: timestamp - 1000, lat: 35, lon: 135 }, { timestamp: timestamp + 1000, lat: 37, lon: 137 },
  ] }) });
  const prepared = await prepare(provider, { capturedAt: new Date(2024, 0, 1, 9).getTime() }, "+09:00");
  await expect(provider.prepareMutation({ currentInstance: prepared.instance, command: { type: "set-requested-time-mode", requestedTimeMode: "-05:00" } })).rejects.toThrow(/outside GPX/);
  expect(provider.getSnapshot(prepared.instance)).toBe(prepared.snapshot);
  const result = await provider.prepareMutation({ currentInstance: prepared.instance, command: { type: "set-requested-time-mode", requestedTimeMode: "+0900" } });
  expect(result.changed).toBe(false);
});
