import { expect, it } from "vitest";
import { createSemanticFoundation } from "../src/semantic-foundation.js";
import { createApplicationSemanticApi, createSemanticCapabilityFactories } from "../src/semantic-capabilities.js";
import { createPluginRuntime } from "../src/plugins/runtime/index.js";
import { builtinPluginCatalog } from "../src/builtins.js";

it("reports partial application and retries only the entries whose committed mode differs", async () => {
  const failure = new Error("injected commit failure");
  let failingId;
  const foundation = await createSemanticFoundation({ entryRenderingLifecycle: {
    prepareDomainCommit({ record, command }) {
      if (command.type === "apply-presentation-mode" && record.id === failingId) throw failure;
    },
  } });
  const runtime = createPluginRuntime({ catalog: builtinPluginCatalog, capabilityFactories: createSemanticCapabilityFactories(foundation) });
  const api = createApplicationSemanticApi(foundation);
  await runtime.use("tilia-gpx-domain");
  try {
    const gpx = api.domains.gpx;
    const entries = [];
    for (let i = 0; i < 3; i++) entries.push(await gpx.create({}));
    const snapshots = () => entries.map(({ id }) => {
      const { revision, snapshot } = gpx.get(id);
      return [revision, snapshot.derived.presentationMode];
    });
    const modes = [];
    const states = [];
    gpx.subscribePresentationMode(mode => modes.push(mode));
    gpx.subscribePresentationStatus(status => states.push(status));
    failingId = entries[1].id;
    await expect(gpx.setPresentationMode("segment")).rejects.toBe(failure);
    expect(gpx.getPresentationMode()).toBe("segment");
    expect(gpx.getPresentationStatus()).toEqual({ mode: "segment", state: "failed" });
    expect(snapshots()).toEqual([[2, "segment"], [1, "track"], [1, "track"]]);
    const late = [];
    gpx.subscribePresentationStatus(status => late.push(status.state));
    failingId = undefined;
    await gpx.setPresentationMode("segment");
    await gpx.setPresentationMode("segment");
    expect(snapshots()).toEqual([[2, "segment"], [2, "segment"], [2, "segment"]]);
    expect(states.map(({ state }) => state)).toEqual(["applied", "applying", "failed", "applying", "applied"]);
    expect(late).toEqual(["failed", "applying", "applied"]);
    expect(modes).toEqual(["track", "segment"]);
  } finally {
    await api.entries.clear();
    await runtime.destroy();
    await foundation.dispose();
  }
});
