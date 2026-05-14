import { createPanel, createSelect, installMapControl } from "../../map/controls.js";

function formatProviderLabel(provider) {
  if (!provider) {
    return "Other";
  }

  if (provider === "osm") {
    return "OpenStreetMap";
  }

  return provider
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.toUpperCase())
    .join(" ");
}

function appendOption(container, definition, currentDefinition) {
  const optionNode = document.createElement("option");
  optionNode.value = definition.id;
  optionNode.textContent = definition.label;
  optionNode.selected = currentDefinition?.id === definition.id;
  container.appendChild(optionNode);
}

function appendPlaceholderOption(container, { value, label }) {
  const optionNode = document.createElement("option");
  optionNode.value = value;
  optionNode.textContent = label;
  optionNode.selected = true;
  optionNode.disabled = true;
  container.appendChild(optionNode);
}

function groupDefinitionsByProvider(definitions) {
  const groups = [];
  const groupIndexByProvider = new Map();

  for (const definition of definitions) {
    const provider = definition.provider || "other";
    const existingGroupIndex = groupIndexByProvider.get(provider);
    if (existingGroupIndex !== undefined) {
      groups[existingGroupIndex].definitions.push(definition);
      continue;
    }

    groupIndexByProvider.set(provider, groups.length);
    groups.push({
      provider,
      definitions: [definition],
    });
  }

  return groups;
}

export function installBaseMapControl({ map, baseMaps, onStatus = null, position = "topright" }) {
  let selectNode = null;

  function hasSelectableAlternative(currentDefinition, options) {
    if (!currentDefinition) {
      return options.length > 0;
    }

    const currentVisible = options.some((definition) => definition.id === currentDefinition.id);
    if (!currentVisible) {
      return options.length > 0;
    }

    return options.some((definition) => definition.id !== currentDefinition.id);
  }

  function render() {
    if (!selectNode) {
      return;
    }

    const currentDefinition = baseMaps.getCurrent();
    const options = baseMaps.listVisible();
    const currentVisible = currentDefinition
      ? options.some((definition) => definition.id === currentDefinition.id)
      : false;
    selectNode.replaceChildren();

    if (!currentVisible) {
      appendPlaceholderOption(selectNode, currentDefinition
        ? {
          value: `__current__:${currentDefinition.id}`,
          label: `${currentDefinition.label} (current)`,
        }
        : {
          value: "__placeholder__",
          label: "Select a base map",
        });
    }

    for (const group of groupDefinitionsByProvider(options)) {
      if (group.definitions.length === 1) {
        appendOption(selectNode, group.definitions[0], currentDefinition);
        continue;
      }

      const optGroupNode = document.createElement("optgroup");
      optGroupNode.label = formatProviderLabel(group.provider);
      for (const definition of group.definitions) {
        appendOption(optGroupNode, definition, currentDefinition);
      }
      selectNode.appendChild(optGroupNode);
    }

    selectNode.disabled = !hasSelectableAlternative(currentDefinition, options);
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