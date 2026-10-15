import { expect, test } from "@playwright/test";
const vertex = '.leaflet-partially-editable-polyline-point';
const midpoint = '.leaflet-partially-editable-polyline-new-point';
async function point(page, lat, lon) {
  return page.evaluate(([lat, lon]) => {
    const m = window.editorHarness.map, r = m.getContainer().getBoundingClientRect();
    const p = m.latLngToContainerPoint([lat, lon]);
    return { x: r.x + p.x, y: r.y + p.y };
  }, [lat, lon]);
}
async function click(page, lat, lon) {
  const p = await point(page, lat, lon); await page.mouse.click(p.x, p.y);
}
async function circles(page) {
  return page.evaluate(() => {
    const result = [];
    window.editorHarness.map.eachLayer(l => {
      if (l.options?.className === 'tilia-track-editor-single-point') result.push([l.getLatLng().lat, l.getLatLng().lng]);
    });
    return result;
  });
}
async function setup(page, canvas, tracks) {
  await page.goto(`/tests/fixtures/editor.html?renderer=${canvas ? 'canvas' : 'svg'}`);
  await page.waitForFunction(() => !!window.editorHarness);
  await page.evaluate(async tracks => {
    const { app, map } = window.editorHarness;
    await app.domains.gpx.create({ tracks });
    map.setView([35.68,139.76],16,{animate:false});
  }, tracks);
  await page.getByRole('button',{name:'Track editor',exact:true}).click();
  await page.getByRole('button',{name:'Start Edit',exact:true}).click();
}
const p = (lat, lon) => ({ lat, lon });
for (const canvas of [false,true]) {
  const name = canvas ? 'Canvas' : 'SVG';
  test(`native draft clicks, singleton identity and handle replacement (${name})`, async ({page}) => {
    await setup(page,canvas,[
      {segments:[{points:[p(35.68,139.76)]}]},
      {segments:[{points:[p(35.68,139.758),p(35.68,139.762)]}]},
    ]);
    try {
      await expect.poll(()=>circles(page)).toEqual([[35.68,139.76]]);
      await page.evaluate(() => {
        window.nativeEditingStarts = 0;
        window.editorHarness.map.eachLayer(layer => {
          if (layer.getEditablePointRange) layer.on('editingstart', () => window.nativeEditingStarts++);
        });
      });
      const hover=await point(page,35.68,139.76);
      await page.mouse.move(hover.x,hover.y);
      await expect.poll(()=>page.evaluate(p=>getComputedStyle(document.elementFromPoint(p.x,p.y)).cursor,hover)).toBe('pointer');
      await click(page,35.68,139.76);
      await expect(page.locator(vertex)).toHaveCount(1);
      expect(await page.evaluate(() => window.nativeEditingStarts)).toBe(1);
      await expect(page.locator(midpoint)).toHaveCount(0);
      expect(await circles(page)).toEqual([]);
      await expect(page.locator('.leaflet-popup')).toHaveCount(0);
      expect(await page.evaluate(()=>window.editorHarness.app.selection.getCurrent())).toBeNull();
      const box=await page.locator(vertex).boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2-30,{steps:5}); await page.mouse.up();
      await click(page,35.678,139.765);
      await expect(page.locator(vertex)).toHaveCount(0);
      await expect.poll(async()=> (await circles(page)).length).toBe(1);
      expect((await circles(page))[0][0]).toBeGreaterThan(35.68);
      // Ordinary line is native-interactive, and switching back restores the circle.
      const line=await point(page,35.68,139.759);
      // Canvas coalesces hover checks for 32ms; move again while polling.
      await expect.poll(async () => {
        await page.mouse.move(line.x + 1, line.y);
        await page.mouse.move(line.x, line.y);
        return page.evaluate(p => getComputedStyle(document.elementFromPoint(p.x,p.y)).cursor, line);
      }).toBe('pointer');
      await expect.poll(()=>page.evaluate(p=>getComputedStyle(document.elementFromPoint(p.x,p.y)).cursor,line)).toBe('pointer');
      await click(page,35.68,139.759);
      await expect(page.locator(vertex)).toHaveCount(2);
      await expect(page.locator(midpoint)).toHaveCount(1);
      const middle = await page.locator(midpoint).boundingBox();
      await page.mouse.move(middle.x + middle.width / 2, middle.y + middle.height / 2);
      await page.mouse.down();
      await page.mouse.move(middle.x + middle.width / 2, middle.y + middle.height / 2 + 20, { steps: 5 });
      await page.mouse.up();
      await expect(page.locator(vertex)).toHaveCount(3);
      await page.getByRole('button', { name: 'Undo', exact: true }).click();
      await expect(page.locator(vertex)).toHaveCount(2);
      await page.getByRole('button', { name: 'Select area', exact: true }).click();
      const first = await page.locator(vertex).first().boundingBox();
      await page.mouse.move(first.x - 3, first.y - 3); await page.mouse.down();
      await page.mouse.move(first.x + first.width + 3, first.y + first.height + 3, { steps: 4 });
      await page.mouse.up();
      await expect(page.locator('.tilia-track-editor-selection-shield')).toHaveCount(0);
      await expect(page.locator('.tilia-track-editor-selection-ring')).toHaveCount(1);
      await page.getByRole('button', { name: 'Select area', exact: true }).click();
      await page.keyboard.press('Escape');
      await expect(page.locator('.tilia-track-editor-selection-shield')).toHaveCount(0);
      const moved=(await circles(page))[0]; await click(page,...moved);
      await expect(page.locator(vertex)).toHaveCount(1);
      await click(page,35.678,139.765);
      const empty=await point(page,35.678,139.765); await page.mouse.move(empty.x,empty.y);
      await expect.poll(()=>page.evaluate(p=>getComputedStyle(document.elementFromPoint(p.x,p.y)).cursor,empty)).toBe('grab');
      await page.getByRole('button',{name:'Cancel',exact:true}).click();
      expect(await circles(page)).toEqual([]);
      await page.getByRole('button',{name:'Start Edit',exact:true}).click();
      await expect.poll(()=>circles(page)).toEqual([[35.68,139.76]]);
      await click(page,35.68,139.76); await expect(page.locator(vertex)).toHaveCount(1);
      await page.evaluate(() => {
        window.editorHarness.map.eachLayer(layer => {
          if (layer.getEditablePointRange && layer.getLatLngs().length === 1) layer.remove();
        });
      });
      expect(await circles(page)).toEqual([]);
      await expect(page.locator(vertex)).toHaveCount(0);
    } finally { await page.evaluate(()=>window.editorHarness.destroy()); }
    expect(await circles(page)).toEqual([]);
    await expect(page.locator(vertex)).toHaveCount(0);
  });
  test(`native point-count transitions, Undo/Redo and save (${name})`, async ({page}) => {
    await setup(page,canvas,[{segments:[{points:[p(35.68,139.758),p(35.68,139.762)]}]}]);
    try {
      await click(page,35.68,139.76);
      await expect(page.locator(vertex)).toHaveCount(2);
      await page.locator(vertex).first().click({button:'right'});
      await expect(page.locator(vertex)).toHaveCount(1);
      await expect(page.locator(midpoint)).toHaveCount(0);
      expect(await circles(page)).toEqual([]);
      await click(page,35.678,139.765);
      await expect.poll(()=>circles(page)).toEqual([[35.68,139.762]]);
      await page.getByRole('button',{name:'Undo',exact:true}).click();
      await expect.poll(()=>circles(page)).toEqual([]);
      await page.getByRole('button',{name:'Redo',exact:true}).click();
      await expect.poll(()=>circles(page)).toEqual([[35.68,139.762]]);
      await click(page,35.68,139.762);
      await page.locator(vertex).click({button:'right'});
      await expect(page.locator(vertex)).toHaveCount(0);
      expect(await circles(page)).toEqual([]);
      await page.getByRole('button',{name:'Undo',exact:true}).click();
      await expect.poll(()=>circles(page)).toEqual([[35.68,139.762]]);
      await page.getByRole('button',{name:'Save Copy',exact:true}).click();
      await expect(page.getByRole('button',{name:'Start Edit',exact:true})).toBeEnabled();
      expect(await circles(page)).toEqual([]);
      expect(await page.evaluate(()=>window.editorHarness.app.entries.list().length)).toBe(2);
    } finally { await page.evaluate(()=>window.editorHarness.destroy()); }
  });
}

for (const canvas of [false, true]) {
  const name = canvas ? 'Canvas' : 'SVG';
  test(`same singleton layer re-add restores one current, clickable marker (${name})`, async ({ page }) => {
    await setup(page, canvas, [{ segments: [{ points: [p(35.68,139.76)] }] }]);
    try {
      await expect.poll(() => circles(page)).toEqual([[35.68,139.76]]);
      await page.evaluate(() => {
        window.readdStarts = 0;
        window.editorHarness.map.eachLayer(layer => {
          if (layer.getEditablePointRange) {
            window.readdLayer = layer;
            layer.on('editingstart', () => window.readdStarts++);
          }
          if (layer.options?.className === 'tilia-track-editor-single-point') window.readdMarker = layer;
        });
      });
      let coordinate = [35.68,139.76];
      for (let cycle = 0; cycle < 3; cycle++) {
        await page.evaluate(() => window.readdLayer.remove());
        expect(await circles(page)).toEqual([]);
        await page.evaluate(() => window.readdLayer.addTo(window.editorHarness.map));
        await expect.poll(() => circles(page)).toEqual([coordinate]);
        await click(page, ...coordinate);
        await expect(page.locator(vertex)).toHaveCount(1);
        await expect(page.locator(midpoint)).toHaveCount(0);
        expect(await circles(page)).toEqual([]);
        expect(await page.evaluate(() => window.readdStarts)).toBe(cycle + 1);
        if (cycle === 0) {
          const box = await page.locator(vertex).boundingBox();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 20, { steps: 4 });
          await page.mouse.up();
        }
        await click(page,35.678,139.765);
        await expect.poll(async () => (await circles(page)).length).toBe(1);
        coordinate = (await circles(page))[0];
        expect(coordinate[0]).toBeGreaterThan(35.68);
      }
      await page.evaluate(() => window.editorHarness.app.unuse('x-track-editor'));
      expect(await circles(page)).toEqual([]);
      await expect(page.locator(vertex)).toHaveCount(0);
      expect(await page.evaluate(() => ({
        layerClick: window.readdLayer.listens('click'),
        markerClick: window.readdMarker.listens('click'),
        layerAttached: window.editorHarness.map.hasLayer(window.readdLayer),
        markerAttached: window.editorHarness.map.hasLayer(window.readdMarker),
      }))).toEqual({ layerClick:false, markerClick:false, layerAttached:false, markerAttached:false });
    } finally { await page.evaluate(() => window.editorHarness.destroy()); }
  });

  test(`cross-track singleton priority survives internal deletion rebuild and history (${name})`, async ({ page }) => {
    await setup(page, canvas, [
      { segments:[{ points:[p(35.68,139.76)] }] },
      { segments:[
        { points:[p(35.68,139.758),p(35.68,139.762)] },
        { points:[p(35.682,139.763)] },
      ] },
    ]);
    const activateA = async () => {
      await click(page,35.68,139.76);
      await expect(page.locator(vertex)).toHaveCount(1);
      await expect(page.locator(midpoint)).toHaveCount(0);
      expect(await page.locator(vertex).evaluate(element => {
        const r = element.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2,r.y + r.height / 2) === element;
      })).toBe(true);
      expect(await page.evaluate(() => window.editorHarness.app.selection.getCurrent())).toBeNull();
      await expect(page.locator('.leaflet-popup')).toHaveCount(0);
    };
    try {
      await expect.poll(async () => (await circles(page)).length).toBe(2);
      await activateA();
      await click(page,35.682,139.763);
      await expect(page.locator(vertex)).toHaveCount(1);
      await page.locator(vertex).click({button:'right'});
      await expect.poll(() => circles(page)).toEqual([[35.68,139.76]]);
      await activateA();
      for (const action of ['Undo','Redo']) {
        await page.getByRole('button',{name:action,exact:true}).click();
        await click(page,35.678,139.765);
        await expect.poll(async () => (await circles(page)).length).toBe(action === 'Undo' ? 2 : 1);
        await activateA();
      }
      await click(page,35.678,139.765);
      // Re-adding another track's ordinary line must not cover A either.
      await page.evaluate(() => {
        const map = window.editorHarness.map;
        let line;
        map.eachLayer(layer => { if (layer.getEditablePointRange && layer.getLatLngs().length === 2) line = layer; });
        line.remove(); line.addTo(map);
      });
      await activateA();
    } finally { await page.evaluate(() => window.editorHarness.destroy()); }
    expect(await circles(page)).toEqual([]);
  });
}
