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

test("Settings revokes a contribution before disconnecting its DOM", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { listen } = await import("/src/ui/scoped-dom.js");
    const app = window.lifecycle.create({ plugins: ["tilia-settings", "tilia-photo-domain"] });
    await app.ready;
    const source = await app.domains.photo.create({ data: { name: "Source" } });
    const target = await app.domains.photo.create({ data: { name: "Target" } });
    let disconnected = 0;
    customElements.define("test-settings-section", class extends HTMLElement {
      disconnectedCallback() {
        if (this.isConnected) return;
        disconnected++;
        this.firstElementChild.click();
      }
    });
    await app.use({ id: "x-test-settings-section", setup(context) {
      context.contributions.settings.register({ id: "test-section", descriptor: {
        supports: (entry) => entry.id === source.id && entry.visible,
        mount({ container, scope }) {
          const section = document.createElement("test-settings-section");
          const button = document.createElement("button");
          listen(scope, button, "click", () => context.entries.setVisible(target.id, false));
          section.append(button);
          container.append(section);
        },
      } });
    } });
    document.querySelector('button[aria-label="Settings"]').click();
    await app.entries.setVisible(source.id, false);
    await new Promise(resolve => setTimeout(resolve, 0));
    const snapshot = { disconnected, targetVisible: app.entries.get(target.id).visible };
    await app.destroy();
    return snapshot;
  });
  expect(result).toEqual({ disconnected: 1, targetVisible: true });
});
