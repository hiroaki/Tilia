import { DomEvent } from "leaflet";

export function installPanelPlugin({ map }) {
  const mapContainer = map.getContainer();
  const panelRoot = document.createElement("aside");
  panelRoot.className = "tilia-side-panel tilia-side-panel-hidden";
  const layoutClasses = ["tilia-side-panel-layout-side", "tilia-side-panel-layout-bottom"];

  const panelHeader = document.createElement("div");
  panelHeader.className = "tilia-side-panel-header";

  const panelTitle = document.createElement("h2");
  panelTitle.className = "tilia-side-panel-title";
  panelTitle.textContent = "Panel";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "tilia-side-panel-close";
  closeButton.textContent = "Close";

  const panelBody = document.createElement("div");
  panelBody.className = "tilia-side-panel-body";

  panelHeader.appendChild(panelTitle);
  panelHeader.appendChild(closeButton);
  panelRoot.appendChild(panelHeader);
  panelRoot.appendChild(panelBody);
  mapContainer.appendChild(panelRoot);

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