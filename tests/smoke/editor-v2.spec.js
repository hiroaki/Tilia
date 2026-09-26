import { expect, test } from "@playwright/test";

async function loadGpx(page, name, fixture = "/tests/fixtures/sample-track.gpx") {
  await page.evaluate(async ({ fileName, fixturePath }) => {
    const target = document.querySelector("#map");
    const response = await fetch(fixturePath);
    const blob = await response.blob();
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([blob], fileName, { type: "application/gpx+xml" }));
    target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  }, { fileName: name, fixturePath: fixture });
}

test("editor sample loads the separate v2 track editor control", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await expect(page.getByRole("button", { name: "Track editor v2" })).toBeVisible();
});

test("editor v2 starts a detached session and activates a visible track", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await loadGpx(page, "sample-track.gpx");

  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  await page.getByRole("button", { name: "Track editor v2" }).click();
  await page.getByRole("button", { name: "Start Edit" }).click();
  await expect(page.locator(".tilia-track-editor-v2-panel")).toHaveClass(/tilia-track-editor-v2-is-editing/);
  await page.locator(".leaflet-overlay-pane path").click();
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).toHaveCount(0);
  await page.locator(".leaflet-overlay-pane path").click();
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).not.toHaveCount(0);

  const form = page.locator(".tilia-track-editor-v2-form");
  await form.locator("input").first().fill("35.700000");
  await form.locator("input").first().blur();
  await page.getByRole("button", { name: "Save Copy" }).click();
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);
  await expect(page.locator(".tilia-track-editor-v2-panel")).not.toHaveClass(/tilia-track-editor-v2-is-editing/);
});

test("clicking a normal track selects its GPX source without starting a session", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await loadGpx(page, "first.gpx");
  await loadGpx(page, "second.gpx");
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);

  await page.getByRole("button", { name: "Track editor v2" }).click();
  const sourceSelect = page.locator(".tilia-track-editor-v2-select");
  await expect(sourceSelect).toHaveValue("1");
  await page.locator(".leaflet-overlay-pane path").nth(1).click();

  await expect(sourceSelect).toHaveValue("2");
  await expect(page.locator(".tilia-track-editor-v2-panel")).not.toHaveClass(/tilia-track-editor-v2-is-editing/);
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start Edit" })).toBeEnabled();
});

test("switches active tracks through remaining normal track layers", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await loadGpx(page, "multi.gpx", "/tests/fixtures/multi-track-elevation.gpx");
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);

  await page.getByRole("button", { name: "Track editor v2" }).click();
  await page.getByRole("button", { name: "Start Edit" }).click();
  await page.locator(".leaflet-overlay-pane path").first().click();
  await page.locator(".leaflet-overlay-pane path").nth(1).click();
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).not.toHaveCount(0);

  await page.locator(".leaflet-overlay-pane path").first().click();
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).toHaveCount(0);
});
