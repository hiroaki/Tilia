import { expect, test } from "@playwright/test";

// Exercise the real upstream editor with both pane arrangements. Tilia's editor
// session/history/save integration is covered separately by editor*.spec.js.
for (const canvas of [false, true]) for (const custom of [false, true]) {
  test(`upstream editor: geometry, propagation and dragging (${canvas ? 'Canvas' : 'SVG'}, ${custom ? 'custom' : 'standard'} panes)`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/tests/fixtures/application-lifecycle.html');
    await page.waitForFunction(() => window.fixtureReady);
    await page.evaluate(async ({ canvas, custom }) => {
      const L = await import('leaflet');
      const { PartiallyEditablePolyline } = await import('/plugins/x-track-editor/vendor/leaflet-partially-editable-polyline.js');
      const style = document.createElement('link'); style.rel = 'stylesheet';
      style.href = '/plugins/x-track-editor/vendor/leaflet-partially-editable-polyline.css'; document.head.append(style);
      await new Promise((resolve, reject) => { style.onload = resolve; style.onerror = reject; });
      const app = window.lifecycle.create({ plugins: [], baseMapOptions: { tileUrl: '/tiles/{z}/{x}/{y}.png', center: [35.68,139.76], zoom: 16, mapOptions: { renderer: canvas ? new L.Canvas() : new L.SVG() } } });
      await app.ready;
      const map = app.map, options = {};
      if (custom) {
        // Same z-index: upper Canvas must win by DOM order, not creation ID.
        for (const name of ['lower', 'draft', 'handles']) map.createPane(name).style.zIndex = '660';
        options.pane = 'draft'; options.handlePane = 'handles';
      }
      const source = [new L.LatLng(35.68,139.758,123),new L.LatLng(35.68,139.762,456)];
      const layer = new PartiallyEditablePolyline(source, options).addTo(map);
      const state = window.vendorCheck = { app, map, layer, source, clicks: 0, lowerClicks: 0, mapClicks: 0, ends: 0, moves: 0 };
      // Add the lower pane's renderer after the upper one to catch ordering regressions.
      if (custom) new L.Polyline(source, { pane:'lower', weight:20 }).on('click', () => state.lowerClicks++).addTo(map);
      layer.on('click', e => { state.clicks++; layer.startEditing(e.latlng); });
      layer.on('pointclick', () => state.pointClicked = true);
      layer.on('editingend', () => state.ends++);
      layer.on('pointchange', () => state.moves++);
      map.on('click', () => state.mapClicks++);
      state.initial = map.getCenter();
    }, { canvas, custom });
    try {
      const position = await page.evaluate(() => {
        const { map } = window.vendorCheck, p = map.latLngToContainerPoint([35.68,139.76]), r = map.getContainer().getBoundingClientRect();
        return { x:r.x+p.x, y:r.y+p.y };
      });
      await page.mouse.click(position.x, position.y);
      const vertices = page.locator('.leaflet-partially-editable-polyline-point');
      await expect(vertices).toHaveCount(2);
      expect(await page.evaluate(async () => {
        const { Canvas } = await import("leaflet");
        const s = window.vendorCheck;
        return { clicks:s.clicks, lower:s.lowerClicks, map:s.mapClicks, isolated:s.layer.getLatLngs()[0] !== s.source[0], alt:s.layer.getLatLngs()[0].alt, renderer:s.map.getRenderer(s.layer) instanceof Canvas ? 'canvas' : 'svg', handles:document.querySelector('.leaflet-partially-editable-polyline-point').parentElement === s.map.getPane(s.layer.options.handlePane ?? 'markerPane') };
      })).toEqual({ clicks:1, lower:0, map:0, isolated:true, alt:undefined, renderer:canvas ? 'canvas' : 'svg', handles:true });
      await vertices.first().click();
      expect(await page.evaluate(() => window.vendorCheck.pointClicked)).toBe(true);
      // Rejected replacement must preserve active handles, geometry and session.
      expect(await page.evaluate(() => {
        const s = window.vendorCheck, before = JSON.stringify(s.layer.getLatLngs());
        const failures = [];
        for (const invalid of [[[null,139]], [[[35,139],[36,140]]]]) {
          try { s.layer.setLatLngs(invalid); failures.push(false); } catch { failures.push(true); }
        }
        return { failures, unchanged:before===JSON.stringify(s.layer.getLatLngs()), ends:s.ends, range:s.layer.getEditablePointRange() };
      })).toEqual({ failures:[true,true], unchanged:true, ends:0, range:{ startIndex:0, endIndex:1 } });
      const box = await vertices.first().boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2-35,{steps:6}); await page.mouse.up();
      expect(await page.evaluate(() => {
        const s=window.vendorCheck;
        return { moved:s.layer.getLatLngs()[0].lat>35.68, source:s.source.map(p=>[p.lat,p.lng,p.alt]), center:s.map.getCenter().equals(s.initial), clicks:s.mapClicks, moves:s.moves };
      })).toEqual({ moved:true, source:[[35.68,139.758,123],[35.68,139.762,456]], center:true, clicks:0, moves:1 });
      await page.evaluate(() => window.vendorCheck.layer.endEditing());
      await expect(vertices).toHaveCount(0);
      expect(errors).toEqual([]);
    } finally { await page.evaluate(() => window.vendorCheck.app.destroy()); }
  });
}
