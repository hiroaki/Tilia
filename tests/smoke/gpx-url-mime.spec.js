import { expect, test } from "@playwright/test";

const gpx = '<gpx version="1.1"><rte><name>MIME route</name><rtept lat="35" lon="139"/></rte></gpx>';

for (const contentType of [
  "application/gpx+xml",
  "application/gpx+xml; charset=utf-8",
  "application/gpx+xml; charset=UTF-8",
  "Application/GPX+XML; Charset=UTF-8",
  "text/html",
]) {
  test(`extensionless GPX URL with ${contentType}`, async ({ page }) => {
    await page.route("**/api/gpx/probe-id", (route) => route.fulfill({
      headers: { "content-type": contentType }, body: gpx,
    }));
    await page.goto("/tests/fixtures/phase-4h/");
    await expect(page.locator("body")).toHaveAttribute("data-phase4h-ready", "true");
    await page.evaluate(() => window.phase4h.app.use("tilia-url-import"));
    await page.getByRole("button", { name: "Load URL", exact: true }).click();
    await page.getByRole("textbox", { name: "Remote file URL" }).fill("http://127.0.0.1:4173/api/gpx/probe-id");
    await page.getByRole("button", { name: "Load", exact: true }).click();

    const accepted = contentType !== "text/html";
    await expect(page.locator(".tilia-status-text")).toContainText(
      accepted ? "Loaded 1 file(s) from url." : "Unsupported input: probe-id",
    );
    expect(await page.evaluate(() => window.phase4h.app.entries.list().length)).toBe(accepted ? 1 : 0);
    if (accepted) {
      const routeName = await page.evaluate(() => {
        const app = window.phase4h.app;
        return app.domains.gpx.get(app.entries.list()[0].id).snapshot.data.routes[0].name;
      });
      expect(routeName).toBe("MIME route");
    }
  });
}
