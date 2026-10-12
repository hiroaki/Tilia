import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const fixture = new URL("../fixtures/application-lifecycle.html", import.meta.url);
function moduleSource(id, requires = [], extra = "") {
  return `window.discoveryEvaluated = [...(window.discoveryEvaluated || []), ${JSON.stringify(id)}];
export default { id: ${JSON.stringify(id)}, requires: ${JSON.stringify(requires)}, setup(context, options) {
 window.discoverySetups = [...(window.discoverySetups || []), {id:${JSON.stringify(id)}, options}];
 context.scope.defer(() => { window.discoveryCleanups = [...(window.discoveryCleanups || []), ${JSON.stringify(id)}]; });
 ${extra}
} };`;
}
async function prepare(page, modules, { prefix = "", embedded = false } = {}) {
  const requested = [], errors = [];
  page.on("request", request => requested.push(new URL(request.url()).pathname));
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/tiles/**", route => route.abort());
  await page.route(`**${prefix}/plugins/**/loader.js`, async route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2);
    await route.fulfill({ status: modules[id] ? 200 : 404, contentType: "text/javascript", body: modules[id] || "Not found" });
  });
  if (prefix) {
    await page.route(`**${prefix}/src/**`, async route => {
      const path = new URL(route.request().url()).pathname.slice(prefix.length + 1);
      await route.fulfill({ contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body: await readFile(new URL(`../../${path}`, import.meta.url)) });
    });
  }
  if (embedded || prefix) {
    const html = (await readFile(fixture, "utf8")).replace('from "/src/index.js"', `from "${prefix}/src/index.js"`).replace('<title>', '<base href="/unrelated/base/"><title>');
    await page.route("**/embedding/deep/page.html", route => route.fulfill({ contentType: "text/html", body: html }));
    await page.goto("/embedding/deep/page.html");
  } else await page.goto("/tests/fixtures/application-lifecycle.html");
  await page.waitForFunction(() => window.fixtureReady);
  return { requested, errors };
}

test("native discovery loads only the complete requested closure and preserves options and cleanup", async ({ page }) => {
  const modules = {
    "company-special-plugin": moduleSource("company-special-plugin", ["vendor-helper", "company-base-plugin"]),
    "vendor-helper": moduleSource("vendor-helper", ["company-base-plugin"]),
    "company-base-plugin": moduleSource("company-base-plugin", ["tilia-gpx-domain"]),
    "x-unused": moduleSource("x-unused"),
  };
  const { requested, errors } = await prepare(page, modules);
  expect(requested.filter(path => path.startsWith("/plugins/"))).toEqual([]);
  const result = await page.evaluate(async () => {
    const app = window.lifecycle.create({ plugins: [["company-special-plugin", { enabled: true }]] });
    await app.ready;
    const installed = app.listPlugins();
    await app.unuse("company-special-plugin"); await app.use("company-special-plugin", { enabled: false });
    await app.destroy();
    return { installed, setups: window.discoverySetups, cleanups: window.discoveryCleanups, evaluated: window.discoveryEvaluated };
  });
  expect(result.installed).toEqual(["tilia-gpx-domain", "company-base-plugin", "vendor-helper", "company-special-plugin"]);
  expect(result.setups.map(item => item.id)).toEqual(["company-base-plugin", "vendor-helper", "company-special-plugin", "company-special-plugin"]);
  expect(result.setups[2].options).toEqual({ enabled: true }); expect(result.setups[3].options).toEqual({ enabled: false });
  expect(result.cleanups).toEqual(["company-special-plugin", "company-special-plugin", "vendor-helper", "company-base-plugin"]);
  expect(result.evaluated).toHaveLength(3);
  expect(requested.filter(path => path.startsWith("/plugins/"))).toHaveLength(3);
  expect(requested.some(path => /photo|exifr|x-track-editor|x-unused/.test(path))).toBe(false);
  expect(errors).toEqual([]);
});

test("fixed sibling layout works under a prefix independently of page and base URL", async ({ page }) => {
  const { requested, errors } = await prepare(page, { "vendor-routing-tool": moduleSource("vendor-routing-tool") }, { prefix: "/apps/tilia", embedded: true });
  const result = await page.evaluate(async () => {
    const app = window.lifecycle.create({ plugins: ["vendor-routing-tool"], pluginOptions: { "vendor-routing-tool": { enabled: true } } });
    await app.ready; await app.destroy(); return window.discoverySetups;
  });
  expect(result[0].options).toEqual({ enabled: true });
  expect(requested.filter(path => path.startsWith("/apps/tilia/plugins/"))).toEqual(["/apps/tilia/plugins/vendor-routing-tool/loader.js"]);
  expect(errors).toEqual([]);
});

test("missing late dependency prevents every setup and has no alternate-directory fallback", async ({ page }) => {
  const { requested } = await prepare(page, {
    "company-root": moduleSource("company-root", ["company-base", "vendor-helper"]),
    "company-base": moduleSource("company-base"), "vendor-helper": moduleSource("vendor-helper", ["vendor-missing"]),
  });
  const result = await page.evaluate(async () => {
    const app = window.lifecycle.create({ plugins: ["company-root"] });
    let failure; try { await app.ready; } catch (error) { failure = { code: error.code, path: error.details.path, cause: error.cause.code }; }
    await app.destroy(); return { failure, setups: window.discoverySetups || [] };
  });
  expect(result.setups).toEqual([]);
  expect(result.failure).toEqual({ code: "PLUGIN_DEPENDENCY_FAILED", path: ["company-root", "vendor-helper", "vendor-missing"], cause: "PLUGIN_RESOLUTION_FAILED" });
  expect(requested.filter(path => path.includes("vendor-missing"))).toEqual(["/plugins/vendor-missing/loader.js"]);
});

test("native cycles and invalid exports fail before setup", async ({ page }) => {
  await prepare(page, {
    "company-cycle": moduleSource("company-cycle", ["vendor-cycle"]), "vendor-cycle": moduleSource("vendor-cycle", ["company-cycle"]),
    "company-invalid": "export const named = {id:'company-invalid', setup(){}};",
    "vendor-mismatch": moduleSource("vendor-other"),
  });
  const result = await page.evaluate(async () => {
    const app = window.lifecycle.create({ plugins: [] }); await app.ready;
    const failures = [];
    for (const id of ["company-cycle", "company-invalid", "vendor-mismatch", "tilia-missing", "../vendor-escape"]) {
      try { await app.use(id); } catch (error) { failures.push(error.code); }
    }
    await app.destroy(); return { failures, setups: window.discoverySetups || [] };
  });
  expect(result.failures).toEqual(["PLUGIN_DEPENDENCY_CYCLE", "PLUGIN_IMPLEMENTATION_INVALID", "PLUGIN_IMPLEMENTATION_INVALID", "PLUGIN_ID_INVALID", "PLUGIN_ID_INVALID"]);
  expect(result.setups).toEqual([]);
});

test("direct definitions and explicit replacement catalogs support nonstandard locations", async ({ page }) => {
  const { requested } = await prepare(page, {});
  const result = await page.evaluate(async () => {
    const direct = { id: "company-direct", setup() {} };
    const app = window.lifecycle.create({ builtins: [{ id: "vendor-explicit", load: () => ({ id: "vendor-explicit", setup() {} }) }], plugins: [[direct, {}], "vendor-explicit"] });
    await app.ready;
    let code; try { await app.use("tilia-status"); } catch (error) { code = error.code; }
    const ids = app.listPlugins(); await app.destroy(); return { ids, code };
  });
  expect(result).toEqual({ ids: ["company-direct", "vendor-explicit"], code: "PLUGIN_ID_INVALID" });
  expect(requested.filter(path => path.startsWith("/plugins/"))).toEqual([]);
});

test("shutdown finishes during native import and late evaluation never invokes setup", async ({ page }) => {
  const { errors } = await prepare(page, {});
  let release, entered;
  const held = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { entered = resolve; });
  await page.route("**/plugins/company-delayed/loader.js", async route => {
    entered(); await held; await route.fulfill({ contentType: "text/javascript", body: moduleSource("company-delayed") });
  });
  await page.evaluate(() => {
    const app = window.lifecycle.create({ plugins: ["company-delayed"] });
    window.delayedReady = app.ready.catch(error => error.code);
  });
  await started;
  const code = await page.evaluate(async () => { await window.lifecycle.app.destroy(); return window.delayedReady; });
  expect(code).toBe("APP_DESTROYED");
  release(); await page.waitForFunction(() => window.discoveryEvaluated?.includes("company-delayed"));
  expect(await page.evaluate(() => window.discoverySetups || [])).toEqual([]); expect(errors).toEqual([]);
});
