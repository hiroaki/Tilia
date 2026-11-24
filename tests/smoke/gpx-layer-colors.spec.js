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
