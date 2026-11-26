import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/tiles/**", route => route.abort());
  await page.goto("/tests/fixtures/application-lifecycle.html");
  await page.waitForFunction(() => window.fixtureReady);
});

test("old Photo time controls are inert during Layers removal, Close, and panel replacement", async ({ page }) => {
  const results = await page.evaluate(async () => {
    const app = window.lifecycle.create({ plugins: ["tilia-layers", "tilia-photo-ui", "tilia-settings"] });
    await app.ready;
    const entry = await app.domains.photo.create({ data: { capturedAt: 0 } });
    const open = (label) => document.querySelector(`button[aria-label="${label}"]`).click();
    const select = () => document.querySelector(".tilia-photo-time-mode-select");
    const change = (element, value) => {
      element.value = value;
      element.dispatchEvent(new Event("change"));
    };
    const revision = () => app.domains.photo.get(entry.id).revision;
    const revisions = [];
    for (const action of ["close", "switch", "unuse"]) {
      open("Layers");
      const old = select();
      if (action === "close") document.querySelector(".tilia-side-panel-close").click();
      else if (action === "switch") open("Settings");
      else {
        const removing = app.unuse("tilia-layers");
        while (app.hasPlugin("tilia-layers")) await Promise.resolve();
        change(old, "utc");
        await removing;
      }
      change(old, "utc");
      await new Promise(resolve => setTimeout(resolve, 0));
      revisions.push(revision());
    }
    await app.use("tilia-layers");
    open("Layers");
    change(select(), "utc");
    await new Promise(resolve => setTimeout(resolve, 0));
    revisions.push(revision());
    await app.destroy();
    return revisions;
  });
  expect(results).toEqual([1, 1, 1, 2]);
});

test("detached Settings controls cannot change the current GPX mode", async ({ page }) => {
  await page.evaluate(async () => {
    await window.lifecycle.create({ plugins: ["tilia-settings", "tilia-gpx-domain"] }).ready;
  });
  const launcher = page.getByRole("button", { name: "Settings", exact: true });
  const field = page.getByRole("radio", { name: "Segment mode", exact: true });
  await launcher.click();
  await expect(field).not.toBeChecked();
  const old = await field.elementHandle();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await launcher.click();
  await expect(field).not.toBeChecked();
  await old.evaluate(radio => {
    radio.checked = true;
    radio.dispatchEvent(new Event("change"));
    return new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(await page.evaluate(() => window.lifecycle.app.domains.gpx.getPresentationMode())).toBe("track");
  await page.evaluate(() => window.lifecycle.app.domains.gpx.setPresentationMode("segment"));
  await expect(field).toBeChecked();
  await page.evaluate(() => window.lifecycle.app.destroy());
});

for (const origin of ["Settings", "API"]) {
  test(`Settings reports a partial ${origin} failure after reopening and retries the desired mode`, async ({ page }) => {
    // Pause the second real provider update once. The real domain setter, entry
    // commits, failure notification and subsequent retry run normally.
    await page.route("**/src/plugins/domains/gpx-provider.js", async route => {
      const response = await route.fetch();
      const source = await response.text();
      const apply = 'if (command.type === "apply-presentation-mode") {';
      expect(source).toContain(apply);
      await route.fulfill({ response, body: source.replace(apply, apply + `
        if (currentInstance.data.name === "blocked" && window.pauseModeUpdate) await window.pauseModeUpdate();
      `) });
    });
    await page.evaluate(async () => {
      const app = window.lifecycle.create({ plugins: ["tilia-settings", "tilia-gpx-domain"] });
      await app.ready;
      const gpx = app.domains.gpx;
      const entries = [await gpx.create({ name: "first" }), await gpx.create({ name: "blocked" })];
      window.entryModes = () => entries.map(({ id }) => gpx.get(id).snapshot.derived.presentationMode);
      window.revisions = () => entries.map(({ id }) => gpx.get(id).revision);
      window.pauseModeUpdate = () => new Promise((_, reject) => {
        window.rejectUpdate = () => { delete window.pauseModeUpdate; reject(new Error("test failure")); };
      });
    });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const segment = page.getByRole("radio", { name: "Segment mode", exact: true });
    const status = page.getByRole("status");
    const retry = page.getByRole("button", { name: "Retry", exact: true });
    if (origin === "Settings") await segment.check();
    else await page.evaluate(() => {
      void window.lifecycle.app.domains.gpx.setPresentationMode("segment").catch(() => {});
    });
    await expect(segment).toBeChecked();
    await expect(segment).toBeDisabled();
    await expect(status).toHaveText("Applying display mode…");
    await expect(retry).toBeHidden();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.waitForFunction(() => typeof window.rejectUpdate === "function");
    await page.evaluate(() => window.rejectUpdate());
    await expect.poll(() => page.evaluate(() => window.lifecycle.app.domains.gpx.getPresentationStatus().state)).toBe("failed");
    expect(await page.evaluate(() => window.entryModes())).toEqual(["segment", "track"]);

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(status).toContainText("could not be applied");
    await expect(segment).toBeChecked();
    await retry.focus();
    await retry.press("Enter");
    await expect(retry).toBeHidden();
    await expect(segment).toBeFocused();
    await expect(status).toBeEmpty();
    expect(await page.evaluate(() => window.entryModes())).toEqual(["segment", "segment"]);
    const revisions = await page.evaluate(() => window.revisions());
    await segment.click();
    expect(await page.evaluate(() => window.revisions())).toEqual(revisions);
  });
}

test("two Settings panels have independent native radio groups", async ({ page }) => {
  await page.evaluate(async () => {
    const { createDefaultTiliaApp } = await import("/src/index.js");
    const container = document.createElement("div");
    container.id = "second-map";
    container.style.cssText = "width:600px;height:450px";
    document.body.append(container);
    const plugins = ["tilia-gpx-domain", "tilia-settings"];
    const first = window.lifecycle.create({ plugins });
    const second = createDefaultTiliaApp(container, { plugins,
      baseMapOptions: { tileUrl: "/tiles/{z}/{x}/{y}.png" } });
    await Promise.all([first.ready, second.ready]);
  });
  const first = page.locator("#map");
  const second = page.locator("#second-map");
  for (const map of [first, second]) {
    await map.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(map.getByRole("radio", { name: "Track mode", exact: true })).toBeChecked();
  }
  await first.getByRole("radio", { name: "Segment mode", exact: true }).check();
  await expect(first.getByRole("radio", { name: "Track mode", exact: true })).not.toBeChecked();
  await expect(second.getByRole("radio", { name: "Track mode", exact: true })).toBeChecked();
});
