import { DivIcon, DomEvent, FeatureGroup, Marker } from "leaflet";
import { createButton, createPanel, installMapControl } from "../../src/map/controls.js";
import { TILIA_CONTROL_PRIORITY, TILIA_UI_LAYER } from "../../src/ui/protocol.js";
import { requestPhloemRoutes } from "./client.js";
import { isValidLatitude, isValidLongitude, parseCoordinateValue } from "./coordinates.js";
import { createImportedRouteSource } from "./helpers.js";
import { formatProfileLabel, resolveRouteProfileOptions } from "./profiles.js";

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
  const lat = parseCoordinateValue(point?.lat);
  const lon = parseCoordinateValue(point?.lon);
  return isValidLatitude(lat) && isValidLongitude(lon);
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

function createMarkerCoordinate(value) {
  return Number(value).toFixed(6);
}

function formatPointInputValue(point) {
  const lat = point?.lat ?? "";
  const lon = point?.lon ?? "";
  if (lat !== "" && lon !== "") {
    return `${lat}, ${lon}`;
  }
  return lat || lon || "";
}

function parsePointInputValue(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return createEmptyPoint();
  }

  const parts = text.split(",");
  if (parts.length === 1) {
    return {
      lat: parts[0].trim(),
      lon: "",
    };
  }

  return {
    lat: parts[0].trim(),
    lon: parts.slice(1).join(",").trim(),
  };
}

function createPointMarkerText(kind, index = null) {
  if (kind === "origin") {
    return "S";
  }
  if (kind === "destination") {
    return "G";
  }
  if (kind === "via" && Number.isInteger(index)) {
    return String(index + 1);
  }
  if (kind === "via") {
    return "V";
  }
  return "?";
}

function createMenuActionLabel(kind) {
  if (kind === "origin") {
    return "Start";
  }
  if (kind === "destination") {
    return "Goal";
  }
  return "Via";
}

function createPointMarkerIcon(kind, text) {
  return new DivIcon({
    className: `tilia-route-search-marker-icon tilia-route-search-marker-${kind}`,
    html: `<span class="tilia-route-search-marker"><span class="tilia-route-search-marker-dot">${text}</span></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function listMarkerPoints(state) {
  const points = [];

  if (isCompletePoint(state.origin)) {
    points.push({
      key: "origin",
      kind: "origin",
      label: "Start",
      point: state.origin,
    });
  }

  state.viaPoints.forEach((point, index) => {
    if (!isCompletePoint(point)) {
      return;
    }
    points.push({
      key: `via-${index}`,
      kind: "via",
      label: `Via ${index + 1}`,
      point,
      index,
    });
  });

  if (isCompletePoint(state.destination)) {
    points.push({
      key: "destination",
      kind: "destination",
      label: "Goal",
      point: state.destination,
    });
  }

  return points;
}

function getOrderedPoints(state) {
  return [state.origin, ...state.viaPoints, state.destination];
}

function validateRoutePoints(state) {
  const ordered = getOrderedPoints(state);
  if (!isCompletePoint(state.origin) || !isCompletePoint(state.destination)) {
    return "Start and Goal both require valid coordinates (lat: -90..90, lon: -180..180).";
  }
  if (ordered.some((point) => !isCompletePoint(point))) {
    return "Every route point must use valid coordinates (lat: -90..90, lon: -180..180).";
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
    const parsedImportLimit = Number(options.importLimit);
    const importLimit = Number.isFinite(parsedImportLimit) && parsedImportLimit > 0
      ? Math.min(3, Math.max(1, Math.floor(parsedImportLimit)))
      : 3;
    const { profileOptions, initialProfile } = resolveRouteProfileOptions(options);

    const state = {
      profile: initialProfile,
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
    const markerLayer = new FeatureGroup();
    markerLayer.addTo(map);
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

    function syncPointMarkers() {
      markerLayer.clearLayers();

      for (const descriptor of listMarkerPoints(state)) {
        const marker = new Marker([Number(descriptor.point.lat), Number(descriptor.point.lon)], {
          draggable: true,
          keyboard: false,
          zIndexOffset: 1400,
          icon: createPointMarkerIcon(descriptor.kind, createPointMarkerText(descriptor.kind, descriptor.index)),
        });

        marker.on("click", (event) => {
          event.originalEvent?.preventDefault?.();
          event.originalEvent?.stopPropagation?.();
          hideContextMenu();
        });

        marker.on("dragstart", () => {
          hideContextMenu();
        });

        marker.on("dragend", () => {
          const moved = marker.getLatLng();
          const nextPoint = {
            lat: createMarkerCoordinate(moved.lat),
            lon: createMarkerCoordinate(moved.lng),
          };

          if (descriptor.kind === "origin") {
            state.origin = nextPoint;
          } else if (descriptor.kind === "destination") {
            state.destination = nextPoint;
          } else if (descriptor.kind === "via" && Number.isInteger(descriptor.index)) {
            state.viaPoints[descriptor.index] = nextPoint;
          }

          setStatus(`Route search: moved ${descriptor.label.toLowerCase()} point`);
          renderPanel();
          syncPointMarkers();
        });

        marker.addTo(markerLayer);
      }
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
      syncPointMarkers();
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
        { label: "Set as", kind: "origin" },
        { label: "Add as", kind: "via" },
        { label: "Set as", kind: "destination" },
      ];

      for (const action of actions) {
        const button = createButton("", `tilia-route-search-menu-action tilia-route-search-menu-action-${action.kind}`);
        const mark = document.createElement("span");
        mark.className = `tilia-route-search-point-mark tilia-route-search-point-mark-${action.kind}`;
        mark.textContent = createPointMarkerText(action.kind);
        button.appendChild(mark);

        const text = document.createElement("span");
        text.textContent = `${action.label} ${createMenuActionLabel(action.kind)}`;
        button.appendChild(text);
        button.addEventListener("click", () => {
          setPoint(action.kind, state.menu.point);
        });
        contextMenu.appendChild(button);
      }
    }

    function createPointRow({ label, kind, index = null, point, onChange, onRemove }) {
      const row = document.createElement("div");
      row.className = "tilia-route-search-point-row";

      const marker = document.createElement("span");
      marker.className = `tilia-route-search-point-mark tilia-route-search-point-mark-${kind}`;
      marker.textContent = createPointMarkerText(kind, index);
      marker.title = label;
      row.appendChild(marker);

      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "decimal";
      input.placeholder = `${label}: lat, lon`;
      input.className = "tilia-control-select tilia-route-search-point-input";
      input.value = formatPointInputValue(point);
      input.setAttribute("aria-label", `${label} coordinates`);
      input.addEventListener("input", () => {
        onChange(parsePointInputValue(input.value));
      });
      row.appendChild(input);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "tilia-route-search-point-action";
      removeButton.textContent = kind === "via" ? "-" : "×";
      removeButton.title = kind === "via" ? `Remove ${label}` : `Clear ${label}`;
      removeButton.setAttribute("aria-label", removeButton.title);
      removeButton.addEventListener("click", onRemove);
      row.appendChild(removeButton);

      return row;
    }

    function createAddViaRow(onAdd) {
      const row = document.createElement("div");
      row.className = "tilia-route-search-add-row";

      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "tilia-route-search-add-via";
      addButton.textContent = "+";
      addButton.title = "Add via point";
      addButton.setAttribute("aria-label", "Add via point");
      addButton.addEventListener("click", onAdd);
      row.appendChild(addButton);

      return row;
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
            waypoints: getOrderedPoints(state),
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

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "tilia-side-panel-close tilia-route-search-close";
      closeButton.textContent = "Close";
      closeButton.addEventListener("click", () => {
        panel.classList.add("tilia-route-search-panel-hidden");
        hideContextMenu();
      });
      header.appendChild(closeButton);
      panel.appendChild(header);

      const content = document.createElement("div");
      content.className = "tilia-route-search-content";

      const profileSection = document.createElement("div");
      profileSection.className = "tilia-route-search-profile-section";
      const profileLabel = document.createElement("p");
      profileLabel.className = "tilia-route-search-section-title";
      profileLabel.textContent = "Profile";
      profileSection.appendChild(profileLabel);

      const profileList = document.createElement("div");
      profileList.className = "tilia-route-search-profile-list";
      for (const profile of profileOptions) {
        const profileButton = createButton(formatProfileLabel(profile), "tilia-route-search-profile-option");
        if (profile === state.profile) {
          profileButton.classList.add("tilia-route-search-profile-option-active");
        }
        profileButton.addEventListener("click", () => {
          state.profile = profile;
          renderPanel();
        });
        profileList.appendChild(profileButton);
      }
      profileSection.appendChild(profileList);
      content.appendChild(profileSection);

      const points = document.createElement("div");
      points.className = "tilia-route-search-points";

      points.appendChild(createPointRow({
        label: "Start",
        kind: "origin",
        point: state.origin,
        onChange(nextPoint) {
          state.origin = nextPoint;
          syncPointMarkers();
        },
        onRemove() {
          state.origin = createEmptyPoint();
          hideContextMenu();
          renderPanel();
          syncPointMarkers();
        },
      }));

      state.viaPoints.forEach((point, index) => {
        points.appendChild(createPointRow({
          label: `Via ${index + 1}`,
          kind: "via",
          index,
          point,
          onChange(nextPoint) {
            state.viaPoints[index] = nextPoint;
            syncPointMarkers();
          },
          onRemove() {
            state.viaPoints.splice(index, 1);
            renderPanel();
            syncPointMarkers();
          },
        }));
      });

      points.appendChild(createPointRow({
        label: "Goal",
        kind: "destination",
        point: state.destination,
        onChange(nextPoint) {
          state.destination = nextPoint;
          syncPointMarkers();
        },
        onRemove() {
          state.destination = createEmptyPoint();
          hideContextMenu();
          renderPanel();
          syncPointMarkers();
        },
      }));

      points.appendChild(createAddViaRow(() => {
        state.viaPoints.push(createEmptyPoint());
        renderPanel();
        syncPointMarkers();
      }));

      content.appendChild(points);

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
        syncPointMarkers();
      });
      actions.appendChild(clearButton);
      content.appendChild(actions);

      const hint = document.createElement("p");
      hint.className = "tilia-route-search-hint";
      hint.textContent = "Right-click the map while this panel is open to set points. Registered points stay visible on the map and can be adjusted by dragging their markers.";
      content.appendChild(hint);

      renderResults(content);
      panel.appendChild(content);
    }

    renderPanel();
    syncPointMarkers();

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
        markerLayer.remove?.();
        contextMenu.remove?.();
        panel.remove?.();
        control.remove?.();
      },
    };
  },
};

export default routeSearchPlugin;