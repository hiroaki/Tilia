import { describe, expect, it } from "vitest";
import { createTiliaApp } from "../src/app.js";
import { gpxDomainKey, photoDomainKey, semanticErrorCodes } from "../src/domains/index.js";

describe("Phase 4D-C production semantic authority cutover", () => {
  it("activates production providers without exposing the legacy semantic model", async () => {
    const app = createTiliaApp({
      map: {},
      plugins: ["tilia-gpx-domain", "tilia-photo-domain"],
      pluginOptions: {
        "tilia-photo-domain": {
          createObjectURL: () => "blob:private",
          revokeObjectURL: () => {},
        },
      },
    });
    await app.whenReady();

    expect(app.listPlugins()).toEqual(["tilia-gpx-domain", "tilia-photo-domain"]);
    expect(app).not.toHaveProperty("core");
    expect(app).not.toHaveProperty("state");
    expect(app).not.toHaveProperty("refreshView");
    expect(app).not.toHaveProperty("subscribeInteractions");

    const gpx = await app.domains.gpx.create({
      name: "production.gpx",
      tracks: [],
      routes: [],
      waypoints: [],
    });
    const photo = await app.domains.photo.create({
      data: { name: "production.jpg", source: { mediaType: "image/jpeg", size: 1 } },
      blob: new Blob(["x"]),
    });

    expect(app.entries.list()).toEqual([
      { id: gpx.id, domain: gpxDomainKey, visible: true },
      { id: photo.id, domain: photoDomainKey, visible: true },
    ]);
    expect(JSON.stringify(app.domains.photo.get(photo.id))).not.toMatch(/blob:private|previewUrl/);
    await expect(app.unuse("tilia-photo-domain")).rejects.toMatchObject({ code: semanticErrorCodes.providerInUse });

    await app.entries.remove(photo.id);
    await app.entries.remove(gpx.id);
    await expect(app.unuse("tilia-photo-domain")).resolves.toBeUndefined();
    await expect(app.unuse("tilia-gpx-domain")).resolves.toBeUndefined();
  });
});
