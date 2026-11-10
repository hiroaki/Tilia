import { expect, test } from "@playwright/test";

for (const path of ["/samples/embed/", "/samples/embed/index.ja.html"]) test(`embed ${path} boots independent maps and loads its sample assets`, async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto(path);

  await expect(page.locator(".story-map.leaflet-container")).toHaveCount(4);
  await expect(page.locator(".story-status").nth(0)).toContainText("Loaded biwakososui.gpx");
  await expect(page.locator(".story-card").nth(2)).toHaveAttribute("data-tilia-gpx-url", "./biwakososui.gpx");

  // Photo cards show the loaded photo's metadata instead of a "Loaded ..." status line.
  const meta = (card, key) => card.locator(`[data-photo-meta="${key}"]`);
  const gpsPhoto = page.locator(".story-card").nth(1);
  await expect(meta(gpsPhoto, "name")).toHaveText("IMG_2889.JPG");
  await expect(meta(gpsPhoto, "locationSource")).toHaveText("exif-gps");
  await expect(meta(gpsPhoto, "coordinate")).toHaveText(/^-?\d+\.\d{5}, -?\d+\.\d{5}$/);

  const inferredPhoto = page.locator(".story-card").nth(2);
  await expect(meta(inferredPhoto, "name")).toHaveText("IMG_2892.JPG");
  await expect(meta(inferredPhoto, "locationSource")).toHaveText("gpx-time-inference");
  expect(pageErrors).toEqual([]);
});

for (const path of ["/samples/embed/", "/samples/embed/index.ja.html"]) {
  const japanese = path.endsWith("index.ja.html");
  test(`route guide ${path} shares selection without popups or map-click navigation`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1000 });
    await page.goto(path);
    const card = page.locator(".story-card-route");
    const map = card.locator(".story-map");
    const buttons = card.locator(".route-list button");
    const markers = card.locator(".tilia-route-point-marker");
    const title = card.locator(".route-detail-title");
    const description = card.locator(".route-detail-description");
    await expect(markers).toHaveCount(8);
    await expect(buttons).toHaveCount(8);
    await expect(card.locator('.route-list button[aria-pressed="true"]')).toHaveCount(0);
    await expect(description).toBeEmpty();
    await expect(card.locator(".route-title")).toHaveText(japanese ? "琵琶湖疏水ルート" : "Lake Biwa Canal Route");
    await card.scrollIntoViewIfNeeded();

    // Every point is inside the map initially; no point is selected by import.
    const bounds = await map.boundingBox();
    for (const marker of await markers.all()) {
      const box = await marker.boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(bounds.y);
      expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
    const pane = card.locator(".leaflet-map-pane");
    const initialTransform = await pane.evaluate(node => node.style.transform);
    await markers.first().click();
    await expect(buttons.first()).toHaveAttribute("aria-pressed", "true");
    await expect(title).toHaveText(japanese ? "大津第一取水口" : "Otsu First Intake");
    await expect(description).toHaveText(japanese ? "琵琶湖から第一疏水へ水を取り入れる琵琶湖疏水の起点" : "Starting point of the Lake Biwa Canal, where water is drawn from Lake Biwa into the First Canal");
    await page.waitForTimeout(350);
    expect(await pane.evaluate(node => node.style.transform)).toBe(initialTransform);
    await expect(card.locator(".leaflet-popup")).toHaveCount(0);

    await buttons.last().click();
    await expect(buttons.last()).toHaveAttribute("aria-pressed", "true");
    await expect(buttons.first()).toHaveAttribute("aria-pressed", "false");
    await expect(title).toHaveText(japanese ? "夷川発電所（夷川ダム）" : "Ebisugawa Power Station (Ebisugawa Dam)");
    await expect.poll(() => pane.evaluate(node => node.style.transform)).not.toBe(initialTransform);
    await expect(card.locator(".leaflet-popup")).toHaveCount(0);

    // The same item still pans after manually moving the map away.
    const mapBox = await map.boundingBox();
    await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(mapBox.x + mapBox.width / 2 + 100, mapBox.y + mapBox.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const draggedTransform = await pane.evaluate(node => node.style.transform);
    await buttons.last().click();
    await expect.poll(() => pane.evaluate(node => node.style.transform)).not.toBe(draggedTransform);
    await expect(buttons.last()).toHaveAttribute("aria-pressed", "true");

    // Empty background clears the external projection, too.
    await map.click({ position: { x: 30, y: mapBox.height - 30 } });
    await expect(card.locator('.route-list button[aria-pressed="true"]')).toHaveCount(0);
    await expect(description).toBeEmpty();

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileMap = await map.boundingBox();
    const sidebar = await card.locator(".route-sidebar").boundingBox();
    expect(sidebar.y).toBeGreaterThan(mobileMap.y + mobileMap.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test(`route guide ${path} reuses a replacement GPX URL and renders description literally`, async ({ page }) => {
    await page.route(`**${path === "/samples/embed/" ? "/samples/embed/" : "/samples/embed/index.ja.html"}`, async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace(/data-tilia-gpx-url="\.\/biwako-sosui-rte(?:\.ja)?\.gpx"/, 'data-tilia-gpx-url="./replacement.gpx"') });
    });
    await page.route("**/replacement.gpx", route => route.fulfill({
      contentType: "application/gpx+xml",
      body: '<gpx version="1.1"><rte><name>Replacement</name><rtept lat="35" lon="135"><name>New place</name><desc>&lt;b&gt;Plain text&lt;/b&gt;\nSecond line</desc></rtept></rte></gpx>',
    }));
    await page.goto(path);
    const card = page.locator(".story-card-route");
    await expect(card.locator(".route-title")).toHaveText("Replacement");
    await expect(card.locator(".route-list button")).toHaveCount(1);
    await card.locator(".route-list button").click();
    await expect(card.locator(".route-detail-title")).toHaveText("New place");
    expect(await card.locator(".route-detail-description").textContent()).toBe("<b>Plain text</b>\nSecond line");
    await expect(card.locator(".route-detail-description b")).toHaveCount(0);
    await expect(card.locator(".leaflet-popup")).toHaveCount(0);
  });
}
