import { createPanel, installMapControl } from "../../map/controls.js";

export function installStatusControl({ map, position = "bottomleft" }) {
  let statusNode = null;
  let panelNode = null;
  let dismissed = false;

  installMapControl({
    map,
    position,
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