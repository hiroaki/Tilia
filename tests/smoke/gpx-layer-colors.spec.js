import { expect, test } from "@playwright/test";

async function ready(page) {
  await page.goto("/tests/fixtures/phase-4h/");
  await expect(page.locator("body")).toHaveAttribute("data-phase4h-ready", "true");
  await page.evaluate(async () => {
    const p = lon => ({ lat: 35, lon });
    const { app } = window.phase4h;
    window.colorEntry = (await app.domains.gpx.create({
      name: "Colors",
      tracks: [
        { name: "Track A", segments: [{ points: [p(135), p(135.01)] }, { points: [p(135.015)] }] },
        { name: "Track B", segments: [{ points: [p(135.02), p(135.03)] }] },
      ],
      routes: [{ name: "Route A", points: [p(135.04), p(135.05)] }],
      waypoints: [p(135.06)],
    })).id;
  });
  await page.getByRole("button", { name: "Layers", exact: true }).click();
}
const swatches = page => page.locator(".tilia-gpx-swatch");

test("swatches track the GPX preset without replacing the row and survive panel remount", async ({ page }) => {
  await ready(page);
  await expect(swatches(page)).toHaveCount(3);
  await expect(swatches(page).first()).toHaveCSS("background-color", "rgb(0, 153, 204)");
  const initial = await swatches(page).first().elementHandle();
  await page.evaluate(async () => {
    await window.phase4h.app.domains.gpx.setStylePreset(window.colorEntry, "forest", { expectedRevision: 1 });
  });
  await expect(swatches(page).first()).toHaveCSS("background-color", "rgb(42, 157, 143)");
  expect(await swatches(page).first().evaluate((element, old) => element === old, initial)).toBe(true);
  await expect(page.locator('[data-tilia-map-band="geometry"] path[stroke="#2a9d8f"]')).toHaveCount(3);
  await page.getByRole("button", { name: "Track A", exact: true }).click();
  await expect(page.getByRole("button", { name: "Track A", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(swatches(page).first()).toHaveCSS("background-color", "rgb(42, 157, 143)");
});

const picker = (page, name) => page.getByLabel(`Change color of ${name}`, { exact: true });
const changeColor = (locator, color) => locator.evaluate((input, value) => {
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, color);
const geometry = page => page.locator('[data-tilia-map-band="geometry"]');

test("temporary track and route colors repaint owned layers and survive visibility changes", async ({ page }) => {
  await ready(page);
  const track = picker(page, "Track A");
  const route = picker(page, "Route A");
  const identity = () => page.evaluate(() => {
    const { app } = window.phase4h;
    const status = app.rendering.getStatus(window.colorEntry);
    return [status.currentToken, status.semanticRevision, app.selection.getCurrent()];
  });
  await expect(track).toBeVisible();
  const before = await identity();
  await changeColor(track, "#ff3300");
  await changeColor(route, "#3344bb");
  expect(await identity()).toEqual(before);
  const trackLine = geometry(page).locator('path[stroke="#ff3300"]');
  const routeLine = geometry(page).locator('path[stroke="#3344bb"]');
  const singleton = geometry(page).locator('path[fill="#ff3300"][stroke="#fff"]');
  const routeNumbers = page.locator(".tilia-route-point-marker");
  await expect(trackLine).toHaveAttribute("stroke-width", "6");
  await expect(trackLine).toHaveAttribute("stroke-opacity", "0.6");
  await expect(routeLine).toHaveAttribute("stroke-width", "4");
  await expect(routeLine).toHaveAttribute("stroke-dasharray", "8 6");
  await expect(singleton).toHaveCount(1);
  await expect(picker(page, "Track B")).toHaveValue("#0099cc");
  expect(await routeNumbers.evaluateAll(nodes => nodes.map(node => node.style.getPropertyValue("--route-color")))).toEqual(["#3344bb", "#3344bb"]);

  await page.getByRole("checkbox", { name: "Colors show track 1" }).uncheck();
  await expect(trackLine).toHaveCount(0);
  await expect(track).toBeDisabled();
  await page.getByRole("checkbox", { name: "Colors show track 1" }).check();
  await expect(track).toHaveValue("#ff3300");
  const routeCategory = page.getByRole("checkbox", { name: "Colors routes", exact: true });
  await routeCategory.uncheck();
  await expect(routeNumbers).toHaveCount(0);
  await routeCategory.check();
  await expect(route).toHaveValue("#3344bb");
  const entryToggle = page.getByRole("checkbox", { name: /^Show entry / });
  await entryToggle.uncheck();
  await entryToggle.check();
  expect(await routeNumbers.evaluateAll(nodes => nodes.map(node => node.style.getPropertyValue("--route-color")))).toEqual(["#3344bb", "#3344bb"]);

  const old = await track.elementHandle();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await old.evaluate(input => {
    input.value = "#123456";
    input.dispatchEvent(new Event("change"));
  });
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(track).toHaveValue("#ff3300");
  await expect(route).toHaveValue("#3344bb");

  await page.evaluate(() => window.phase4h.app.use("x-track-editor"));
  await page.getByRole("button", { name: "Track editor", exact: true }).click();
  const start = page.getByRole("button", { name: "Start Edit", exact: true });
  await start.click();
  await expect(trackLine).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(trackLine).toHaveCount(1);
  await start.click();
  await page.getByRole("button", { name: "Save Copy", exact: true }).click();
  await expect(geometry(page).locator('path[stroke="#5c6bc0"]')).toHaveCount(2);
  await expect(trackLine).toHaveCount(1);
});

test("a pending picker cannot write to a new generation and overrides reset on external updates", async ({ page }) => {
  await ready(page);
  const track = picker(page, "Track A");
  await expect(track).toBeVisible();
  await changeColor(track, "#ff3300");
  await track.dispatchEvent("click");
  await page.evaluate(async () => {
    const { app } = window.phase4h;
    const { revision, snapshot } = app.domains.gpx.get(window.colorEntry);
    await app.domains.gpx.replaceData(window.colorEntry, { ...snapshot.data, name: "Replaced" }, { expectedRevision: revision });
  });
  await expect(track).toHaveValue("#0099cc");
  await changeColor(track, "#123456");
  await expect(track).toHaveValue("#0099cc");
  await track.dispatchEvent("click");
  await changeColor(track, "#ff3300");
  await expect(track).toHaveValue("#ff3300");
  await page.evaluate(async () => {
    const { app } = window.phase4h;
    await app.domains.gpx.setStylePreset(window.colorEntry, "forest", { expectedRevision: 2 });
  });
  await expect(track).toHaveValue("#2a9d8f");
  await track.dispatchEvent("click");
  await changeColor(track, "#ff3300");
  await expect(track).toHaveValue("#ff3300");
  await page.evaluate(() => window.phase4h.app.unuse("tilia-gpx-renderer"));
  await expect(track).toBeHidden();
  await expect(swatches(page).first()).toBeVisible();
  await expect(swatches(page).first()).toHaveCSS("background-color", "rgb(42, 157, 143)");
  await changeColor(track, "#123456");
  await page.evaluate(() => window.phase4h.app.use("tilia-gpx-renderer"));
  await expect(track).toBeVisible();
  await expect(track).toHaveValue("#2a9d8f");
});
