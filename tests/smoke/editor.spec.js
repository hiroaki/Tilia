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
  await expect(page.getByRole("button", { name: /Delete \d+ points?/ })).toHaveCount(0);
  await page.locator(".leaflet-overlay-pane path").click();
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).not.toHaveCount(0);

  await page.getByRole("button", { name: /Edit Lat:/ }).click();
  await page.getByRole("spinbutton", { name: "Lat value" }).fill("35.700000");
  await page.getByRole("spinbutton", { name: "Lat value" }).blur();
  await page.getByRole("button", { name: "Select area" }).click();
  await expect(page.locator(".tilia-track-editor-selection-shield")).toHaveCount(1);
  await page.getByRole("button", { name: "Save Copy" }).click();
  await expect(page.locator(".tilia-track-editor-selection-shield")).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(0);
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);
  await expect(page.locator(".tilia-track-editor-panel")).not.toHaveClass(/tilia-track-editor-is-editing/);
});

test("editor can start again after cancel without retaining draft layers", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await loadGpx(page, "sample-track.gpx");
  await page.getByRole("button", { name: "Track editor" }).click();

  await page.getByRole("button", { name: "Start Edit" }).click();
  await page.locator(".leaflet-overlay-pane path").click();
  await page.getByRole("button", { name: "Select area" }).click();
  await expect(page.locator(".tilia-track-editor-selection-shield")).toHaveCount(1);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".tilia-track-editor-selection-shield")).toHaveCount(0);
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

  const inspectorLatitude = page.locator(".tilia-track-editor-inspector-row .tilia-track-editor-cell").first();
  const pointMarkers = page.locator(".leaflet-partially-editable-polyline-point");
  const newPointMarkers = page.locator(".leaflet-partially-editable-polyline-new-point");
  const markerCount = await pointMarkers.count();
  await pointMarkers.first().dispatchEvent("click");
  const selectionRings = page.locator(".tilia-track-editor-selection-ring");
  await expect(selectionRings).toHaveCount(1);
  await expect(selectionRings).toHaveCSS("pointer-events", "none");
  const clickedLatitude = await inspectorLatitude.textContent();
  await expect(pointMarkers).toHaveCount(markerCount);
  await newPointMarkers.first().dispatchEvent("click");
  await expect(pointMarkers).toHaveCount(markerCount);
  await expect(inspectorLatitude).toHaveText(clickedLatitude);

  await pointMarkers.last().dispatchEvent("click");
  await expect(inspectorLatitude).not.toHaveText(clickedLatitude);

  await page.locator("#map").dispatchEvent("click");
  await expect(pointMarkers).toHaveCount(0);
  await expect(selectionRings).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-inspector-row")).toHaveCount(0);
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
  const inspectorLatitude = page.locator(".tilia-track-editor-inspector-row .tilia-track-editor-cell").first();
  const selectedLatitude = await inspectorLatitude.textContent();
  const unselectedMarker = pointMarkers.last();
  let box = await unselectedMarker.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width / 2) + 20, box.y + (box.height / 2) - 20, { steps: 4 });
  await page.mouse.up();
  await expect(inspectorLatitude).toHaveText(selectedLatitude);
  expect(await selectionRing.boundingBox()).toEqual(initialRingBox);

  const selectedMarker = pointMarkers.first();
  box = await selectedMarker.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width / 2) + 20, box.y + (box.height / 2) - 20, { steps: 4 });
  await page.mouse.up();
  await expect(inspectorLatitude).not.toHaveText(selectedLatitude);
  await expect(selectionRing).toHaveCount(1);
  const movedRingBox = await selectionRing.boundingBox();
  expect(movedRingBox).not.toBeNull();
  expect(Math.abs(movedRingBox.x - initialRingBox.x)).toBeGreaterThan(5);
  expect(Math.abs(movedRingBox.y - initialRingBox.y)).toBeGreaterThan(5);
  await expect(pointMarkers).not.toHaveCount(0);
});

test("point inspector edits one cell with validation, cancellation, focus, and history", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await startDraftEditing(page);

  const row = page.locator(".tilia-track-editor-inspector-row");
  await expect(row).toHaveCount(1);
  const latCell = row.locator(".tilia-track-editor-cell").nth(0);
  const lonCell = row.locator(".tilia-track-editor-cell").nth(1);
  const elevationCell = row.locator(".tilia-track-editor-cell").nth(2);
  const timeCell = row.locator(".tilia-track-editor-cell").nth(3);
  const originalValues = await row.locator(".tilia-track-editor-cell").allTextContents();

  await latCell.click();
  const latInput = page.getByRole("spinbutton", { name: "Lat value" });
  await expect(latInput).toHaveCount(1);
  await expect(page.locator(".tilia-track-editor-cell-input")).toHaveCount(1);
  await expect(page.locator(".tilia-track-editor-selection-ring-focused")).toHaveCount(1);
  await latInput.fill("");
  await latInput.blur();
  await expect(page.getByRole("spinbutton", { name: "Lat value" })).toHaveValue("");
  await expect(page.getByRole("spinbutton", { name: "Lat value" })).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await page.getByRole("spinbutton", { name: "Lat value" }).press("Escape");
  await expect(page.getByRole("spinbutton", { name: "Lat value" })).toHaveCount(0);
  await expect(latCell).toHaveText(originalValues[0]);

  await timeCell.click();
  const timeInput = page.getByLabel("Time value");
  expect(await timeInput.inputValue()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/);
  await timeInput.press("Escape");

  await elevationCell.click();
  await page.getByRole("spinbutton", { name: "Ele value" }).fill("99.9");
  await page.getByRole("spinbutton", { name: "Ele value" }).press("Enter");
  await expect(elevationCell).toHaveText("99.9");
  await expect(latCell).toHaveText(originalValues[0]);
  await expect(lonCell).toHaveText(originalValues[1]);
  await expect(timeCell).toHaveText(originalValues[3]);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(elevationCell).toHaveText(originalValues[2]);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(elevationCell).toHaveText("99.9");

  await lonCell.click();
  await page.getByRole("spinbutton", { name: "Lon value" }).fill("135.123456789");
  await page.getByRole("spinbutton", { name: "Lon value" }).blur();
  await expect(lonCell).toHaveText("135.12346");

  await latCell.click();
  await page.locator(".leaflet-partially-editable-polyline-point").last().dispatchEvent("click");
  await expect(page.locator(".tilia-track-editor-cell-input")).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-inspector-row")).toHaveCount(1);
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(1);
  await expect(page.locator(".tilia-track-editor-selection-ring-focused")).toHaveCount(0);
});

test("insert, undo, and redo preserve the existing selection", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await startDraftEditing(page);

  const pointMarkers = page.locator(".leaflet-partially-editable-polyline-point");
  await pointMarkers.first().dispatchEvent("click");
  const selectionRing = page.locator(".tilia-track-editor-selection-ring");
  await expect(selectionRing).toHaveCount(1);
  const inspectorLatitude = page.locator(".tilia-track-editor-inspector-row .tilia-track-editor-cell").first();
  const selectedLatitude = await inspectorLatitude.textContent();
  const insertionMarker = page.locator(".leaflet-partially-editable-polyline-new-point").first();
  const box = await insertionMarker.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + (box.width / 2), box.y + (box.height / 2));
  await page.mouse.down();
  await page.mouse.move(box.x + (box.width / 2) + 15, box.y + (box.height / 2) - 15, { steps: 4 });
  await page.mouse.up();

  const inspectorRows = page.locator(".tilia-track-editor-inspector-row");
  await expect(inspectorRows).toHaveCount(1);
  await expect(inspectorLatitude).toHaveText(selectedLatitude);
  await expect(pointMarkers).toHaveCount(4);
  await expect(selectionRing).toHaveCount(1);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(inspectorRows).toHaveCount(1);
  await expect(inspectorLatitude).toHaveText(selectedLatitude);
  await expect(pointMarkers).toHaveCount(3);
  await expect(selectionRing).toHaveCount(1);

  await page.getByRole("button", { name: "Redo" }).click();
  await expect(inspectorRows).toHaveCount(1);
  await expect(inspectorLatitude).toHaveText(selectedLatitude);
  await expect(pointMarkers).toHaveCount(4);
  await expect(selectionRing).toHaveCount(1);
});

test("deleting selected and unselected points only removes deleted IDs from selection", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await startDraftEditing(page);

  const pointMarkers = page.locator(".leaflet-partially-editable-polyline-point");
  const inspectorLatitude = page.locator(".tilia-track-editor-inspector-row .tilia-track-editor-cell").first();
  await pointMarkers.last().dispatchEvent("click");
  const selectionRing = page.locator(".tilia-track-editor-selection-ring");
  await expect(selectionRing).toHaveCount(1);
  const selectedLatitude = await inspectorLatitude.textContent();

  await pointMarkers.first().dispatchEvent("contextmenu");
  await expect(pointMarkers).toHaveCount(2);
  await expect(inspectorLatitude).toHaveText(selectedLatitude);
  await expect(selectionRing).toHaveCount(1);

  await pointMarkers.last().dispatchEvent("contextmenu");
  await expect(pointMarkers).toHaveCount(1);
  await expect(page.locator(".tilia-track-editor-inspector-row")).toHaveCount(0);
  await expect(selectionRing).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-point-meta")).toHaveText("No editable point selected");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(pointMarkers).toHaveCount(2);
  await expect(page.locator(".tilia-track-editor-inspector-row")).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-point-meta")).toHaveText("No editable point selected");
  await expect(selectionRing).toHaveCount(0);
});

test("area selection replaces selection with one point and restores normal editing", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await startDraftEditing(page);

  const pointMarkers = page.locator(".leaflet-partially-editable-polyline-point");
  await pointMarkers.last().dispatchEvent("click");
  const firstMarkerBox = await pointMarkers.first().boundingBox();
  expect(firstMarkerBox).not.toBeNull();

  const selectArea = page.getByRole("button", { name: "Select area" });
  await selectArea.click();
  await expect(selectArea).toHaveAttribute("aria-pressed", "true");
  const shield = page.locator(".tilia-track-editor-selection-shield");
  await expect(shield).toHaveCount(1);
  await page.mouse.move(firstMarkerBox.x - 2, firstMarkerBox.y - 2);
  await page.mouse.down();
  await page.mouse.move(firstMarkerBox.x + firstMarkerBox.width + 2, firstMarkerBox.y + firstMarkerBox.height + 2);
  await page.mouse.up();

  await expect(shield).toHaveCount(0);
  await expect(selectArea).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(1);
  await expect(page.locator(".tilia-track-editor-inspector-row")).toHaveCount(1);
  await expect(page.locator(".tilia-track-editor-inspector-row .tilia-track-editor-cell")).toHaveCount(4);

  await page.getByRole("button", { name: "Delete 1 point" }).click();
  await expect(pointMarkers).toHaveCount(2);
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-inspector-row")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(pointMarkers).toHaveCount(3);
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(pointMarkers).toHaveCount(2);

  await pointMarkers.last().dispatchEvent("click");
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(1);
});

test("empty area selection retries, multiple selection succeeds, and Escape cancels", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await startDraftEditing(page);

  const pointMarkers = page.locator(".leaflet-partially-editable-polyline-point");
  await pointMarkers.first().dispatchEvent("click");
  const originalRingBox = await page.locator(".tilia-track-editor-selection-ring").boundingBox();
  expect(originalRingBox).not.toBeNull();
  const markerBoxes = await Promise.all(Array.from(
    { length: await pointMarkers.count() },
    (_, index) => pointMarkers.nth(index).boundingBox(),
  ));
  expect(markerBoxes[0]).not.toBeNull();
  expect(markerBoxes[1]).not.toBeNull();

  const selectArea = page.getByRole("button", { name: "Select area" });
  await selectArea.click();
  const shield = page.locator(".tilia-track-editor-selection-shield");
  const shieldBox = await shield.boundingBox();
  expect(shieldBox).not.toBeNull();
  const markerCenters = markerBoxes.map((box) => ({
    x: box.x + (box.width / 2),
    y: box.y + (box.height / 2),
  }));
  const emptyCenter = await page.evaluate(({ box, centers }) => {
    const candidates = [];
    for (let y = box.y + 30; y < box.y + box.height - 30; y += 30) {
      for (let x = box.x + 30; x < box.x + box.width - 30; x += 30) {
        if (document.elementFromPoint(x, y)?.closest(".tilia-track-editor-selection-shield")) {
          candidates.push({ x, y });
        }
      }
    }
    return candidates.sort((a, b) => Math.min(...centers.map((point) => Math.hypot(point.x - b.x, point.y - b.y)))
      - Math.min(...centers.map((point) => Math.hypot(point.x - a.x, point.y - a.y))))[0];
  }, { box: shieldBox, centers: markerCenters });
  expect(emptyCenter).toBeTruthy();
  await page.mouse.move(emptyCenter.x - 3, emptyCenter.y - 3);
  await page.mouse.down();
  await page.mouse.move(emptyCenter.x + 3, emptyCenter.y + 3);
  await page.mouse.up();

  await expect(shield).toHaveCount(1);
  await expect(selectArea).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator(".tilia-track-editor-selection-ring").boundingBox()).toEqual(originalRingBox);

  const left = Math.min(markerBoxes[0].x, markerBoxes[1].x) - 2;
  const top = Math.min(markerBoxes[0].y, markerBoxes[1].y) - 2;
  const right = Math.max(markerBoxes[0].x + markerBoxes[0].width, markerBoxes[1].x + markerBoxes[1].width) + 2;
  const bottom = Math.max(markerBoxes[0].y + markerBoxes[0].height, markerBoxes[1].y + markerBoxes[1].height) + 2;
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom);
  await page.mouse.up();

  await expect(shield).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(2);
  await expect(page.locator(".tilia-track-editor-point-meta")).toHaveText("2 points selected");
  await expect(page.locator(".tilia-track-editor-inspector-row")).toHaveCount(2);
  await expect(page.locator(".tilia-track-editor-inspector-row .tilia-track-editor-cell")).toHaveCount(8);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();

  await selectArea.click();
  await expect(shield).toHaveCount(1);
  await selectArea.click();
  await expect(shield).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(2);
  await selectArea.click();
  await expect(shield).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(shield).toHaveCount(0);
  await expect(selectArea).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(2);

  await page.getByRole("button", { name: "Delete 2 points" }).click();
  await expect(pointMarkers).toHaveCount(1);
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-point-meta")).toHaveText("No editable point selected");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(pointMarkers).toHaveCount(3);
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(pointMarkers).toHaveCount(1);
});

test("bulk delete removes and Undo restores the final segment and track", async ({ page }) => {
  await page.goto("/samples/editor/localhost.html");
  await startDraftEditing(page);

  const pointMarkers = page.locator(".leaflet-partially-editable-polyline-point");
  const boxes = await Promise.all(Array.from(
    { length: await pointMarkers.count() },
    (_, index) => pointMarkers.nth(index).boundingBox(),
  ));
  const left = Math.min(...boxes.map((box) => box.x)) - 3;
  const top = Math.min(...boxes.map((box) => box.y)) - 3;
  const right = Math.max(...boxes.map((box) => box.x + box.width)) + 3;
  const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + 3;

  await page.getByRole("button", { name: "Select area" }).click();
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom);
  await page.mouse.up();
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(3);
  await page.getByRole("button", { name: "Delete 3 points" }).click();
  await expect(pointMarkers).toHaveCount(0);
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Select area" })).toBeDisabled();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
  await expect(pointMarkers).toHaveCount(0);
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Select area" })).toBeDisabled();
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await page.locator(".leaflet-overlay-pane path").click();
  await expect(pointMarkers).toHaveCount(3);
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
  const inspectorLatitude = page.locator(".tilia-track-editor-inspector-row .tilia-track-editor-cell").first();
  const firstSelectionLatitude = await inspectorLatitude.textContent();
  const firstMarkerCount = await page.locator(".leaflet-partially-editable-polyline-point").count();
  await paths.nth(2).click();
  await expect(page.locator(".leaflet-partially-editable-polyline-point")).toHaveCount(firstMarkerCount);
  await expect(inspectorLatitude).not.toHaveText(firstSelectionLatitude);
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(1);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".tilia-track-editor-selection-ring")).toHaveCount(0);
  await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(2);
});
