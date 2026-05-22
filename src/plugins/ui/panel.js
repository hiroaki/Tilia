import { DomEvent } from "leaflet";
import { TILIA_CONTROL_PRIORITY, TILIA_UI_LAYER } from "../../ui/protocol.js";

export function installPanelPlugin({ map, surfaces = null }) {
  const mapContainer = map.getContainer();
  const ownerDocument = mapContainer.ownerDocument;
  const panelRoot = ownerDocument.createElement("aside");
  panelRoot.className = "tilia-side-panel tilia-side-panel-hidden";
  const layoutClasses = ["tilia-side-panel-layout-side", "tilia-side-panel-layout-bottom"];

  const panelHeader = ownerDocument.createElement("div");
  panelHeader.className = "tilia-side-panel-header";

  const panelTitle = ownerDocument.createElement("h2");
  panelTitle.className = "tilia-side-panel-title";
  panelTitle.textContent = "Panel";

  const closeButton = ownerDocument.createElement("button");
  closeButton.type = "button";
  closeButton.className = "tilia-side-panel-close";
  closeButton.textContent = "Close";

  const panelBody = ownerDocument.createElement("div");
  panelBody.className = "tilia-side-panel-body";

  panelHeader.appendChild(panelTitle);
  panelHeader.appendChild(closeButton);
  panelRoot.appendChild(panelHeader);
  panelRoot.appendChild(panelBody);
  const mountedSurface = surfaces?.mount({
    id: "tilia-panel-root",
    surface: TILIA_UI_LAYER.panel,
    element: panelRoot,
    priority: TILIA_CONTROL_PRIORITY.normal,
  });
  if (!mountedSurface) {
    mapContainer.appendChild(panelRoot);
  }

  for (const eventName of ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
    panelRoot.addEventListener(eventName, (event) => {
      event.stopPropagation();
    });
  }
  panelRoot.addEventListener("dblclick", (event) => {
    event.preventDefault();
  });
  DomEvent.disableScrollPropagation(panelRoot);

  let activePanelId = null;
  let activeSpec = null;

  function closePanel() {
    activePanelId = null;
    activeSpec = null;
    panelRoot.classList.add("tilia-side-panel-hidden");
    panelRoot.classList.remove(...layoutClasses);
    panelRoot.classList.add("tilia-side-panel-layout-side");
    surfaces?.setPanelState({ active: false });
    panelBody.innerHTML = "";
  }

  function openPanel({ panelId, title, render, layout = "side" }) {
    activeSpec = { panelId, title, render, layout };
    activePanelId = panelId;
    panelTitle.textContent = title;
    panelRoot.classList.remove(...layoutClasses);
    panelRoot.classList.add(layout === "bottom" ? "tilia-side-panel-layout-bottom" : "tilia-side-panel-layout-side");
    panelBody.innerHTML = "";
    const content = render();
    if (content instanceof HTMLElement) {
      panelBody.appendChild(content);
    }
    panelRoot.classList.remove("tilia-side-panel-hidden");
    surfaces?.setPanelState({
      active: true,
      layout,
      element: panelRoot,
    });
  }

  function rerenderPanel(panelId) {
    if (!activeSpec) {
      return;
    }
    if (panelId && activePanelId !== panelId) {
      return;
    }
    openPanel(activeSpec);
  }

  closeButton.addEventListener("click", closePanel);

  panelRoot.classList.add("tilia-side-panel-layout-side");

  return {
    openPanel,
    closePanel,
    rerenderPanel,
    destroy() {
      surfaces?.setPanelState({ active: false });
      mountedSurface?.unmount?.();
      panelRoot.remove?.();
    },
    togglePanel(spec) {
      if (activePanelId === spec.panelId) {
        closePanel();
      } else {
        openPanel(spec);
      }
    },
    isOpen(panelId) {
      return activePanelId === panelId;
    },
  };
}