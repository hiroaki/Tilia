import { expect, test } from "@playwright/test";
import { mockPhotoExif } from "../helpers/photo-exif.js";

test.beforeEach(async ({ page }) => mockPhotoExif(page));

for (const render of [true, false]) {
  test(`JPEG import restores GPS/inferred viewport and leaves unlocated photos alone (renderer ${render})`, async ({ page }, testInfo) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/tiles/**", route => route.abort());
    await page.goto("/tests/fixtures/application-lifecycle.html");
    await page.waitForFunction(() => window.fixtureReady);
    await page.evaluate(async render => {
      const app = window.lifecycle.create({ plugins: ["tilia-gpx-input", "tilia-jpeg-input", "tilia-file-import",
        ...(render ? ["tilia-gpx-renderer", "tilia-photo-renderer"] : [])] });
      await app.ready;
      await app.use({ id: "jpeg-viewport-observer", setup(context) {
        window.jpegViewport = () => context.map.getViewport();
        window.jpegReset = () => context.map.setView([35.68, 139.76], 13, { animate: false });
        window.jpegLoad = async (url, name = url.split("/").at(-1)) => {
          const blob = await (await fetch(url)).blob();
          return context.inputs.dispatch(new File([blob], name, { type: blob.type }));
        };
      } });
    }, render);
    await page.evaluate(() => window.jpegLoad("/tests/fixtures/sample-track.gpx"));
    await page.evaluate(() => window.jpegLoad("/tests/fixtures/photo-exif.jpg", "IMG_2889.JPG"));
    await expect.poll(() => page.evaluate(() => window.jpegViewport().center)).toMatchObject({ lat: expect.closeTo(34.996781, 5), lng: expect.closeTo(135.819519, 5) });
    await expect.poll(() => page.evaluate(() => window.jpegViewport().zoom)).toBe(19);
    if (render) await expect.poll(() => page.evaluate(() => {
      const app = window.lifecycle.app;
      return app.rendering.getStatus(app.entries.list().at(-1).id).state;
    })).toBe("active");
    await page.screenshot({ path: testInfo.outputPath("gps-auto-pan.png") });

    await page.evaluate(() => window.jpegReset());
    const before = await page.evaluate(() => window.jpegViewport());
    await page.evaluate(() => window.jpegLoad("/tests/fixtures/photo-exif.jpg", "IMG_2892.JPG"));
    expect(await page.evaluate(() => window.jpegViewport())).toEqual(before);
    expect(await page.evaluate(() => window.lifecycle.app.domains.photo.get(window.lifecycle.app.entries.list().at(-1).id).snapshot.derived.inferredLocation)).toBeNull();

    await page.evaluate(() => window.jpegLoad("/tests/fixtures/img-2892-auto-helper.gpx"));
    await page.evaluate(() => window.jpegReset());
    const expected = await page.evaluate(async () => {
      const result = await window.jpegLoad("/tests/fixtures/photo-exif.jpg", "IMG_2892.JPG");
      return window.lifecycle.app.domains.photo.get(result.entry.id).snapshot.derived;
    });
    expect(expected.locationSource).toBe("gpx-time-inference");
    await expect.poll(() => page.evaluate(() => window.jpegViewport().center)).toMatchObject({
      lat: expect.closeTo(expected.inferredLocation.lat, 5), lng: expect.closeTo(expected.inferredLocation.lon, 5),
    });
    await expect.poll(() => page.evaluate(() => window.jpegViewport().zoom)).toBe(19);
    await page.screenshot({ path: testInfo.outputPath("inferred-auto-pan.png") });
    expect(errors).toEqual([]);
    await page.evaluate(() => window.lifecycle.app.destroy());
  });
}
