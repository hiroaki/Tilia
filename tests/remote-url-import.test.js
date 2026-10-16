import { afterEach, describe, expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/scope.js";
import { importRemote, remoteOptions } from "../src/plugins/input/transport.js";
let owner; afterEach(async () => { await owner?.close(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function fixture() { owner = createScopeController({ label: "transport" }); const context = { scope: owner.scope, inputs: { dispatch: vi.fn(async (f) => ({ name: f.name })) }, services: { optional: () => null }, diagnostics: { report: vi.fn() } }; return context; }
const response = (bytes, headers = {}) => new Response(new Uint8Array(bytes), { headers });
describe("owned domain-neutral remote transport", () => {
  it("dispatches metadata without GPX coercion and accepts the exact byte limit", async () => {
    const context = fixture(); vi.stubGlobal("fetch", vi.fn(async () => response(3, { "content-type": "application/xml", "content-disposition": 'attachment; filename="track.xml"' })));
    await importRemote(context, { url: "https://example.com/file", scope: owner.scope, ...remoteOptions({ maxBytes: 3 }) });
    expect(context.inputs.dispatch.mock.calls[0][0]).toMatchObject({ name: "track.xml", type: "application/xml", size: 3 });
  });
  it.each([{"content-length": "4"}, {"content-length": "oops"}, {}])("rejects actual/declaration overflow before dispatch (%j)", async (headers) => {
    const context = fixture(); vi.stubGlobal("fetch", vi.fn(async () => response(4, headers)));
    await expect(importRemote(context, { url: "https://example.com/file.gpx", scope: owner.scope, ...remoteOptions({ maxBytes: 3 }) })).rejects.toThrow("too large"); expect(context.inputs.dispatch).not.toHaveBeenCalled();
  });
  it.each([{timeoutMs: 0},{timeoutMs: 2147483648},{timeoutMs: 1.5},{timeoutMs: "2"},{maxBytes: -1},{maxBytes: Infinity},{maxBytes: NaN},{maxBytes: 1.5},{maxBytes: null}])("validates limits before acquisition (%j)", (options) => { expect(() => remoteOptions(options)).toThrow(TypeError); });
  it("rejects unsupported schemes without fetch", async () => { const context = fixture(), fetch = vi.fn(); vi.stubGlobal("fetch", fetch); await expect(importRemote(context, { url: "data:text/plain,test", scope: owner.scope, ...remoteOptions() })).rejects.toThrow(TypeError); expect(fetch).not.toHaveBeenCalled(); });
  it("timeout covers a noncooperative dispatch while owner closure remains responsive", async () => {
    vi.useFakeTimers(); const context = fixture(); let finish;
    context.inputs.dispatch.mockImplementation((_file, {signal}) => new Promise((r) => { finish = () => r({ name: "late" }); expect(signal.aborted).toBe(false); }));
    vi.stubGlobal("fetch", vi.fn(async () => response(1)));
    const work = importRemote(context, { url: "https://example.com/file.gpx", scope: owner.scope, ...remoteOptions({timeoutMs: 10}) });
    for (let i = 0; i < 40 && !finish; i++) await Promise.resolve();
    expect(finish).toBeTypeOf("function"); await vi.advanceTimersByTimeAsync(10);
    const signal = context.inputs.dispatch.mock.calls[0][1].signal; expect(signal.aborted).toBe(true); expect(signal.reason.name).toBe("TimeoutError");
    await owner.close(); finish(); await work; expect(context.diagnostics.report).not.toHaveBeenCalled();
  });
});
