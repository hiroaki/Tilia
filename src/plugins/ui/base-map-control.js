import { createPanel, createSelect, installMapControl } from "../../map/controls.js";

export function installBaseMapControl({ map, baseMaps, onStatus = null, position = "topright" }) {
  let selectNode = null;

  function render() {
    if (!selectNode) {
      return;
    }

    const currentDefinition = baseMaps.getCurrent();
    const options = baseMaps.listVisible();
    selectNode.replaceChildren();

    for (const definition of options) {
      const optionNode = document.createElement("option");
      optionNode.value = definition.id;
      optionNode.textContent = definition.label;
      optionNode.selected = currentDefinition?.id === definition.id;
      selectNode.appendChild(optionNode);
    }

    selectNode.disabled = options.length <= 1;
  }

  const control = installMapControl({
    map,
    position,
    className: "tilia-base-map-control",
    createContent() {
      const wrap = createPanel("tilia-control-panel-compact");
      selectNode = createSelect([], "tilia-base-map-select");
      selectNode.title = "Base map";
      selectNode.setAttribute("aria-label", "Base map");
      selectNode.addEventListener("change", () => {
        const selection = baseMaps.select(selectNode.value);
        onStatus?.(`Base map changed to ${selection.definition.label}`);
      });
      wrap.appendChild(selectNode);
      return wrap;
    },
  });

  return {
    control,
    render,
  };
}