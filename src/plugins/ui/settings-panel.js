import { createButton, createPanel, installMapControl } from "../../map/controls.js";

function createTimeModeField({ core, onStatus }) {
  const label = document.createElement("label");
  label.className = "tilia-time-mode-wrap";

  const caption = document.createElement("span");
  caption.className = "tilia-time-mode-label";
  caption.textContent = "Default photo time";

  const selectNode = document.createElement("select");
  selectNode.className = "tilia-control-select tilia-default-time-mode-select";

  for (const option of [
    { value: "local", label: "Local" },
    { value: "jst", label: "JST" },
    { value: "utc", label: "UTC" },
  ]) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    node.selected = core.getDefaultPhotoTimeMode() === option.value;
    selectNode.appendChild(node);
  }

  selectNode.addEventListener("change", () => {
    core.setDefaultPhotoTimeMode(selectNode.value);
    onStatus(`Default photo time mode set to ${selectNode.value.toUpperCase()}`);
  });

  label.appendChild(caption);
  label.appendChild(selectNode);

  return {
    element: label,
  };
}

export function installSettingsPanelControl({ map, core, panel, onStatus, position = "topleft" }) {
  return installMapControl({
    map,
    position,
    className: "tilia-settings-control",
    createContent() {
      const wrap = createPanel("tilia-control-panel-compact");
      const button = createButton("S", "tilia-control-button-icon");
      button.title = "Settings";
      button.setAttribute("aria-label", "Settings");
      button.addEventListener("click", () => {
        panel.togglePanel({
          panelId: "settings",
          title: "Settings",
          render() {
            const content = document.createElement("div");
            content.className = "tilia-settings-panel-content";

            const intro = document.createElement("p");
            intro.className = "tilia-settings-panel-text";
            intro.textContent = "Configure defaults used for newly added photos.";

            const timeModeField = createTimeModeField({ core, onStatus });

            content.appendChild(intro);
            content.appendChild(timeModeField.element);
            return content;
          },
        });
      });
      wrap.appendChild(button);
      return wrap;
    },
  });
}