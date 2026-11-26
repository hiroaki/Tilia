import { expect, test } from "@playwright/test";
import { mockPhotoExif, timestampPhoto } from "../helpers/photo-exif.js";

test.beforeEach(async ({ page }) => mockPhotoExif(page));
test("viewer Layers exposes Photo time, preserves its value on reopen and owns side layout/focus", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/tests/fixtures/viewer/");
  await page.locator('input[type="file"]').setInputFiles(timestampPhoto);
  await expect(page.locator(".tilia-status-text")).toContainText("IMG_2892.JPG");
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  await settings.click();
  const group = page.getByRole("group", { name: "GPX track display" });
  const track = group.getByRole("radio", { name: "Track mode", exact: true });
  const segment = group.getByRole("radio", { name: "Segment mode", exact: true });
  await expect(track).toBeChecked();
  await track.focus();
  await track.press("ArrowRight");
  await expect(segment).toBeChecked();
  await expect(segment).toBeFocused();
  await segment.press("ArrowLeft");
  await expect(track).toBeChecked();
  await expect(track).toBeFocused();
  await group.getByText("Segment mode", { exact: true }).click();
  await expect(segment).toBeChecked();
  await segment.press("Escape");
  await expect(settings).toBeFocused();

  const launcher = page.getByRole("button", { name: "Layers", exact: true });
  const panel = page.getByRole("dialog", { name: "Layers", exact: true });
  const select = panel.getByRole("combobox", { name: "IMG_2892.JPG photo time mode" });
  await launcher.click();
  await expect(panel).toBeVisible();
  await expect(select).toHaveValue("auto");
  const captured = panel.locator(".tilia-layer-meta");
  const original = await page.evaluate(() => new Date(2013, 10, 24, 15, 22, 39).toLocaleString());
  await expect(captured).toHaveText(original);
  expect(await select.locator("option").evaluateAll(nodes => nodes.map(node => node.value))).toEqual(["auto", "local", "utc", "custom"]);
  await select.selectOption("utc");
  await expect(select).toHaveValue("utc");
  await expect(captured).toHaveText("2013/11/24 15:22:39 +00:00");
  const panelBox = await panel.boundingBox();
  const control = await page.locator(".tilia-base-map-control").boundingBox();
  expect(control.x + control.width).toBeLessThanOrEqual(panelBox.x);

  await select.press("Escape");
  await expect(panel).toBeHidden();
  await expect(launcher).toBeFocused();
  await launcher.click();
  await expect(select).toHaveValue("utc");
  expect(errors).toEqual([]);
});

test.describe("local Photo time display", () => {
  test.use({ timezoneId: "America/New_York" });

  test("uses the offset on the capture date and omits it when the timestamp is missing", async ({ page }) => {
    await page.goto("/tests/fixtures/application-lifecycle.html");
    await page.waitForFunction(() => window.fixtureReady);
    await page.evaluate(async () => {
      const app = window.lifecycle.create({ plugins: ["tilia-photo-ui", "tilia-layers"] });
      await app.ready;
      for (const [name, capturedAt] of [
        ["Winter", new Date(2013, 0, 24, 15, 20, 39).getTime()],
        ["Summer", new Date(2013, 6, 24, 15, 20, 39).getTime()],
        ["No date", null],
      ]) {
        await app.domains.photo.create({ data: { name, capturedAt }, preferences: { requestedTimeMode: "local" } });
      }
    });
    await page.getByRole("button", { name: "Layers", exact: true }).click();
    for (const [name, expected] of [
      ["Winter", "2013/01/24 15:20:39 -05:00"],
      ["Summer", "2013/07/24 15:20:39 -04:00"],
      ["No date", "-"],
    ]) {
      const row = page.locator(".tilia-layer-item").filter({ has: page.getByRole("button", { name, exact: true }) });
      await expect(row.locator(".tilia-layer-meta")).toHaveText(expected);
      await expect(row.locator(".tilia-photo-time-mode-select, .tilia-photo-time-custom")).toHaveCount(name === "No date" ? 0 : 2);
    }
  });

  test("updates form eligibility in place and leaves GPS Photo time available through the domain API", async ({ page }) => {
    await page.goto("/tests/fixtures/application-lifecycle.html");
    await page.waitForFunction(() => window.fixtureReady);
    await page.evaluate(async () => {
      const app = window.lifecycle.create({ plugins: ["tilia-photo-ui", "tilia-layers"] });
      await app.ready;
      const entry = await app.domains.photo.create({
        data: { name: "Photo", coordinate: { lat: 35, lon: 135 }, capturedAt: new Date(2013, 0, 24, 15, 20, 39).getTime() },
        preferences: { requestedTimeMode: "+09:00" },
      });
      window.photoView = () => app.domains.photo.get(entry.id);
      window.replacePhotoData = (changes) => {
        const { revision, snapshot } = window.photoView();
        return app.domains.photo.replaceData(entry.id, { ...snapshot.data, ...changes }, { expectedRevision: revision });
      };
    });
    await page.getByRole("button", { name: "Layers", exact: true }).click();
    const row = page.locator(".tilia-layer-item");
    const rowHandle = await row.elementHandle();
    const meta = row.locator(".tilia-layer-meta");
    const mode = row.locator(".tilia-photo-time-mode-select");
    const editor = row.locator(".tilia-photo-time-mode-select, .tilia-photo-time-custom");
    await expect(meta).toHaveText("2013/01/24 15:20:39");
    await expect(editor).toHaveCount(0);
    const updated = await page.evaluate(async () => {
      const { entry, revision } = window.photoView();
      await window.lifecycle.app.domains.photo.setRequestedTimeMode(entry.id, "utc", { expectedRevision: revision });
      return window.photoView().snapshot;
    });
    expect(updated.preferences.requestedTimeMode).toBe("utc");
    expect(updated.derived.locationSource).toBe("exif-gps");
    await expect(meta).toHaveText("2013/01/24 15:20:39");
    await expect(editor).toHaveCount(0);

    await page.evaluate(() => window.replacePhotoData({ coordinate: null }));
    await expect(mode).toHaveValue("utc");
    await expect(meta).toHaveText("2013/01/24 15:20:39 +00:00");
    const staleMode = await mode.elementHandle();
    await page.evaluate(() => window.replacePhotoData({ capturedAt: null }));
    await expect(meta).toHaveText("-");
    await expect(editor).toHaveCount(0);
    await page.evaluate(() => window.replacePhotoData({ capturedAt: new Date(2013, 0, 24, 15, 20, 39).getTime() }));
    await expect(mode).toHaveValue("utc");
    const revision = await page.evaluate(() => window.photoView().revision);
    await staleMode.evaluate(select => {
      select.value = "local";
      select.dispatchEvent(new Event("change"));
    });
    expect(await page.evaluate(() => window.photoView().revision)).toBe(revision);
    await expect(mode).toHaveValue("utc");
    expect(await row.evaluate((node, original) => node === original, rowHandle)).toBe(true);
  });
});
