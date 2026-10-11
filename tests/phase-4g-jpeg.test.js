import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js", () => ({ default: { parse: vi.fn() } }));
import exifr from "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js";
import jpeg from "../src/plugins/input/jpeg.js";
import { createInputRegistry } from "../src/extensions/index.js";
import { createScopeController } from "../src/ownership/index.js";
import { createPhotoProvider } from "../src/plugins/domains/photo-provider.js";

const controllers = [];
afterEach(async () => { for (const c of controllers.splice(0)) await c.close(); vi.clearAllMocks(); });
async function fixture({ captureTimeline, afterCreate, defaultPhotoTimeMode } = {}) {
  const owner = createScopeController(), consumer = createScopeController(); controllers.push(owner, consumer);
  const queue = [], inputs = createInputRegistry();
  const input = { scope: owner.scope, stage: (d) => owner.stage(d), enqueuePostCommit: (fn) => queue.push(fn) };
  let snapshot, present = false;
  const fitBounds = vi.fn();
  const remove = () => { present = false; };
  const create = vi.fn(async (value) => {
    const provider = createPhotoProvider({ captureTimeline });
    // Validate normalized semantic data with the production provider, without a URL.
    const prepared = await provider.prepareCreate({ value: { ...value, blob: null }, entryScope: owner.scope });
    snapshot = prepared.snapshot;
    present = true;
    await afterCreate?.({ owner, consumer, remove });
    return { id: 1 };
  });
  jpeg.setup({ scope: owner.scope, map: { fitBounds }, entries: { get: () => present ? { id: 1 } : null }, inputs: inputs.createFacade(input), domains: { require: () => ({ create, get: () => ({ snapshot }) }) } }, { defaultPhotoTimeMode });
  await owner.commit(); queue.forEach((fn) => fn()); await consumer.commit();
  return { owner, consumer, create, fitBounds, inputs: inputs.createFacade({ scope: consumer.scope }) };
}
const file = (name = "photo.JPG", type = "") => new File(["jpeg"], name, { type });
describe("Phase 4G JPEG input / production EXIF normalization", () => {
  it.each([
    [{ DateTimeOriginal: new Date(0), latitude: 35, longitude: 135, Make: "camera", Model: "model" }, 0, { lat: 35, lon: 135 }],
    [{ CreateDate: new Date(1000) }, 1000, null],
    [{ DateTimeOriginal: 0 }, 0, null],
    [{ latitude: 0, longitude: 0 }, null, { lat: 0, lon: 0 }],
  ])("normalizes GPS/time-only EXIF with epoch-zero support", async (exif, capturedAt, coordinate) => {
    const f = await fixture(); exifr.parse.mockResolvedValue(exif);
    const image = file();
    const result = await f.inputs.dispatch(image);
    expect(result).toMatchObject({ entry: { id: 1 }, name: "photo.JPG", locationSource: coordinate ? "exif-gps" : null });
    expect(f.create.mock.calls[0][0]).toMatchObject({ data: { name: "photo.JPG", capturedAt, coordinate, source: { mediaType: "image/jpeg", size: image.size } }, preferences: { requestedTimeMode: "auto" }, blob: image });
    expect(f.create.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    if (coordinate) expect(f.fitBounds).toHaveBeenCalledExactlyOnceWith([[coordinate.lat, coordinate.lon], [coordinate.lat, coordinate.lon]], { padding: [20, 20] });
    else expect(f.fitBounds).not.toHaveBeenCalled();
  });
  it.each([null, {}, { DateTimeOriginal: "invalid date" }, { latitude: 91, longitude: 0 }])("rejects unusable/malformed EXIF before semantic publication", async (exif) => {
    const f = await fixture(); exifr.parse.mockResolvedValue(exif);
    await expect(f.inputs.dispatch(file())).rejects.toBeDefined();
    if (exif == null || Object.keys(exif).length === 0) expect(f.create).not.toHaveBeenCalled();
  });
  it("uses discovery/recognition without parsing unsupported input and removes the handler on owner closure", async () => {
    const f = await fixture();
    expect(f.inputs.getSnapshot()[0].discovery).toMatchObject({ extensions: [".jpg", ".jpeg"], mimeTypes: ["image/jpeg"] });
    await expect(f.inputs.dispatch(file("text.txt", "text/plain"))).rejects.toMatchObject({ code: "INPUT_UNSUPPORTED" });
    expect(exifr.parse).not.toHaveBeenCalled();
    await f.owner.close();
    await expect(f.inputs.dispatch(file())).rejects.toMatchObject({ code: "INPUT_UNSUPPORTED" });
  });
  it.each(["caller closure", "uninstall"])("suppresses creation if %s occurs while EXIF parsing is pending", async (loss) => {
    const f = await fixture(); let resolve, started;
    const gate = new Promise((r) => { resolve = r; }), invoked = new Promise((r) => { started = r; });
    exifr.parse.mockImplementation(() => { started(); return gate; });
    const outcome = f.inputs.dispatch(file()).catch((error) => error);
    await invoked;
    if (loss === "caller closure") await f.consumer.close(); else await f.owner.close();
    resolve({ DateTimeOriginal: new Date(0) });
    expect(await outcome).toBeInstanceOf(Error); expect(f.create).not.toHaveBeenCalled();
    expect(f.fitBounds).not.toHaveBeenCalled();
  });
  it.each(["caller closure", "uninstall", "deletion", "cancellation"])("does not navigate after publication followed by %s", async (loss) => {
    const controller = new AbortController();
    const f = await fixture({ afterCreate: async ({ owner, consumer, remove }) => {
      if (loss === "caller closure") await consumer.close();
      else if (loss === "uninstall") await owner.close();
      else if (loss === "deletion") remove();
      else controller.abort();
    } });
    exifr.parse.mockResolvedValue({ latitude: 35, longitude: 135 });
    await f.inputs.dispatch(file(), { signal: controller.signal }).catch(() => {});
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.fitBounds).not.toHaveBeenCalled();
  });
  it("navigates to the production provider's inferred coordinate without a renderer", async () => {
    const f = await fixture({ captureTimeline: () => ({ points: [
      { timestamp: 0, lat: 35, lon: 135 }, { timestamp: 1000, lat: 37, lon: 137 },
    ] }) });
    exifr.parse.mockResolvedValue({ DateTimeOriginal: new Date(500) });
    expect(await f.inputs.dispatch(file())).toMatchObject({ locationSource: "gpx-time-inference" });
    expect(f.fitBounds).toHaveBeenCalledExactlyOnceWith([[36, 136], [36, 136]], { padding: [20, 20] });
  });
  it("applies and normalizes the configured offset before publication and auto-pan", async () => {
    const f = await fixture({ defaultPhotoTimeMode: "+0900", captureTimeline: () => ({ points: [
      { timestamp: Date.UTC(2024, 0, 1, 0), lat: 35, lon: 135 },
      { timestamp: Date.UTC(2024, 0, 1, 1), lat: 37, lon: 137 },
    ] }) });
    exifr.parse.mockResolvedValue({ DateTimeOriginal: new Date(2024, 0, 1, 9, 30) });
    expect(await f.inputs.dispatch(file())).toMatchObject({ locationSource: "gpx-time-inference" });
    expect(f.create.mock.calls[0][0].preferences.requestedTimeMode).toBe("+09:00");
    expect(f.fitBounds).toHaveBeenCalledExactlyOnceWith([[36, 136], [36, 136]], { padding: [20, 20] });
  });
  it.each(["+24:00", "+09:60", "custom", null])("rejects invalid default %s before registering a handler", async defaultPhotoTimeMode => {
    const register = vi.fn();
    expect(() => jpeg.setup({ inputs: { register } }, { defaultPhotoTimeMode })).toThrow(/Invalid photo time mode/);
    expect(register).not.toHaveBeenCalled();
  });
});
