import { expect, test } from "@playwright/test";

test("viewer sample boots and renders the main controls", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/viewer/");

  await expect(page.locator("#map.leaflet-container")).toBeVisible();
  await expect(page.locator(".tilia-base-map-control .tilia-base-map-select")).toBeVisible();
  await expect(page.locator(".tilia-file-import-control .tilia-file-label")).toBeVisible();
  await expect(page.locator(".tilia-status-control")).toBeVisible();
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

  expect(pageErrors).toEqual([]);
});

test("viewer shows distance markers only for the selected track", async ({ page }) => {
  const legacyRequests = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.includes("/plugins/x-milestone/")) {
      legacyRequests.push(request.url());
    }
  });
  await page.route("https://**/*", route => route.abort());
  await page.goto("/samples/viewer/?tilia.c=35,139.75,13");

  await page.locator(".tilia-file-import-control input[type=file]").setInputFiles({
    name: "distance-markers.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(`<gpx version="1.1" creator="Tilia test" xmlns="http://www.topografix.com/GPX/1/1">
      <trk><name>Distance marker track</name><trkseg>
        <trkpt lat="35" lon="139.70"/><trkpt lat="35" lon="139.80"/>
      </trkseg></trk>
    </gpx>`),
  });
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  const track = page.getByRole("button", { name: "Distance marker track", exact: true });
  const markers = page.locator(".x-distance-marker");
  await expect(track).toBeVisible();
  await expect(markers).toHaveCount(0);

  await track.click();
  await expect(markers.first()).toBeVisible();

  await track.click();
  await expect(markers).toHaveCount(0);
  expect(legacyRequests).toEqual([]);
});
