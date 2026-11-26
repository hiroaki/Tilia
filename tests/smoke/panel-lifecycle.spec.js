import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/tiles/**", route => route.abort());
  await page.goto("/tests/fixtures/application-lifecycle.html");
  await page.waitForFunction(() => window.fixtureReady);
});

test("old Photo time controls are inert during Layers removal, Close, and panel replacement", async ({ page }) => {
  const results = await page.evaluate(async () => {
    const app = window.lifecycle.create({ plugins: ["tilia-layers", "tilia-photo-ui", "tilia-settings"] });
    await app.ready;
    const entry = await app.domains.photo.create({ data: { capturedAt: 0 } });
    const open = (label) => document.querySelector(`button[aria-label="${label}"]`).click();
    const select = () => document.querySelector(".tilia-photo-time-mode-select");
    const change = (element, value) => {
      element.value = value;
      element.dispatchEvent(new Event("change"));
    };
    const revision = () => app.domains.photo.get(entry.id).revision;
    const revisions = [];
    for (const action of ["close", "switch", "unuse"]) {
      open("Layers");
      const old = select();
      if (action === "close") document.querySelector(".tilia-side-panel-close").click();
      else if (action === "switch") open("Settings");
      else {
        const removing = app.unuse("tilia-layers");
        while (app.hasPlugin("tilia-layers")) await Promise.resolve();
        change(old, "utc");
        await removing;
      }
      change(old, "utc");
      await new Promise(resolve => setTimeout(resolve, 0));
      revisions.push(revision());
    }
    await app.use("tilia-layers");
    open("Layers");
    change(select(), "utc");
    await new Promise(resolve => setTimeout(resolve, 0));
    revisions.push(revision());
    await app.destroy();
    return revisions;
  });
  expect(results).toEqual([1, 1, 1, 2]);
});

test("detached Settings controls cannot change the current GPX mode", async ({ page }) => {
  await page.evaluate(async () => {
    await window.lifecycle.create({ plugins: ["tilia-settings", "tilia-gpx-domain"] }).ready;
  });
  const launcher = page.getByRole("button", { name: "Settings", exact: true });
  const field = page.getByRole("combobox", { name: "GPX track display" });
  await launcher.click();
  await expect(field).toHaveValue("track");
  const old = await field.elementHandle();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await launcher.click();
  await expect(field).toHaveValue("track");
  await old.evaluate(select => {
    select.value = "segment";
    select.dispatchEvent(new Event("change"));
    return new Promise(resolve => setTimeout(resolve, 0));
  });
  expect(await page.evaluate(() => window.lifecycle.app.domains.gpx.getPresentationMode())).toBe("track");
  await page.evaluate(() => window.lifecycle.app.domains.gpx.setPresentationMode("segment"));
  await expect(field).toHaveValue("segment");
  await page.evaluate(() => window.lifecycle.app.destroy());
});
