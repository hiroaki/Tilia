import { expect, test } from "@playwright/test";

async function ready(page, canvas) {
  await page.goto(`/tests/fixtures/editor.html?renderer=${canvas ? "canvas" : "svg"}`);
  await page.waitForFunction(() => !!window.editorHarness);
}
async function snapshot(page) {
  return page.evaluate(async () => {
    const { CircleMarker, Polyline } = await import("leaflet");
    const circles = [], lines = [];
    window.editorHarness.map.eachLayer(layer => {
      // Ignore presenter indicators; normal GPX geometry has its own band.
      if (layer.getPane?.()?.dataset.tiliaMapBand !== "geometry") return;
      if (layer instanceof CircleMarker) circles.push({
        coordinate: [layer.getLatLng().lat, layer.getLatLng().lng],
        radius: layer.getRadius(), fill: layer.options.fillColor,
        stroke: layer.options.color, weight: layer.options.weight,
        opacity: layer.options.opacity, fillOpacity: layer.options.fillOpacity,
        interactive: layer.options.interactive,
      });
      else if (layer instanceof Polyline) lines.push(layer.getLatLngs().map(p => [p.lat, p.lng]));
    });
    return { circles, lines };
  });
}
async function clickCoordinate(page, lat, lon) {
  const p = await page.evaluate(([lat, lon]) => {
    const map = window.editorHarness.map, rect = map.getContainer().getBoundingClientRect();
    const p = map.latLngToContainerPoint([lat, lon]);
    return { x: rect.x + p.x, y: rect.y + p.y };
  }, [lat, lon]);
  await page.mouse.move(p.x, p.y);
  await expect.poll(() => page.evaluate(p => getComputedStyle(document.elementFromPoint(p.x, p.y)).cursor, p)).toBe("pointer");
  await page.mouse.click(p.x, p.y);
}
const current = page => page.evaluate(() => window.editorHarness.app.selection.getCurrent());

for (const canvas of [false, true]) {
  const renderer = canvas ? "Canvas" : "SVG";
  test(`single-point segment geometry, colors and explicit overlap identity (${renderer})`, async ({ page }) => {
    await ready(page, canvas);
    try {
      await page.evaluate(async () => {
        const { app, map } = window.editorHarness;
        const p = lon => ({ lat: 35.68, lon });
        const segment = (...lons) => ({ points: lons.map(p) });
        window.singleEntry = (await app.domains.gpx.create({ tracks: [
          { segments: [segment(), segment(139.754)] },
          { segments: [segment(139.756, 139.758), segment(139.76), segment(139.76), segment()] },
          { segments: [segment(139.762), segment(139.764)] },
          { segments: [segment(139.766, 139.766)] },
          { segments: [segment()] },
        ] })).id;
        map.setView([35.68, 139.76], 16, { animate: false });
      });
      await expect.poll(async () => (await snapshot(page)).circles.length).toBe(5);
      const actual = await snapshot(page);
      expect(actual.lines).toEqual([
        [[35.68,139.756],[35.68,139.758],[35.68,139.76],[35.68,139.76]],
        [[35.68,139.762],[35.68,139.764]], [[35.68,139.766],[35.68,139.766]],
      ]);
      expect(actual.circles.map(c => [c.coordinate, c.fill])).toEqual([
        [[35.68,139.754],"#0099cc"], [[35.68,139.76],"#5c6bc0"],
        [[35.68,139.76],"#5c6bc0"], [[35.68,139.762],"#c855bc"], [[35.68,139.764],"#c855bc"],
      ]);
      for (const circle of actual.circles) expect(circle).toMatchObject({
        radius: 6, stroke: "#fff", weight: 2, opacity: 1, fillOpacity: 1, interactive: true,
      });
      // Later coincident marker is physically on top, above its parent line.
      await clickCoordinate(page, 35.68, 139.76);
      await expect.poll(async () => (await current(page))?.ref).toMatchObject({ kind: "track-point", trackIndex: 1, segmentIndex: 2, pointIndex: 0 });
      await expect(page.locator(".leaflet-popup")).toHaveCount(1);
      // The covered marker cannot be reached by a real pointer. Exercise its
      // layer binding separately to prove that its target is not a nearest query.
      await page.evaluate(async () => {
        const { CircleMarker } = await import("leaflet");
        const circles = [];
        window.editorHarness.map.eachLayer(l => {
          if (l instanceof CircleMarker && l.getPane()?.dataset.tiliaMapBand === "geometry" && l.getLatLng().lng === 139.76) circles.push(l);
        });
        circles[0].fire("click", { latlng: circles[0].getLatLng(), originalEvent: new MouseEvent("click") });
      });
      await expect.poll(async () => (await current(page))?.ref.segmentIndex).toBe(1);
      // Ordinary track line still selects its nearest point.
      await clickCoordinate(page, 35.68, 139.757);
      await expect.poll(async () => (await current(page))?.ref).toMatchObject({ trackIndex: 1, segmentIndex: 0 });
      await clickCoordinate(page, 35.68, 139.754);
      await expect.poll(async () => (await current(page))?.ref).toMatchObject({ trackIndex: 0, segmentIndex: 1, pointIndex: 0 });
    } finally { await page.evaluate(() => window.editorHarness.destroy()); }
    expect(await snapshot(page)).toEqual({ circles: [], lines: [] });
  });

  test(`single-point visibility, style, replacement and stale-layer cleanup (${renderer})`, async ({ page }) => {
    await ready(page, canvas);
    try {
      await page.evaluate(async () => {
        const { app, map } = window.editorHarness;
        window.singleEntry = (await app.domains.gpx.create({ tracks: [{ segments: [{ points: [{ lat:35.68,lon:139.76 }] }] }] })).id;
        map.setView([35.68,139.76],16,{animate:false});
      });
      await expect.poll(async () => (await snapshot(page)).circles.length).toBe(1);
      await clickCoordinate(page,35.68,139.76);
      await page.evaluate(async () => {
        const { app, map } = window.editorHarness, gpx = app.domains.gpx;
        window.retiredCircles = [];
        map.eachLayer(l => { if (l.getRadius && l.getPane()?.dataset.tiliaMapBand === "geometry") window.retiredCircles.push(l); });
        await gpx.setTrackVisibility(window.singleEntry,{trackIndex:0,visible:false},{expectedRevision:gpx.get(window.singleEntry).revision});
      });
      await expect.poll(async () => (await snapshot(page)).circles.length).toBe(0);
      await expect(page.locator(".leaflet-popup")).toHaveCount(0);
      await page.evaluate(async () => {
        const g = window.editorHarness.app.domains.gpx, id=window.singleEntry;
        await g.setTrackVisibility(id,{trackIndex:0,visible:true},{expectedRevision:g.get(id).revision});
        await g.setStylePreset(id,"forest",{expectedRevision:g.get(id).revision});
      });
      await expect.poll(async () => (await snapshot(page)).circles.map(c=>c.fill)).toEqual(["#2a9d8f"]);
      await page.evaluate(async () => {
        const {app}=window.editorHarness; await app.entries.setVisible(window.singleEntry,false);
      });
      await expect.poll(async () => (await snapshot(page)).circles.length).toBe(0);
      await page.evaluate(() => window.editorHarness.app.entries.setVisible(window.singleEntry,true));
      await expect.poll(async () => (await snapshot(page)).circles.length).toBe(1);
      await page.evaluate(async () => {
        const g=window.editorHarness.app.domains.gpx,id=window.singleEntry;
        await g.replaceData(id,{tracks:[{segments:[{points:[{lat:35.681,lon:139.762}]}]}]},{expectedRevision:g.get(id).revision});
      });
      await expect.poll(async () => (await snapshot(page)).circles.map(c=>c.coordinate)).toEqual([[35.681,139.762]]);
      await page.evaluate(() => window.editorHarness.app.unuse("tilia-gpx-renderer"));
      await expect.poll(async () => (await snapshot(page)).circles.length).toBe(0);
      await page.evaluate(() => window.editorHarness.app.use("tilia-gpx-renderer"));
      await expect.poll(async () => (await snapshot(page)).circles.length).toBe(1);
      await page.evaluate(() => window.editorHarness.app.entries.remove(window.singleEntry));
      await expect.poll(async () => (await snapshot(page)).circles.length).toBe(0);
      const before=await current(page);
      await page.evaluate(() => { for(const layer of window.retiredCircles) layer.fire("click",{originalEvent:new MouseEvent("click")}); });
      expect(await current(page)).toEqual(before);
      await expect(page.locator(".leaflet-popup")).toHaveCount(0);
    } finally { await page.evaluate(() => window.editorHarness.destroy()); }
    expect(await snapshot(page)).toEqual({circles:[],lines:[]});
  });
}

for (const canvas of [false, true]) {
  test(`single-point markers preserve route, waypoint, photo and background selection (${canvas ? "Canvas" : "SVG"})`, async ({ page }) => {
    await ready(page, canvas);
    try {
      await page.evaluate(async () => {
        const {app,map}=window.editorHarness;
        await app.use("tilia-photo-renderer");
        await app.use("tilia-photo-ui");
        await app.domains.gpx.create({ tracks:[{segments:[{points:[{lat:35.68,lon:139.76}]}]}],
          routes:[{points:[{lat:35.681,lon:139.762}]}],
          waypoints:[{lat:35.679,lon:139.758,name:"Waypoint probe"}] });
        await app.domains.photo.create({name:"Photo probe",coordinate:{lat:35.682,lon:139.764}});
        map.setView([35.68,139.76],16,{animate:false});
      });
      await expect.poll(async () => (await snapshot(page)).circles.length).toBe(1);
      await clickCoordinate(page,35.68,139.76);
      await expect.poll(async () => (await current(page))?.ref.kind).toBe("track-point");
      await page.locator(".leaflet-popup-close-button").click();
      await page.locator(".tilia-route-point-marker").click();
      await expect.poll(async () => (await current(page))?.ref.kind).toBe("route-point");
      await page.locator(".leaflet-popup-close-button").click();
      await page.getByTitle("Waypoint probe",{exact:true}).click();
      await expect.poll(async () => (await current(page))?.ref.kind).toBe("waypoint");
      await page.locator(".leaflet-popup-close-button").click();
      await page.getByTitle("Photo probe",{exact:true}).click();
      await expect.poll(async () => (await current(page))?.ref.kind).toBe("photo");
      await expect(page.locator(".leaflet-popup")).toHaveCount(1);
      await page.locator(".leaflet-popup-close-button").click();
      const empty=await page.evaluate(()=>{const m=window.editorHarness.map,r=m.getContainer().getBoundingClientRect(),p=m.latLngToContainerPoint([35.677,139.764]);return{x:r.x+p.x,y:r.y+p.y};});
      await page.mouse.click(empty.x,empty.y);
      await expect.poll(()=>current(page)).toBeNull();
      expect((await snapshot(page)).circles).toHaveLength(1);
    } finally { await page.evaluate(() => window.editorHarness.destroy()); }
  });
}
