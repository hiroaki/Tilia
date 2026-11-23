import { expect, test } from "@playwright/test";
import { mockPhotoExif } from "../helpers/photo-exif.js";

test.beforeEach(async ({ page }) => mockPhotoExif(page));

test.describe("Photo custom offset UI", () => {
  test.use({ timezoneId: "Asia/Tokyo" });
  test("drafts, failed inference, deletion and disposal preserve ownership", async ({ page }, testInfo) => {
    await page.route("**/tiles/**", route => route.abort());
    await page.goto("/tests/fixtures/application-lifecycle.html");
    await page.waitForFunction(() => window.fixtureReady);
    await page.evaluate(async () => {
      Object.assign(window.lifecycle.container.style, { width: "100%", height: "calc(100vh - 34px)" });
      const app = window.lifecycle.create({ plugins: ["tilia-gpx-input", "tilia-jpeg-input", "tilia-photo-ui", "tilia-photo-renderer", "tilia-layers"],
        baseMapOptions: { tileUrl: "/tiles/{z}/{x}/{y}.png", center: [35, 135.81], zoom: 13, mapOptions: { zoomAnimation: false } },
        pluginOptions: { "tilia-jpeg-input": { defaultPhotoTimeMode: "+09:00" } } });
      await app.ready;
      await app.use({ id: "offset-test-observer", setup(context) {
        window.offsetViewport = () => context.map.getViewport();
      } });
      for (const url of ["/tests/fixtures/photo-offset-track.gpx", "/tests/fixtures/photo-exif.jpg"]) {
        const blob = await (await fetch(url)).blob();
        await app.load(new File([blob], url.split("/").at(-1), { type: blob.type }));
      }
      window.offsetId = app.entries.list().at(-1).id;
      window.offsetView = () => app.domains.photo.get(window.offsetId);
      window.otherPhoto = await app.domains.photo.create({ data: { name: "Other photo", coordinate: { lat: 35, lon: 135.81 } } });
    });
    await page.getByRole("button", { name: "Layers", exact: true }).click();
    const row = page.locator(".tilia-layer-item").filter({ has: page.getByRole("button", { name: "photo-exif.jpg", exact: true }) });
    const mode = row.getByRole("combobox", { name: "photo-exif.jpg photo time mode" });
    const offset = row.locator(".tilia-photo-time-offset");
    const sign = row.getByRole("combobox", { name: "photo-exif.jpg photo time offset sign" });
    const marker = page.locator('.leaflet-marker-icon[title="photo-exif.jpg"]');
    const captured = row.locator(".tilia-layer-meta");
    await expect(mode).toHaveValue("custom"); await expect(offset).toHaveValue("09:00");
    await expect(captured).toHaveText("2013/11/24 15:22:39 +09:00");
    await expect(row.getByRole("button", { name: "Fit photo-exif.jpg" })).toBeEnabled();
    await expect(row.getByRole("button", { name: "Reveal photo-exif.jpg" })).toHaveCount(0);
    const before = await page.evaluate(() => ({ snapshot: window.offsetView().snapshot, revision: window.offsetView().revision, viewport: window.offsetViewport() }));
    const originalMarkerPosition = await marker.evaluate(node => node.style.transform);
    await sign.selectOption("-");
    await sign.press("Enter");
    await expect(sign).toHaveValue("+"); await expect(offset).toHaveValue("09:00");
    await expect(captured).toHaveText("2013/11/24 15:22:39 +09:00");
    expect(await page.evaluate(() => ({ snapshot: window.offsetView().snapshot, revision: window.offsetView().revision })))
      .toEqual({ snapshot: before.snapshot, revision: before.revision });
    await mode.selectOption("auto");
    // Finish the committed mode change before starting a fresh uncommitted draft.
    await expect.poll(() => page.evaluate(() => window.offsetView().snapshot.preferences.requestedTimeMode)).toBe("auto");
    expect(await page.evaluate(() => window.offsetView().snapshot.derived.resolvedTimeMode)).toBe("local");
    await expect(captured).toHaveText("2013/11/24 15:22:39 +09:00");
    await expect(mode).toBeEnabled();
    await mode.selectOption("custom");
    await offset.fill("08:30");
    const draftInput = await offset.elementHandle();
    await page.evaluate(async () => {
      const { app } = window.lifecycle;
      await app.entries.setVisible(window.offsetId, false);
      await app.selection.request(app.domains.photo.selection.createCandidate(window.otherPhoto.id));
      await app.domains.photo.setRequestedTimeMode(window.otherPhoto.id, "local", { expectedRevision: 1 });
    });
    expect(await offset.evaluate((input, previous) => input === previous, draftInput)).toBe(true);
    await expect(offset).toBeFocused();
    await expect(offset).toHaveValue("08:30");
    await expect(offset).toBeEnabled();
    await row.getByRole("button", { name: "Fit photo-exif.jpg" }).focus();
    await expect.poll(() => page.evaluate(() => window.offsetView().snapshot.preferences.requestedTimeMode)).toBe("+08:30");
    await expect(captured).toHaveText("2013/11/24 15:22:39 +08:30");
    await page.evaluate(() => window.lifecycle.app.entries.setVisible(window.offsetId, true));
    const after = await page.evaluate(() => ({
      derived: window.offsetView().snapshot.derived,
      selected: window.lifecycle.app.selection.getCurrent()?.entryId === window.otherPhoto.id,
      otherMode: window.lifecycle.app.domains.photo.get(window.otherPhoto.id).snapshot.preferences.requestedTimeMode,
    }));
    expect(after.derived.locationSource).toBe("gpx-time-inference");
    expect(after.derived.inferredLocation).not.toEqual(before.snapshot.derived.inferredLocation);
    expect(after.selected).toBe(true);
    expect(after.otherMode).toBe("local");
    await expect.poll(() => marker.evaluate(node => node.style.transform)).not.toBe(originalMarkerPosition);
    await offset.fill("09:00"); await offset.press("Enter");
    await expect.poll(() => page.evaluate(() => window.offsetView().snapshot.preferences.requestedTimeMode)).toBe("+09:00");
    expect(await page.evaluate(() => window.offsetViewport())).toEqual(before.viewport);
    await page.setViewportSize({ width: 390, height: 844 });
    await offset.fill("08:30"); await offset.press("Enter");
    await expect(captured).toHaveText("2013/11/24 15:22:39 +08:30");
    const [rowBox, modeBox, offsetBox] = await Promise.all([row.boundingBox(), mode.boundingBox(), offset.boundingBox()]);
    for (const control of [modeBox, offsetBox]) {
      expect(control.x).toBeGreaterThanOrEqual(rowBox.x);
      expect(control.x + control.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
    }
    await page.screenshot({ path: testInfo.outputPath("photo-custom-offset-mobile.png") });
    await page.setViewportSize({ width: 1280, height: 800 });
    await offset.fill("09:00"); await offset.press("Enter");
    await expect(captured).toHaveText("2013/11/24 15:22:39 +09:00");
    await page.screenshot({ path: testInfo.outputPath("photo-custom-offset-desktop.png") });
    await page.evaluate(() => window.lifecycle.app.unuse("tilia-photo-ui"));
    await expect(mode).toHaveCount(0);
    await page.evaluate(() => window.lifecycle.app.use("tilia-photo-ui"));
    await expect(offset).toHaveValue("09:00");
    await page.evaluate(() => window.lifecycle.app.entries.remove(window.offsetId));
    await expect(offset).toHaveCount(0);
    await page.evaluate(() => window.lifecycle.app.destroy());
    await expect(page.locator("link[data-tilia-stylesheet]")).toHaveCount(0);
  });
  test("pending custom offset mutations respect panel closure and entry deletion", async ({ page }) => {
    await page.route("**/tiles/**", route => route.abort());
    await page.goto("/tests/fixtures/application-lifecycle.html");
    await page.waitForFunction(() => window.fixtureReady);
    await page.evaluate(async () => {
      const { createPhotoProvider } = await import("/src/plugins/domains/photo-provider.js");
      const { photoDomainKey } = await import("/src/domains/keys.js");
      const { builtins } = await import("/src/builtins.js");
      const delayed = { id: "tilia-photo-domain", setup(context) {
        const provider = createPhotoProvider();
        context.domains.provide(photoDomainKey, { ...provider, async prepareMutation(input) {
          const prepared = await provider.prepareMutation(input);
          await new Promise(resolve => { window.offsetRelease = resolve; });
          return prepared;
        } });
      } };
      const app = window.lifecycle.create({ plugins: ["tilia-photo-ui", "tilia-layers"],
        builtins: builtins.map(descriptor => descriptor.id === delayed.id ? { ...descriptor, load: () => delayed } : descriptor),
      });
      await app.ready;
      const entry = await app.domains.photo.create({ data: { name: "Timestamp-only photo", capturedAt: 0 }, preferences: { requestedTimeMode: "+09:00" } });
      window.offsetId = entry.id;
      window.offsetChanges = [];
      app.entries.subscribe(event => {
        if (event.type === "domain-changed" && event.entry.id === entry.id) window.offsetChanges.push(event);
      }, { emitCurrent: false });
    });
    const launcher = page.getByRole("button", { name: "Layers", exact: true });
    await launcher.click();
    const offset = page.locator(".tilia-photo-time-offset");
    await page.locator(".tilia-photo-time-sign").selectOption("-");
    await offset.fill("08:30"); await offset.press("Enter");
    await page.waitForFunction(() => typeof window.offsetRelease === "function");
    // The active native input stays focusable to avoid blur/focusout reentry;
    // the other controls reflect the pending command until it settles.
    await expect(offset).toBeFocused();
    await expect(offset).toBeEnabled();
    await expect(page.locator(".tilia-photo-time-mode-select")).toBeDisabled();
    await expect(page.locator(".tilia-photo-time-sign")).toBeDisabled();
    expect(await page.evaluate(() => window.lifecycle.app.domains.photo.get(window.offsetId).snapshot.preferences.requestedTimeMode)).toBe("+09:00");
    const oldMode = await page.locator(".tilia-photo-time-mode-select").elementHandle();
    await offset.press("Escape");
    await expect(offset).toHaveCount(0);
    await page.evaluate(() => { window.offsetRelease(); window.offsetRelease = null; });
    await expect.poll(() => page.evaluate(() => window.offsetChanges.length)).toBe(1);
    expect(await oldMode.evaluate(control => ({ connected: control.isConnected, disabled: control.disabled })))
      .toEqual({ connected: false, disabled: true });

    await launcher.click();
    await expect(offset).toHaveValue("08:30");
    await expect(page.locator(".tilia-photo-time-sign")).toHaveValue("-");
    await offset.fill("07:30"); await offset.press("Enter");
    await page.waitForFunction(() => typeof window.offsetRelease === "function");
    await page.evaluate(async () => {
      const app = window.lifecycle.app;
      window.offsetRemoval = app.entries.remove(window.offsetId);
      const retiring = app.unuse("tilia-photo-ui");
      window.offsetRelease();
      await Promise.all([window.offsetRemoval, retiring]);
    });
    await expect(offset).toHaveCount(0);
    expect(await page.evaluate(() => window.lifecycle.app.entries.get(window.offsetId))).toBeNull();
    expect(await page.evaluate(() => window.offsetChanges.length)).toBe(1);
    await page.evaluate(() => window.lifecycle.app.destroy());
    await expect(page.locator("link[data-tilia-stylesheet]")).toHaveCount(0);
  });
});
