import { expect, test } from "@playwright/test";

for (const renderer of ["SVG", "Canvas"]) {
  test(`mode switches replace only the current geometry and distance labels (${renderer})`, async ({ page }, testInfo) => {
    await page.goto("/tests/fixtures/application-lifecycle.html");
    const measurements = await page.evaluate(async renderer => {
      const L = await import("leaflet");
      const app = window.lifecycle.create({
        baseMapOptions: { tileUrl: "/tiles/{z}/{x}/{y}.png", center: [35.68, 139.76], zoom: 14,
          mapOptions: { renderer: new L[renderer]() } },
        plugins: ["tilia-gpx-renderer", "x-distance-markers"],
      });
      await app.ready;
      const map = app.map, gpx = app.domains.gpx;
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      async function active(id) {
        for (let i = 0; i < 120; i++) {
          const status = app.rendering.getStatus(id);
          if (status.state === "active" && status.currentRevision === gpx.get(id).revision) return;
          await frame();
        }
        throw new Error("Current GPX generation did not activate");
      }
      function geometry() {
        const lines = [];
        map.eachLayer(layer => {
          if (layer instanceof L.Polyline && layer.getPane().dataset.tiliaMapBand === "geometry") lines.push(layer);
        });
        return lines;
      }
      const labels = () => [...document.querySelectorAll(".x-distance-marker")];
      const results = [];
      try {
        for (const [segmentCount, pointsPerSegment] of [[4, 50], [100, 100]]) {
          const segments = Array.from({ length: segmentCount }, (_, index) => ({
            points: Array.from({ length: pointsPerSegment }, (_, p) => ({
              lat: 35.665 + 0.03 * index / (segmentCount - 1),
              lon: 139.73 + 0.06 * p / (pointsPerSegment - 1),
            })),
          }));
          const { id } = await gpx.create({ tracks: [{ segments }] });
          await active(id);
          const selected = { kind: "track-point", trackIndex: 0, segmentIndex: 1, pointIndex: 0 };
          await app.selection.request(gpx.selection.createCandidate(id, selected));
          const center = map.getCenter(), zoom = map.getZoom();
          for (let iteration = 0; iteration < 4; iteration++) {
            for (const mode of ["segment", "track"]) {
              const oldLines = geometry(), oldLabels = labels();
              const start = performance.now();
              await gpx.setPresentationMode(mode);
              await active(id);
              const activeMs = performance.now() - start;
              await frame(); await frame();
              const paintedMs = performance.now() - start;
              const lines = geometry(), dashed = lines.filter(line => line.options.dashArray);
              if (!oldLabels.length || !labels().length || oldLabels.some(label => label.isConnected)) {
                throw new Error("Distance labels were not replaced");
              }
              if (oldLines.some(line => map.hasLayer(line)) || dashed.some(line => line.options.interactive)
                  || lines.some(line => !(map.getRenderer(line) instanceof L[renderer]))) {
                throw new Error("Unexpected renderer, stale geometry or interactive inferred connection");
              }
              oldLines[0].fire("click", { latlng: oldLines[0].getLatLngs()[0] });
              const ref = app.selection.getCurrent().ref;
              if (ref.kind !== selected.kind || ref.segmentIndex !== selected.segmentIndex || ref.pointIndex !== selected.pointIndex
                  || ref.revision !== gpx.get(id).revision || !map.getCenter().equals(center) || map.getZoom() !== zoom) {
                throw new Error("Mode switch changed the selection or viewport");
              }
              results.push({ segmentCount, pointsPerSegment, mode, iteration, recorded: lines.length - dashed.length,
                inferred: dashed.length, labels: labels().length, activeMs, paintedMs });
            }
          }
          await app.entries.remove(id);
        }
      } finally { await app.destroy(); }
      return results;
    }, renderer);
    for (const record of measurements) {
      expect(record.recorded).toBe(record.segmentCount);
      expect(record.inferred).toBe(record.mode === "track" ? record.segmentCount - 1 : 0);
    }
    await testInfo.attach("presentation-timings", { body: JSON.stringify(measurements), contentType: "application/json" });
  });
}

test("two embedded GPX domains on the same page have independent settings without a UI", async ({ page }) => {
  await page.goto("/tests/fixtures/application-lifecycle.html");
  const modes = await page.evaluate(async () => {
    const { createDefaultTiliaApp } = await import("/src/index.js");
    const options = { tileUrl: "/tiles/{z}/{x}/{y}.png", center: [0, 0], zoom: 1 };
    const first = window.lifecycle.create({ plugins: [["tilia-gpx-domain", { presentationMode: "segment" }]] });
    const container = document.body.appendChild(document.createElement("div"));
    const second = createDefaultTiliaApp(container, { baseMapOptions: options, plugins: ["tilia-gpx-domain"] });
    try {
      await Promise.all([first.ready, second.ready]);
      const modes = () => [first, second].map(app => app.domains.gpx.getPresentationMode());
      const initial = modes();
      await second.domains.gpx.setPresentationMode("segment");
      await first.domains.gpx.setPresentationMode("track");
      return [initial, modes()];
    } finally {
      await Promise.all([first.destroy(), second.destroy()]);
      container.remove();
    }
  });
  expect(modes).toEqual([["segment", "track"], ["track", "segment"]]);
});
