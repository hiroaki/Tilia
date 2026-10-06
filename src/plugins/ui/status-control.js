import { createMapControl, createPanel } from "../../map/controls.js";
import { statusServiceKey } from "../contracts/status.js";

export function createStatusControl({ position = "bottomleft", priority = "normal", edgePolicy = null }) {
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
      dismissButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        dismissed = true;
        panel.classList.add("tilia-status-panel-dismissed");
      });

      statusNode = document.createElement("div");
      statusNode.className = "tilia-status-text";
      statusNode.textContent = "Ready";
      panel.appendChild(dismissButton);
      panel.appendChild(statusNode);
      return panel;
    },
  });

  return {
    control,
    destroy() {
      control.remove();
    },
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

export function installStatusControl({ map, ...options }) {
  const api = createStatusControl(options);
  api.control.addTo(map);
  return api;
}

const statusPlugin = {
  id: "tilia-status",
  setup(context, options = {}) {
    const api = createStatusControl(options);
    context.map.mountControl(api.control);
    context.services.provide(statusServiceKey, { set: api.setStatus });
  },
};

export default statusPlugin;
