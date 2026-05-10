import { Control, DomEvent, DomUtil } from "leaflet";

export function installMapControl({ map, position = "topleft", className = "", createContent }) {
  class TiliaControl extends Control {
    onAdd() {
      const container = DomUtil.create("div", `tilia-map-control ${className}`.trim());
      DomEvent.disableClickPropagation(container);
      DomEvent.on(container, "dblclick", DomEvent.stopPropagation);
      DomEvent.on(container, "dblclick", DomEvent.preventDefault);
      DomEvent.disableScrollPropagation(container);
      const content = createContent(container);
      if (content instanceof HTMLElement) {
        container.appendChild(content);
      }
      return container;
    }
  }

  const control = new TiliaControl({ position });
  control.addTo(map);
  return control;
}

export function createPanel(className = "") {
  return DomUtil.create("div", `tilia-control-panel ${className}`.trim());
}

export function createButton(label, className = "") {
  const button = DomUtil.create("button", `tilia-control-button ${className}`.trim());
  button.type = "button";
  button.textContent = label;
  return button;
}

export function createSelect(options, className = "") {
  const select = DomUtil.create("select", `tilia-control-select ${className}`.trim());
  for (const option of options) {
    const node = DomUtil.create("option", "", select);
    node.value = option.value;
    node.textContent = option.label;
    if (option.selected) {
      node.selected = true;
    }
  }
  return select;
}