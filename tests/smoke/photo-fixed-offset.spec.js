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
      const app = window.lifecycle.create({ plugins: ["tilia-gpx-input", "tilia-jpeg-input", "tilia-photo-ui", "tilia-settings", "tilia-layers"],
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
    });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const mode = page.locator(".tilia-photo-time-mode-select"), offset = page.locator(".tilia-photo-time-offset"), sign = page.locator(".tilia-photo-time-sign");
    await expect(mode).toHaveValue("custom"); await expect(offset).toHaveValue("09:00");
    const before = await page.evaluate(() => ({ snapshot: window.offsetView().snapshot, revision: window.offsetView().revision, viewport: window.offsetViewport() }));
    await sign.selectOption("-");
    await sign.press("Enter");
    await expect(sign).toHaveValue("+"); await expect(offset).toHaveValue("09:00");
    expect(await page.evaluate(() => window.offsetView().snapshot)).toEqual(before.snapshot);
    await mode.selectOption("auto");
    // Finish the committed mode change before starting a fresh uncommitted draft.
    await expect.poll(() => page.evaluate(() => window.offsetView().snapshot.preferences.requestedTimeMode)).toBe("auto");
    await expect(mode).toBeEnabled();
    await mode.selectOption("custom");
    await offset.fill("08:30");
    await page.evaluate(() => window.lifecycle.app.entries.setVisible(window.offsetId, false));
    await expect(offset).toHaveValue("08:30");
    await page.evaluate(() => window.lifecycle.app.entries.setVisible(window.offsetId, true));
    await offset.fill("09:00"); await offset.press("Enter");
    await expect.poll(() => page.evaluate(() => window.offsetView().snapshot.preferences.requestedTimeMode)).toBe("+09:00");
    expect(await page.evaluate(() => window.offsetViewport())).toEqual(before.viewport);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("photo-custom-offset-mobile.png") });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: testInfo.outputPath("photo-custom-offset-desktop.png") });
    await page.evaluate(() => window.lifecycle.app.unuse("tilia-photo-ui"));
    await expect(mode).toHaveCount(0);
    await page.evaluate(() => window.lifecycle.app.use("tilia-photo-ui"));
    await expect(page.locator(".tilia-photo-time-offset")).toHaveValue("09:00");
    await page.evaluate(() => window.lifecycle.app.entries.remove(window.offsetId));
    await expect(page.locator(".tilia-photo-time-offset")).toHaveCount(0);
    await page.evaluate(() => window.lifecycle.app.destroy());
    await expect(page.locator("link[data-tilia-stylesheet]")).toHaveCount(0);
  });
  test("a custom offset mutation cannot update a deleted entry or disposed settings mount", async ({ page }) => {
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
      const app = window.lifecycle.create({ plugins: ["tilia-photo-ui", "tilia-settings"],
        builtins: builtins.map(descriptor => descriptor.id === delayed.id ? { ...descriptor, load: () => delayed } : descriptor),
      });
      await app.ready;
      const entry = await app.domains.photo.create({ data: { name: "GPS photo", coordinate: { lat: 35, lon: 135 }, capturedAt: 0 }, preferences: { requestedTimeMode: "+09:00" } });
      window.offsetId = entry.id;
      window.offsetChanges = [];
      app.entries.subscribe(event => {
        if (event.type === "domain-changed" && event.entry.id === entry.id) window.offsetChanges.push(event);
      }, { emitCurrent: false });
    });
    await page.getByRole("button", { name: "Settings", exact: true }).click();
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
    await page.evaluate(async () => {
      const app = window.lifecycle.app;
      window.offsetRemoval = app.entries.remove(window.offsetId);
      const retiring = app.unuse("tilia-photo-ui");
      window.offsetRelease();
      await Promise.all([window.offsetRemoval, retiring]);
    });
    await expect(offset).toHaveCount(0);
    expect(await page.evaluate(() => window.lifecycle.app.entries.get(window.offsetId))).toBeNull();
    expect(await page.evaluate(() => window.offsetChanges)).toEqual([]);
    await page.evaluate(() => window.lifecycle.app.destroy());
    await expect(page.locator("link[data-tilia-stylesheet]")).toHaveCount(0);
  });
});
