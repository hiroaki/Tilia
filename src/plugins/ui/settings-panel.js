import { semanticErrorCodes } from "../../domains/errors.js";
import { gpxDomainKey } from "../../domains/keys.js";
import { createOwnedPanelOpener } from "../../ui/panel-mount.js";
import { panelServiceKey } from "../contracts/panel.js";
import { listen, node, reportError } from "../../ui/scoped-dom.js";
import { registerLauncher } from "../../ui/toolbar-launcher.js";

let nextGroup = 0;

function mountGpxMode(container, scope, gpx, report) {
  const group = node(container, "fieldset", "tilia-settings-field");
  node(group, "legend", "tilia-settings-label", "GPX track display");
  const name = `tilia-gpx-presentation-mode-${++nextGroup}`;
  const choices = [
    ["track", "Track mode", "Connect segments within each track and include the estimated gaps in its distance."],
    ["segment", "Segment mode", "Show each segment separately and count only the recorded distance."],
  ];
  const inputs = choices.map(([mode, title, description]) => {
    const label = node(group, "label", "tilia-settings-option");
    const input = node(label, "input", "tilia-gpx-presentation-mode");
    input.type = "radio";
    input.name = name;
    input.value = mode;
    const caption = node(label, "span", "tilia-settings-option-title", title);
    caption.id = `${name}-${mode}`;
    const detail = node(label, "span", "tilia-settings-panel-text", description);
    detail.id = `${caption.id}-description`;
    input.setAttribute("aria-labelledby", caption.id);
    input.setAttribute("aria-describedby", detail.id);
    listen(scope, input, "change", () => {
      if (input.checked && !group.disabled) return gpx.setPresentationMode(mode);
    }, report);
    return input;
  });
  const message = node(container, "p", "tilia-settings-mode-status");
  message.setAttribute("role", "status");
  const retry = node(container, "button", "tilia-settings-retry", "Retry");
  retry.type = "button";
  listen(scope, retry, "click", () => {
    const { mode, state } = gpx.getPresentationStatus();
    if (state === "failed") return gpx.setPresentationMode(mode);
  }, report);

  let restoreFocus = false;
  const subscription = gpx.subscribePresentationStatus(scope.guard(({ mode, state }) => {
    const doc = container.ownerDocument;
    const busy = state === "applying";
    const failed = state === "failed";
    if (busy) restoreFocus = inputs.includes(doc.activeElement) || doc.activeElement === retry;
    group.disabled = busy;
    group.setAttribute("aria-busy", String(busy));
    for (const input of inputs) input.checked = input.value === mode;
    retry.hidden = !failed;
    message.textContent = failed ? "The display mode could not be applied to all GPX entries."
      : busy ? "Applying display mode…" : "";
    if (!busy && restoreFocus) {
      if (doc.activeElement === doc.body) inputs.find(input => input.checked)?.focus();
      restoreFocus = false;
    }
  }));
  scope.defer(() => subscription.unsubscribe(), { retry: "safe" });
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
            let supported = false;
            if (gpx) {
              try {
                gpx.getPresentationStatus();
                supported = true;
              } catch (error) {
                if (error.code !== semanticErrorCodes.providerUnavailable) throw error;
              }
            }
            if (supported) {
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
