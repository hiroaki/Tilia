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

async function startDraftEditing(page, name = "sample-track.gpx", fixture) {
  await loadGpx(page, name, fixture);
  await page.getByRole("button", { name: "Track editor" }).click();
  await page.getByRole("button", { name: "Start Edit" }).click();
  await page.locator(".leaflet-overlay-pane path").click();
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).not.toHaveCount(0);
}

test("editor sample loads the track editor control", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await expect(page.getByRole("button", { name: "Track editor" })).toBeVisible();
});

test("editor displays draft segments immediately when editing starts", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await loadGpx(page, "sample-track.gpx");

  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  await page.getByRole("button", { name: "Track editor" }).click();
  await page.getByRole("button", { name: "Start Edit" }).click();
  await expect(page.locator(".tilia-track-editor-panel")).toHaveClass(/tilia-track-editor-is-editing/);
  await page.locator(".leaflet-overlay-pane path").click();
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).not.toHaveCount(0);

  const form = page.locator(".tilia-track-editor-form");
  await form.locator("input").first().fill("35.700000");
  await form.locator("input").first().blur();
  await page.getByRole("button", { name: "Save Copy" }).click();
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(0);
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);
  await expect(page.locator(".tilia-track-editor-panel")).not.toHaveClass(/tilia-track-editor-is-editing/);
});

test("editor can start again after cancel without retaining draft layers", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await loadGpx(page, "sample-track.gpx");
  await page.getByRole("button", { name: "Track editor" }).click();

  await page.getByRole("button", { name: "Start Edit" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);

  await page.getByRole("button", { name: "Start Edit" }).click();
  await page.locator(".leaflet-overlay-pane path").click();
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).not.toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
});

test("point marker click selects it, midpoint click does not, and map background clears selection", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await startDraftEditing(page);

  const formLatitude = page.locator(".tilia-track-editor-form input").first();
  const pointMarkers = page.locator(".leaflet-partially-editable-polyline-point");
  const newPointMarkers = page.locator(".leaflet-partially-editable-polyline-new-point");
  const markerCount = await pointMarkers.count();
  await pointMarkers.first().dispatchEvent("click");
  const selectionRings = page.locator(".tilia-track-editor-selection-ring");
  await expect(selectionRings).toHaveCount(1);
  await expect(selectionRings).toHaveCSS("pointer-events", "none");
  const clickedLatitude = await formLatitude.inputValue();
  await expect(pointMarkers).toHaveCount(markerCount);
  await newPointMarkers.first().dispatchEvent("click");
  await expect(pointMarkers).toHaveCount(markerCount);
  await expect(formLatitude).toHaveValue(clickedLatitude);

  await pointMarkers.last().dispatchEvent("click");
  await expect(formLatitude).not.toHaveValue(clickedLatitude);

  await page.locator("#map").dispatchEvent("click");
  await expect(pointMarkers).toHaveCount(0);
  await expect(selectionRings).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-form input")).toHaveCount(0);
});

test("editor marker drags preserve selection and update the form only for the selected point", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await startDraftEditing(page);

  const pointMarkers = page.locator(".leaflet-partially-editable-polyline-point");
  await pointMarkers.first().dispatchEvent("click");
  const selectionRing = page.locator(".tilia-track-editor-selection-ring");
  await expect(selectionRing).toHaveCount(1);
  const initialRingBox = await selectionRing.boundingBox();
  expect(initialRingBox).not.toBeNull();
  const formLatitude = page.locator(".tilia-track-editor-form input").first();
  const selectedLatitude = await formLatitude.inputValue();
  const unselectedMarker = pointMarkers.last();
  let box = await unselectedMarker.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width / 2) + 20, box.y + (box.height / 2) - 20, { steps: 4 });
  await page.mouse.up();
  await expect(formLatitude).toHaveValue(selectedLatitude);
  expect(await selectionRing.boundingBox()).toEqual(initialRingBox);

  const selectedMarker = pointMarkers.first();
  box = await selectedMarker.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width / 2) + 20, box.y + (box.height / 2) - 20, { steps: 4 });
  await page.mouse.up();
  await expect(formLatitude).not.toHaveValue(selectedLatitude);
  await expect(selectionRing).toHaveCount(1);
  const movedRingBox = await selectionRing.boundingBox();
  expect(movedRingBox).not.toBeNull();
  expect(Math.abs(movedRingBox.x - initialRingBox.x)).toBeGreaterThan(5);
  expect(Math.abs(movedRingBox.y - initialRingBox.y)).toBeGreaterThan(5);
  await expect(pointMarkers).not.toHaveCount(0);
});

test("insert, undo, and redo preserve the existing selection", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await startDraftEditing(page);

  const pointMarkers = page.locator(".leaflet-partially-editable-polyline-point");
  await pointMarkers.first().dispatchEvent("click");
  const selectionRing = page.locator(".tilia-track-editor-selection-ring");
  await expect(selectionRing).toHaveCount(1);
  const formLatitude = page.locator(".tilia-track-editor-form input").first();
  const selectedLatitude = await formLatitude.inputValue();
  const insertionMarker = page.locator(".leaflet-partially-editable-polyline-new-point").first();
  const box = await insertionMarker.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width / 2) + 15, box.y + (box.height / 2) - 15, { steps: 4 });
  await page.mouse.up();

  const formInputs = page.locator(".tilia-track-editor-form input");
  await expect(formInputs).toHaveCount(4);
  await expect(formLatitude).toHaveValue(selectedLatitude);
  await expect(pointMarkers).toHaveCount(4);
  await expect(selectionRing).toHaveCount(1);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(formInputs).toHaveCount(4);
  await expect(formLatitude).toHaveValue(selectedLatitude);
  await expect(pointMarkers).toHaveCount(3);
  await expect(selectionRing).toHaveCount(1);

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(formInputs).toHaveCount(4);
  await expect(formLatitude).toHaveValue(selectedLatitude);
  await expect(pointMarkers).toHaveCount(4);
  await expect(selectionRing).toHaveCount(1);
});

test("deleting selected and unselected points only removes deleted IDs from selection", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await startDraftEditing(page);

  const pointMarkers = page.locator(".leaflet-partially-editable-polyline-point");
  const formLatitude = page.locator(".tilia-track-editor-form input").first();
  await pointMarkers.last().dispatchEvent("click");
  const selectionRing = page.locator(".tilia-track-editor-selection-ring");
  await expect(selectionRing).toHaveCount(1);
  const selectedLatitude = await formLatitude.inputValue();

  await pointMarkers.first().dispatchEvent("contextmenu");
  await expect(pointMarkers).toHaveCount(2);
  await expect(formLatitude).toHaveValue(selectedLatitude);
  await expect(selectionRing).toHaveCount(1);

  await pointMarkers.last().dispatchEvent("contextmenu");
  await expect(pointMarkers).toHaveCount(1);
  await expect(page.locator(".tilia-track-editor-form input")).toHaveCount(0);
  await expect(selectionRing).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-point-meta")).toHaveText("No editable point selected");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(pointMarkers).toHaveCount(2);
  await expect(page.locator(".tilia-track-editor-form input")).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-point-meta")).toHaveText("No editable point selected");
  await expect(selectionRing).toHaveCount(0);
});

test("editor point deletion retains local editing until the final structure is removed", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await startDraftEditing(page);

  const pointMarkers = page.locator(".leaflet-partially-editable-polyline-point");
  await expect(pointMarkers).toHaveCount(3);
  await pointMarkers.first().dispatchEvent("contextmenu");
  await expect(pointMarkers).toHaveCount(2);
  await pointMarkers.first().dispatchEvent("contextmenu");
  await expect(pointMarkers).toHaveCount(1);
  await pointMarkers.first().dispatchEvent("contextmenu");
  await expect(pointMarkers).toHaveCount(0);
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(0);
});

test("clicking a normal track selects its GPX source without starting a session", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await loadGpx(page, "first.gpx");
  await loadGpx(page, "second.gpx");
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);

  await page.getByRole("button", { name: "Track editor" }).click();
  const sourceSelect = page.locator(".tilia-track-editor-select");
  await expect(sourceSelect).toHaveValue("1");
  await page.locator(".leaflet-overlay-pane path").nth(1).click();

  await expect(sourceSelect).toHaveValue("2");
  await expect(page.locator(".tilia-track-editor-panel")).not.toHaveClass(/tilia-track-editor-is-editing/);
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start Edit" })).toBeEnabled();
});

test("displays multiple draft tracks and transfers local editing between segments", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await loadGpx(page, "multi.gpx", "/tests/fixtures/multi-track-elevation.gpx");
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);

  await page.getByRole("button", { name: "Track editor" }).click();
  await page.getByRole("button", { name: "Start Edit" }).click();
  const paths = page.locator(".leaflet-overlay-pane path");
  await expect(paths).toHaveCount(3);
  await paths.first().click();
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).not.toHaveCount(0);
  const firstSelectionLatitude = await page.locator(".tilia-track-editor-form input").first().inputValue();
  const firstMarkerCount = await page.locator(".leaflet-partially-editable-polyline-point").count();
  await paths.nth(2).click();
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).toHaveCount(firstMarkerCount);
  await expect(page.locator(".tilia-track-editor-form input").first()).not.toHaveValue(firstSelectionLatitude);
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(1);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(0);
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);
});
