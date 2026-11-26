import { gpxDomainKey } from "../../domains/keys.js";
import { createOwnedPanelOpener } from "../../ui/panel-mount.js";
import { panelServiceKey } from "../contracts/panel.js";
import { listen, node, reportError } from "../../ui/scoped-dom.js";
import { registerLauncher } from "../../ui/toolbar-launcher.js";

function mountGpxMode(container, scope, gpx, report) {
  const label = node(container, "label", "tilia-settings-field");
  node(label, "span", "tilia-settings-label", "GPX track display");
  const select = node(label, "select", "tilia-gpx-presentation-mode");
  node(select, "option", "", "Track mode").value = "track";
  node(select, "option", "", "Segment mode").value = "segment";
  node(container, "p", "tilia-settings-panel-text",
    "Track mode includes estimated connections between segments. Segment mode shows only recorded sections.");

  select.value = gpx.getPresentationMode();
  const subscription = gpx.subscribePresentationMode(scope.guard(mode => { select.value = mode; }));
  scope.defer(() => subscription.unsubscribe(), { retry: "safe" });
  listen(scope, select, "change", async () => {
    if (select.disabled) return;
    select.disabled = true;
    try {
      await gpx.setPresentationMode(select.value);
    } finally {
      if (scope.alive) {
        select.value = gpx.getPresentationMode();
        select.disabled = false;
      }
    }
  }, report);
}

export default Object.freeze({
  id: "tilia-settings", requires: ["tilia-panel", "tilia-toolbar"],
  setup(context, options = {}) {
    context.styles.use({ id: "tilia-settings-ui", href: new URL("./settings.css", import.meta.url).href });
    const panel = context.services.require(panelServiceKey);
    const report = error => reportError(context, error);
    const openPanel = createOwnedPanelOpener(context.scope, panel, report);
    registerLauncher(context, options, {
      kind: "action", label: "Settings", iconText: "S", className: "tilia-settings-control",
      activate() {
        if (panel.isOpen("settings")) return panel.close("settings");
        openPanel({ id: "settings", title: "Settings", layout: "side", mount({ container, scope }) {
          container.classList.add("tilia-settings-panel-content");
          let fields;
          const availability = context.domains.subscribe(gpxDomainKey, scope.guard(() => {
            void fields?.dispose().catch(report);
            container.replaceChildren();
            const gpx = context.domains.optional(gpxDomainKey);
            if (gpx) {
              fields = scope.child({ label: "gpx-mode-setting" });
              mountGpxMode(container, fields, gpx, report);
            } else {
              node(container, "p", "tilia-settings-panel-text", "No application settings available.");
            }
          }));
          scope.defer(() => availability.unsubscribe(), { retry: "safe" });
        } });
      },
    });
  },
});
