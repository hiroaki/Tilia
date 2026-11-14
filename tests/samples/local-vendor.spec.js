import { expect, test } from "@playwright/test";
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { resolve, extname, sep } from "node:path";
let deployment;
test.beforeAll(() => {
  deployment = mkdtempSync(resolve(tmpdir(), "tilia-deployment-"));
  for (const directory of ["src", "plugins", "samples"]) cpSync(new URL(`../../${directory}`, import.meta.url), resolve(deployment, directory), { recursive: true });
  for (const directory of ["src/map/vendor/leaflet/2.0.0-beta.1", "src/photo/vendor/exifr/7.1.3"]) {
    const manifest = JSON.parse(readFileSync(resolve(deployment, directory, "manifest.json"), "utf8"));
    for (const [file, hash] of Object.entries(manifest.files)) {
      expect(createHash("sha256").update(readFileSync(resolve(deployment, directory, file))).digest("hex"), file).toBe(hash);
    }
  }
});
test.afterAll(() => { if (deployment) rmSync(deployment, { recursive: true, force: true }); });
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".geojson": "application/json", ".gpx": "application/gpx+xml", ".JPG": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };

// Serve a real deployment copy below a path prefix, with external services blocked.
// This exercises native browser resolution without node_modules or CDN rewrites.
for (const path of ["viewer/", "embed/", "embed/index.ja.html", "editor/editor.html", "editor/localhost.html", "editor/chiyoda-ku.html"]) {
  test(`local dependencies boot below a deployment prefix: ${path}`, async ({ page }) => {
    const origin = "http://127.0.0.1:4173", prefix = "/nested/tilia";
    const dependencies = [], failures = [], errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      const dependency = ["script", "stylesheet"].includes(request.resourceType());
      if (dependency) {
        dependencies.push(url.pathname);
        if (url.origin !== origin || !url.pathname.startsWith(`${prefix}/`)) failures.push(url.href);
      }
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith(`${prefix}/`)) return route.abort();
      let file = resolve(deployment, `.${decodeURIComponent(url.pathname.slice(prefix.length))}`);
      if (!file.startsWith(`${deployment}${sep}`)) return route.abort();
      try {
        if (statSync(file).isDirectory()) file = resolve(file, "index.html");
        return route.fulfill({ status: 200, contentType: mime[extname(file)] || "application/octet-stream", body: readFileSync(file) });
      } catch {
        if (dependency) failures.push(`404 ${url.pathname}`);
        return route.fulfill({ status: 404, body: "Missing deployment asset" });
      }
    });
    await page.goto(`${prefix}/samples/${path}`);
    await expect(page.locator(".leaflet-container").first()).toBeVisible();
    if (path.startsWith("embed/")) {
      await expect(page.locator('#inferred-photo-embed [data-photo-meta="name"]')).toHaveText("IMG_2892.JPG");
      expect(dependencies).toContain(`${prefix}/src/photo/vendor/exifr/7.1.3/lite.esm.js`);
    } else if (path.startsWith("editor/")) {
      await expect(page.getByRole("button", { name: "Track editor", exact: true })).toBeVisible();
    } else {
      await expect(page.locator(".tilia-status-control")).toBeVisible();
    }
    expect(await page.evaluate(async () => (await import("leaflet")).version)).toBe("2.0.0-beta.1");
    expect(dependencies).toContain(`${prefix}/src/map/vendor/leaflet/2.0.0-beta.1/leaflet.js`);
    expect(dependencies).toContain(`${prefix}/src/map/vendor/leaflet/2.0.0-beta.1/leaflet.css`);
    expect(failures).toEqual([]);
    expect(errors).toEqual([]);
  });
}
