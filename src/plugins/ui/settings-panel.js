import { createButton, createPanel, createSelect, installMapControl } from "../../map/controls.js";
import {
  buildFixedOffsetTimeMode,
  formatPhotoTimeModeLabel,
  isPresetPhotoTimeMode,
  splitFixedOffsetTimeMode,
} from "../../core/photo-time-utils.js";

function createTimeModeField({ core, onStatus, onError = null }) {
  const label = document.createElement("label");
  label.className = "tilia-time-mode-wrap";

  const caption = document.createElement("span");
  caption.className = "tilia-time-mode-label";
  caption.textContent = "Default photo time";

  const selectNode = document.createElement("select");
  selectNode.className = "tilia-control-select tilia-default-time-mode-select";

  for (const option of [
    { value: "auto", label: "Auto" },
    { value: "local", label: "Local" },
    { value: "utc", label: "UTC" },
    { value: "custom", label: "Custom offset" },
  ]) {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    node.selected = core.getDefaultPhotoTimeMode() === option.value;
    selectNode.appendChild(node);
  }

  const offsetWrap = document.createElement("div");
  offsetWrap.className = "tilia-default-time-mode-custom";

  const signSelect = createSelect([
    { value: "+", label: "+" },
    { value: "-", label: "-" },
  ], "tilia-default-time-mode-sign");
  signSelect.setAttribute("aria-label", "Default photo time offset sign");

  const offsetInput = document.createElement("input");
  offsetInput.type = "time";
  offsetInput.step = "900";
  offsetInput.className = "tilia-control-select tilia-default-time-mode-offset";
  offsetInput.setAttribute("aria-label", "Default photo time offset");

  const currentMode = core.getDefaultPhotoTimeMode();
  const currentOffset = splitFixedOffsetTimeMode(currentMode);
  if (isPresetPhotoTimeMode(currentMode) || !currentOffset) {
    selectNode.value = currentMode;
    signSelect.value = "+";
    offsetInput.value = "00:00";
    offsetWrap.hidden = true;
    signSelect.disabled = true;
    offsetInput.disabled = true;
  } else {
    selectNode.value = "custom";
    signSelect.value = currentOffset.sign;
    offsetInput.value = currentOffset.time;
    offsetWrap.hidden = false;
    signSelect.disabled = false;
    offsetInput.disabled = false;
  }

  offsetWrap.appendChild(signSelect);
  offsetWrap.appendChild(offsetInput);

  function applyMode(mode) {
    core.setDefaultPhotoTimeMode(mode);
    onStatus(`Default photo time mode set to ${formatPhotoTimeModeLabel(mode)}`);
  }

  function applyCustomOffset() {
    try {
      const normalizedMode = buildFixedOffsetTimeMode(signSelect.value, offsetInput.value || "00:00");
      offsetInput.value = normalizedMode.slice(1);
      signSelect.value = normalizedMode.startsWith("-") ? "-" : "+";
      applyMode(normalizedMode);
    } catch (error) {
      onError?.(error);
      onStatus(`Failed to update default photo time mode: ${error.message}`);
      offsetInput.focus();
    }
  }

  selectNode.addEventListener("change", () => {
    const isCustom = selectNode.value === "custom";
    offsetWrap.hidden = !isCustom;
    signSelect.disabled = !isCustom;
    offsetInput.disabled = !isCustom;
    if (isCustom) {
      offsetInput.value ||= "00:00";
      offsetInput.focus();
      return;
    }
    applyMode(selectNode.value);
  });

  signSelect.addEventListener("change", () => {
    if (selectNode.value === "custom") {
      applyCustomOffset();
    }
  });
  offsetInput.addEventListener("change", () => {
    if (selectNode.value === "custom") {
      applyCustomOffset();
    }
  });
  offsetInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && selectNode.value === "custom") {
      event.preventDefault();
      applyCustomOffset();
    }
  });

  label.appendChild(caption);
  label.appendChild(selectNode);
  label.appendChild(offsetWrap);

  return {
    element: label,
  };
}

export function installSettingsPanelControl({ map, core, panel, onStatus, onError = null, position = "topleft" }) {
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

            const timeModeField = createTimeModeField({ core, onStatus, onError });

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