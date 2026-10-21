import { listen, reportError } from "../../ui/scoped-dom.js";
import { createMapControl, createPanel } from "../../map/controls.js";
import { statusServiceKey } from "../contracts/status.js";

export function createStatusControl({ position = "bottomleft", priority = "normal", edgePolicy = null, scope, report }) {
  let statusNode = null;
  let panelNode = null;
  let dismissed = false;

  const control = createMapControl({
    position,
    priority,
    edgePolicy,
    className: "tilia-status-control",
    createContent() {
      const panel = createPanel("tilia-status-panel");
      panelNode = panel;

      const dismissButton = document.createElement("button");
      dismissButton.type = "button";
      dismissButton.className = "tilia-status-dismiss";
      dismissButton.textContent = "x";
      dismissButton.title = "Dismiss status";
      dismissButton.setAttribute("aria-label", "Dismiss status");
      listen(scope, dismissButton, "click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        dismissed = true;
        panel.classList.add("tilia-status-panel-dismissed");
      }, report);

      statusNode = document.createElement("div");
      statusNode.className = "tilia-status-text";
      statusNode.textContent = "Ready";
      statusNode.setAttribute("role", "status"); statusNode.setAttribute("aria-live", "polite");
      panel.appendChild(dismissButton);
      panel.appendChild(statusNode);
      return panel;
    },
  });

  return {
    control,
    setStatus(text) {
      if (statusNode) {
        statusNode.textContent = text;
      }
      if (panelNode && dismissed) {
        dismissed = false;
        panelNode.classList.remove("tilia-status-panel-dismissed");
      }
    },
  };
}

const statusPlugin = {
  id: "tilia-status",
  setup(context, options = {}) {
    context.styles.use({ id: "tilia-status-ui", href: new URL("./status.css", import.meta.url).href });
    const api = createStatusControl({ ...options, scope: context.scope, report: (e) => reportError(context, e) });
    context.map.mountControl(api.control);
    context.services.provide(statusServiceKey, { set: api.setStatus });
  },
};

export default statusPlugin;
