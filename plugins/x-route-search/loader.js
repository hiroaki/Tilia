import { DomEvent } from "leaflet";
import { createButton, createPanel, createSelect, installMapControl } from "../../src/map/controls.js";
import { TILIA_CONTROL_PRIORITY, TILIA_UI_LAYER } from "../../src/ui/protocol.js";
import { requestPhloemRoutes } from "./client.js";
import { createImportedRouteSource } from "./helpers.js";

function createEmptyPoint() {
  return { lat: "", lon: "" };
}

function copyPoint(point = null) {
  return {
    lat: point?.lat ?? "",
    lon: point?.lon ?? "",
  };
}

function isCompletePoint(point) {
  return Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lon));
}

function formatCoordinate(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(6) : "";
}

function formatDistance(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return "-";
  }
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(distanceMeters)} m`;
}

function formatDuration(durationSeconds) {
  if (!Number.isFinite(durationSeconds)) {
    return "-";
  }
  const minutes = Math.round(durationSeconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainderMinutes = minutes % 60;
  return remainderMinutes > 0 ? `${hours} h ${remainderMinutes} min` : `${hours} h`;
}

function getOrderedPoints(state) {
  return [state.origin, ...state.viaPoints, state.destination];
}

function validateRoutePoints(state) {
  const ordered = getOrderedPoints(state);
  if (!isCompletePoint(state.origin) || !isCompletePoint(state.destination)) {
    return "Origin and destination both require latitude and longitude.";
  }
  if (ordered.some((point) => !isCompletePoint(point))) {
    return "Every route point must include both latitude and longitude.";
  }
  return null;
}

function stopPanelPropagation(element) {
  for (const eventName of ["click", "dblclick", "mousedown", "mouseup", "pointerdown", "pointerup", "contextmenu"]) {
    DomEvent.on(element, eventName, DomEvent.stopPropagation);
  }
  DomEvent.on(element, "dblclick", DomEvent.preventDefault);
  DomEvent.disableScrollPropagation(element);
}

export const routeSearchPlugin = {
  id: "x-route-search",
  requires: ["tilia-status"],
  stylesheets: [
    new URL("./styles.css", import.meta.url).href,
  ],
  setup(app, options = {}) {
    const map = app.getMap();
    const core = app.core;
    const position = options.position || "topleft";
    const priority = options.priority || "normal";
    const endpoint = options.endpoint || "http://127.0.0.1:3000/route";
    const apiKey = options.apiKey || "";
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 5000;
    const importLimit = Number(options.importLimit) > 0 ? Math.min(3, Number(options.importLimit)) : 3;
    const profileOptions = Array.isArray(options.profileOptions) && options.profileOptions.length > 0
      ? options.profileOptions.map((profile) => String(profile))
      : [String(options.defaultProfile || "car")];

    const state = {
      profile: profileOptions[0],
      origin: createEmptyPoint(),
      destination: createEmptyPoint(),
      viaPoints: [],
      loading: false,
      errorMessage: "",
      results: [],
      menu: {
        visible: false,
        point: null,
        x: 0,
        y: 0,
      },
    };

    const panel = createPanel("tilia-route-search-panel tilia-route-search-panel-hidden");
    const contextMenu = createPanel("tilia-route-search-menu tilia-route-search-menu-hidden");
    stopPanelPropagation(panel);
    stopPanelPropagation(contextMenu);

    const mountedPanel = app.ui.mountSurface({
      id: "tilia-route-search-panel",
      surface: TILIA_UI_LAYER.floating,
      element: panel,
      priority: TILIA_CONTROL_PRIORITY.high,
    });
    const mountedMenu = app.ui.mountSurface({
      id: "tilia-route-search-menu",
      surface: TILIA_UI_LAYER.floating,
      element: contextMenu,
      priority: TILIA_CONTROL_PRIORITY.high,
    });

    function setStatus(message) {
      app.setStatus?.(message);
    }

    function hideContextMenu() {
      state.menu.visible = false;
      contextMenu.classList.add("tilia-route-search-menu-hidden");
    }

    function setPoint(kind, point) {
      if (kind === "origin") {
        state.origin = copyPoint(point);
      } else if (kind === "destination") {
        state.destination = copyPoint(point);
      } else {
        state.viaPoints.push(copyPoint(point));
      }
      hideContextMenu();
      renderPanel();
    }

    function renderContextMenu() {
      if (!state.menu.visible || !state.menu.point) {
        contextMenu.classList.add("tilia-route-search-menu-hidden");
        contextMenu.innerHTML = "";
        return;
      }

      contextMenu.classList.remove("tilia-route-search-menu-hidden");
      contextMenu.style.left = `${state.menu.x}px`;
      contextMenu.style.top = `${state.menu.y}px`;
      contextMenu.innerHTML = "";

      const title = document.createElement("div");
      title.className = "tilia-route-search-menu-title";
      title.textContent = `${formatCoordinate(state.menu.point.lat)}, ${formatCoordinate(state.menu.point.lon)}`;
      contextMenu.appendChild(title);

      const actions = [
        { label: "Set as start", kind: "origin" },
        { label: "Add as via", kind: "via" },
        { label: "Set as destination", kind: "destination" },
      ];

      for (const action of actions) {
        const button = createButton(action.label, "tilia-route-search-menu-action");
        button.addEventListener("click", () => {
          setPoint(action.kind, state.menu.point);
        });
        contextMenu.appendChild(button);
      }
    }

    function createPointSection({ label, point, onChange, onRemove = null }) {
      const wrap = document.createElement("div");
      wrap.className = "tilia-route-search-point";

      const heading = document.createElement("div");
      heading.className = "tilia-route-search-point-header";
      const labelNode = document.createElement("label");
      labelNode.className = "tilia-route-search-label";
      labelNode.textContent = label;
      heading.appendChild(labelNode);

      if (typeof onRemove === "function") {
        const removeButton = createButton("Remove", "tilia-route-search-inline-action");
        removeButton.addEventListener("click", onRemove);
        heading.appendChild(removeButton);
      }

      wrap.appendChild(heading);

      const row = document.createElement("div");
      row.className = "tilia-route-search-point-row";
      const latInput = document.createElement("input");
      latInput.type = "number";
      latInput.step = "0.000001";
      latInput.placeholder = "Latitude";
      latInput.className = "tilia-control-select tilia-route-search-input";
      latInput.value = point.lat;
      latInput.addEventListener("input", () => onChange({ ...point, lat: latInput.value }));

      const lonInput = document.createElement("input");
      lonInput.type = "number";
      lonInput.step = "0.000001";
      lonInput.placeholder = "Longitude";
      lonInput.className = "tilia-control-select tilia-route-search-input";
      lonInput.value = point.lon;
      lonInput.addEventListener("input", () => onChange({ ...point, lon: lonInput.value }));

      row.appendChild(latInput);
      row.appendChild(lonInput);
      wrap.appendChild(row);

      return wrap;
    }

    async function runSearch() {
      const validationError = validateRoutePoints(state);
      if (validationError) {
        state.errorMessage = validationError;
        setStatus(`Route search: ${validationError}`);
        renderPanel();
        return;
      }

      state.loading = true;
      state.errorMessage = "";
      renderPanel();

      try {
        const { routes } = await requestPhloemRoutes({
          endpoint,
          apiKey,
          profile: state.profile,
          points: getOrderedPoints(state),
          timeoutMs,
        });

        const nextResults = [];
        const limitedRoutes = routes.slice(0, importLimit);
        for (let index = 0; index < limitedRoutes.length; index += 1) {
          const route = limitedRoutes[index];
          const source = createImportedRouteSource({
            geometry: {
              type: "LineString",
              coordinates: route.geometry.coordinates,
            },
            distance_meters: route.distanceMeters,
            duration_seconds: route.durationSeconds,
            provider: route.provider,
            warnings: route.warnings,
          }, {
            profile: state.profile,
            routeIndex: index,
            routeCount: limitedRoutes.length,
          });
          const entry = core.addGpxSource(source, {
            fitToView: index === 0,
            visible: true,
          });

          nextResults.push({
            entryId: entry.id,
            name: entry.source?.name || source.name,
            provider: route.provider,
            distanceMeters: route.distanceMeters,
            durationSeconds: route.durationSeconds,
            warnings: route.warnings,
          });
        }

        state.results = nextResults;
        app.refreshView();
        setStatus(`Route search: imported ${nextResults.length} route${nextResults.length === 1 ? "" : "s"}`);
      } catch (error) {
        state.errorMessage = error.message;
        setStatus(`Route search failed: ${error.message}`);
        app.setError?.(error);
      } finally {
        state.loading = false;
        renderPanel();
      }
    }

    function renderResults(root) {
      const title = document.createElement("p");
      title.className = "tilia-route-search-section-title";
      title.textContent = "Latest imported routes";
      root.appendChild(title);

      if (state.results.length === 0) {
        const empty = document.createElement("p");
        empty.className = "tilia-route-search-empty";
        empty.textContent = "No imported routes yet.";
        root.appendChild(empty);
        return;
      }

      const list = document.createElement("ul");
      list.className = "tilia-route-search-results";
      for (const result of state.results) {
        const item = document.createElement("li");
        item.className = "tilia-route-search-result";

        const body = document.createElement("div");
        body.className = "tilia-route-search-result-body";
        const name = document.createElement("strong");
        name.className = "tilia-route-search-result-title";
        name.textContent = result.name;
        body.appendChild(name);

        const meta = document.createElement("div");
        meta.className = "tilia-route-search-result-meta";
        meta.textContent = `${formatDistance(result.distanceMeters)} • ${formatDuration(result.durationSeconds)} • ${result.provider}`;
        body.appendChild(meta);

        item.appendChild(body);

        const fitButton = createButton("Zoom", "tilia-route-search-inline-action");
        fitButton.addEventListener("click", () => {
          core.fitEntryToView(result.entryId);
        });
        item.appendChild(fitButton);
        list.appendChild(item);
      }
      root.appendChild(list);
    }

    function renderPanel() {
      panel.innerHTML = "";

      const header = document.createElement("div");
      header.className = "tilia-route-search-header";
      const title = document.createElement("h2");
      title.className = "tilia-route-search-title";
      title.textContent = "Route Search";
      header.appendChild(title);

      const closeButton = createButton("Close", "tilia-route-search-close");
      closeButton.addEventListener("click", () => {
        panel.classList.add("tilia-route-search-panel-hidden");
        hideContextMenu();
      });
      header.appendChild(closeButton);
      panel.appendChild(header);

      const content = document.createElement("div");
      content.className = "tilia-route-search-content";
      const intro = document.createElement("p");
      intro.className = "tilia-route-search-intro";
      intro.textContent = "Search routes through Phloem, then add them as editable GPX-like layers.";
      content.appendChild(intro);

      const profileLabel = document.createElement("label");
      profileLabel.className = "tilia-route-search-label";
      profileLabel.textContent = "Profile";
      content.appendChild(profileLabel);

      const profileSelect = createSelect(
        profileOptions.map((profile) => ({ value: profile, label: profile, selected: profile === state.profile })),
        "tilia-route-search-select",
      );
      profileSelect.addEventListener("change", () => {
        state.profile = profileSelect.value;
      });
      content.appendChild(profileSelect);

      content.appendChild(createPointSection({
        label: "Start",
        point: state.origin,
        onChange(nextPoint) {
          state.origin = nextPoint;
        },
      }));

      state.viaPoints.forEach((point, index) => {
        content.appendChild(createPointSection({
          label: `Via ${index + 1}`,
          point,
          onChange(nextPoint) {
            state.viaPoints[index] = nextPoint;
          },
          onRemove() {
            state.viaPoints.splice(index, 1);
            renderPanel();
          },
        }));
      });

      const addViaButton = createButton("+ Add Via Point", "tilia-route-search-add-via");
      addViaButton.addEventListener("click", () => {
        state.viaPoints.push(createEmptyPoint());
        renderPanel();
      });
      content.appendChild(addViaButton);

      content.appendChild(createPointSection({
        label: "Destination",
        point: state.destination,
        onChange(nextPoint) {
          state.destination = nextPoint;
        },
      }));

      if (state.errorMessage) {
        const errorNode = document.createElement("p");
        errorNode.className = "tilia-route-search-error";
        errorNode.textContent = state.errorMessage;
        content.appendChild(errorNode);
      }

      const actions = document.createElement("div");
      actions.className = "tilia-route-search-actions";
      const searchButton = createButton(state.loading ? "Searching..." : "Search Routes", "tilia-route-search-search");
      searchButton.disabled = state.loading;
      searchButton.addEventListener("click", () => {
        runSearch();
      });
      actions.appendChild(searchButton);

      const clearButton = createButton("Clear Form", "tilia-route-search-clear");
      clearButton.disabled = state.loading;
      clearButton.addEventListener("click", () => {
        state.origin = createEmptyPoint();
        state.destination = createEmptyPoint();
        state.viaPoints = [];
        state.errorMessage = "";
        renderPanel();
      });
      actions.appendChild(clearButton);
      content.appendChild(actions);

      const hint = document.createElement("p");
      hint.className = "tilia-route-search-hint";
      hint.textContent = "Right-click the map while this panel is open to set the start, via, or destination point.";
      content.appendChild(hint);

      renderResults(content);
      panel.appendChild(content);
    }

    renderPanel();

    const control = installMapControl({
      map,
      position,
      priority,
      className: "tilia-route-search-control",
      createContent() {
        const wrap = createPanel("tilia-control-panel-compact");
        const button = createButton("R", "tilia-control-button-icon");
        button.title = "Route search";
        button.setAttribute("aria-label", "Route search");
        button.addEventListener("click", () => {
          const isHidden = panel.classList.contains("tilia-route-search-panel-hidden");
          panel.classList.toggle("tilia-route-search-panel-hidden", !isHidden);
          if (!isHidden) {
            hideContextMenu();
          }
        });
        wrap.appendChild(button);
        return wrap;
      },
    });

    function onContextMenu(event) {
      if (panel.classList.contains("tilia-route-search-panel-hidden")) {
        return;
      }
      event.originalEvent?.preventDefault?.();
      state.menu = {
        visible: true,
        point: copyPoint({ lat: event.latlng.lat, lon: event.latlng.lng }),
        x: event.containerPoint.x,
        y: event.containerPoint.y,
      };
      renderContextMenu();
    }

    map.on("contextmenu", onContextMenu);
    map.on("click", hideContextMenu);
    map.on("movestart", hideContextMenu);

    return {
      destroy() {
        map.off("contextmenu", onContextMenu);
        map.off("click", hideContextMenu);
        map.off("movestart", hideContextMenu);
        hideContextMenu();
        mountedMenu?.unmount?.();
        mountedPanel?.unmount?.();
        contextMenu.remove?.();
        panel.remove?.();
        control.remove?.();
      },
    };
  },
};

export default routeSearchPlugin;