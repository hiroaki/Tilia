import { CircleMarker } from "leaflet";
import { createButton, createPanel, installMapControl } from "../../map/controls.js";
import { createTrackPointPopupContent } from "../../map/layers.js";

function formatDistance(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return "-";
  }
  if (distanceMeters >= 1000) {
    return `${(distanceMeters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(distanceMeters)} m`;
}

function summarizeProfile(profile) {
  let minElevation = Number.POSITIVE_INFINITY;
  let maxElevation = Number.NEGATIVE_INFINITY;
  let totalAscent = 0;

  for (let index = 0; index < profile.length; index += 1) {
    const point = profile[index];
    minElevation = Math.min(minElevation, point.elevation);
    maxElevation = Math.max(maxElevation, point.elevation);

    if (index > 0) {
      const delta = point.elevation - profile[index - 1].elevation;
      if (delta > 0) {
        totalAscent += delta;
      }
    }
  }

  return {
    minElevation,
    maxElevation,
    totalAscent,
    totalDistance: profile[profile.length - 1]?.distanceMeters || 0,
  };
}

function getChartLayout() {
  return {
    width: 320,
    height: 160,
    paddingX: 3,
    paddingTop: 8,
    paddingBottom: 20,
  };
}

function getNearestProfileIndex(profile, distanceMeters) {
  let nearestIndex = 0;
  let nearestDelta = Number.POSITIVE_INFINITY;

  for (let index = 0; index < profile.length; index += 1) {
    const delta = Math.abs(profile[index].distanceMeters - distanceMeters);
    if (delta < nearestDelta) {
      nearestDelta = delta;
      nearestIndex = index;
    }
  }

  return nearestIndex;
}

function getNearestProfilePoint(profile, latlng) {
  if (!latlng || profile.length === 0) {
    return profile[0] || null;
  }

  let nearestPoint = profile[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const point of profile) {
    const deltaLat = point.lat - latlng.lat;
    const deltaLon = point.lon - latlng.lng;
    const distance = (deltaLat * deltaLat) + (deltaLon * deltaLon);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPoint = point;
    }
  }

  return nearestPoint;
}

function getChartPointPosition(point, chartLayout, ranges) {
  const { width, height, paddingX, paddingTop, paddingBottom } = chartLayout;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingTop - paddingBottom;
  const x = paddingX + (point.distanceMeters / ranges.distanceRange) * chartWidth;
  const y = paddingTop + chartHeight - ((point.elevation - ranges.minElevation) / ranges.elevationRange) * chartHeight;

  return {
    x,
    y,
    chartWidth,
    chartHeight,
    leftPercent: (x / width) * 100,
    topPercent: (y / height) * 100,
    topPaddingPercent: (paddingTop / height) * 100,
    bottomPaddingPercent: (paddingBottom / height) * 100,
  };
}

function getPointAtClientX(profile, svg, clientX, width, paddingX, distanceRange) {
  const rect = svg.getBoundingClientRect();
  if (rect.width === 0) {
    return null;
  }

  const relativeX = ((clientX - rect.left) / rect.width) * width;
  const clampedX = Math.max(paddingX, Math.min(width - paddingX, relativeX));
  const selectedDistance = ((clampedX - paddingX) / (width - paddingX * 2)) * distanceRange;
  return profile[getNearestProfileIndex(profile, selectedDistance)] || null;
}

function createProfileSvg(profile, activePoint, { onPointSelect, onPointHover, onPointerLeave }) {
  const namespace = "http://www.w3.org/2000/svg";
  const wrap = document.createElement("div");
  wrap.className = "tilia-elevation-chart-wrap";
  const surface = document.createElement("div");
  surface.className = "tilia-elevation-chart-surface";
  const svg = document.createElementNS(namespace, "svg");
  const chartLayout = getChartLayout();
  const { width, height, paddingX, paddingTop, paddingBottom } = chartLayout;
  const { minElevation, maxElevation, totalDistance } = summarizeProfile(profile);
  const ranges = {
    minElevation,
    elevationRange: Math.max(maxElevation - minElevation, 1),
    distanceRange: Math.max(totalDistance, 1),
  };

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "tilia-elevation-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Elevation profile");

  const baseLine = document.createElementNS(namespace, "line");
  baseLine.setAttribute("x1", String(paddingX));
  baseLine.setAttribute("y1", String(height - paddingBottom));
  baseLine.setAttribute("x2", String(width - paddingX));
  baseLine.setAttribute("y2", String(height - paddingBottom));
  baseLine.setAttribute("stroke", "#d6d3d1");
  baseLine.setAttribute("stroke-width", "1");
  svg.appendChild(baseLine);

  const polyline = document.createElementNS(namespace, "polyline");
  const points = profile.map((point) => {
    const position = getChartPointPosition(point, chartLayout, ranges);
    return `${position.x},${position.y}`;
  });
  polyline.setAttribute("points", points.join(" "));
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#0f766e");
  polyline.setAttribute("stroke-width", "2");
  polyline.setAttribute("stroke-linejoin", "round");
  polyline.setAttribute("stroke-linecap", "round");
  svg.appendChild(polyline);

  if (activePoint) {
    const activePosition = getChartPointPosition(activePoint, chartLayout, ranges);

    const overlay = document.createElement("div");
    overlay.className = "tilia-elevation-guide-overlay";

    const guide = document.createElement("div");
    guide.className = "tilia-elevation-guide-line";
    guide.style.left = `${activePosition.leftPercent}%`;
    guide.style.top = `${activePosition.topPaddingPercent}%`;
    guide.style.bottom = `${activePosition.bottomPaddingPercent}%`;

    const marker = document.createElement("div");
    marker.className = "tilia-elevation-guide-marker";
    marker.style.left = `${activePosition.leftPercent}%`;
    marker.style.top = `${activePosition.topPercent}%`;

    overlay.appendChild(guide);
    overlay.appendChild(marker);
    surface.appendChild(overlay);
  }

  svg.addEventListener("click", (event) => {
    const point = getPointAtClientX(profile, svg, event.clientX, width, paddingX, ranges.distanceRange);
    if (point) {
      onPointSelect(point);
    }
  });

  svg.addEventListener("pointermove", (event) => {
    const point = getPointAtClientX(profile, svg, event.clientX, width, paddingX, ranges.distanceRange);
    if (point) {
      onPointHover(point);
    }
  });

  svg.addEventListener("pointerleave", () => {
    onPointerLeave();
  });

  const footer = document.createElement("div");
  footer.className = "tilia-elevation-chart-footer";

  const startLabel = document.createElement("span");
  startLabel.className = "tilia-elevation-chart-label";
  startLabel.textContent = "Start";

  const endLabel = document.createElement("span");
  endLabel.className = "tilia-elevation-chart-label tilia-elevation-chart-label-end";
  endLabel.textContent = formatDistance(totalDistance);

  footer.appendChild(startLabel);
  footer.appendChild(endLabel);
  surface.appendChild(svg);
  wrap.appendChild(surface);
  wrap.appendChild(footer);

  return wrap;
}

export function installElevationPanelControl({ map, core, panel, onStatus, position = "topleft" }) {
  let selectedEntryId = null;
  let selectedPointByEntryId = new Map();
  let hoveredPointByEntryId = new Map();
  let activePointMarker = null;
  let activeRevealVersion = 0;
  let activePopupRevealVersion = 0;
  let popupPinned = false;

  function getTrackEntries() {
    return core.state.entries.filter((entry) => entry.kind === "gpx");
  }

  function getSelectedEntry() {
    const entries = getTrackEntries();
    if (entries.length === 0) {
      selectedEntryId = null;
      return null;
    }

    const current = entries.find((entry) => entry.id === selectedEntryId);
    if (current) {
      return current;
    }

    selectedEntryId = entries[0].id;
    return entries[0];
  }

  function clearActivePointMarker() {
    if (!activePointMarker) {
      return;
    }
    activePointMarker.remove();
    activePointMarker = null;
  }

  function clearSelectedPoint(entryId = null) {
    if (entryId == null) {
      selectedPointByEntryId = new Map();
      return;
    }
    selectedPointByEntryId.delete(entryId);
  }

  function clearHoveredPoint(entryId = null) {
    if (entryId == null) {
      hoveredPointByEntryId = new Map();
      return;
    }
    hoveredPointByEntryId.delete(entryId);
  }

  function focusPoint(point) {
    clearActivePointMarker();
    activePointMarker = new CircleMarker([point.lat, point.lon], {
      radius: 6,
      color: "#0f766e",
      weight: 3,
      fillColor: "#ffffff",
      fillOpacity: 1,
    });
    activePointMarker.addTo(map);
  }

  function beginReveal(point) {
    activeRevealVersion += 1;
    focusPoint(point);
    return activeRevealVersion;
  }

  function syncFocusedPoint() {
    const entry = getSelectedEntry();
    const hoveredPoint = entry ? hoveredPointByEntryId.get(entry.id) : null;
    if (hoveredPoint) {
      focusPoint(hoveredPoint);
      return;
    }

    const selectedPoint = entry ? selectedPointByEntryId.get(entry.id) : null;
    if (selectedPoint) {
      focusPoint(selectedPoint);
      return;
    }

    clearActivePointMarker();
  }

  function hoverPoint(entry, point) {
    if (popupPinned) {
      return;
    }
    if (!point) {
      return;
    }
    const currentPoint = hoveredPointByEntryId.get(entry.id);
    if (currentPoint === point) {
      return;
    }
    hoveredPointByEntryId.set(entry.id, point);
    syncFocusedPoint();
    panel.rerenderPanel("elevation");
  }

  function clearPointHover(entry) {
    if (!entry || !hoveredPointByEntryId.has(entry.id)) {
      return;
    }
    hoveredPointByEntryId.delete(entry.id);
    syncFocusedPoint();
    panel.rerenderPanel("elevation");
  }

  function clearRevealState() {
    activeRevealVersion = 0;
    activePopupRevealVersion = 0;
    clearHoveredPoint();
    clearSelectedPoint();
    clearActivePointMarker();
    panel.rerenderPanel("elevation");
  }

  function createRevealPopupContent(entry, point, revealVersion) {
    const content = createTrackPointPopupContent(entry.source, point);
    if (content instanceof HTMLElement) {
      content.dataset.tiliaRevealVersion = String(revealVersion);
    }
    return content;
  }

  function openRevealPopup(entry, point, revealVersion) {
    core.openPopup({
      latlng: [point.lat, point.lon],
      content: createRevealPopupContent(entry, point, revealVersion),
      panTo: true,
    });
  }

  function selectPoint(entry, point, options = {}) {
    clearHoveredPoint(entry.id);
    selectedPointByEntryId.set(entry.id, point);
    if (options.revealOnMap) {
      const revealVersion = beginReveal(point);
      openRevealPopup(entry, point, revealVersion);
    } else {
      syncFocusedPoint();
    }
    panel.rerenderPanel("elevation");
    onStatus(`Selected ${entry.source.name} point at ${formatDistance(point.distanceMeters)}`);
  }

  function createPanelSpec() {
    return {
      panelId: "elevation",
      title: "Elevation",
      layout: "bottom",
      render() {
        const content = document.createElement("div");
        content.className = "tilia-elevation-panel-content";

        const main = document.createElement("div");
        main.className = "tilia-elevation-panel-main";

        const entries = getTrackEntries();
        if (entries.length === 0) {
          const empty = document.createElement("p");
          empty.className = "tilia-elevation-empty";
          empty.textContent = "No GPX tracks loaded.";
          main.appendChild(empty);
          content.appendChild(main);
          return content;
        }

        const selectedEntry = getSelectedEntry();

        if (!selectedEntry) {
          content.appendChild(main);
          return content;
        }

        const profile = selectedEntry.source.elevationProfile || [];
        if (profile.length < 2) {
          clearActivePointMarker();
          clearSelectedPoint(selectedEntry.id);
          const missing = document.createElement("p");
          missing.className = "tilia-elevation-empty";
          missing.textContent = "This GPX track does not contain enough elevation points to render a profile.";
          main.appendChild(missing);
          content.appendChild(main);
          return content;
        }

        let selectedPoint = selectedPointByEntryId.get(selectedEntry.id) || null;
        if (selectedPoint && !profile.includes(selectedPoint)) {
          selectedPoint = null;
          clearSelectedPoint(selectedEntry.id);
        }

        let hoveredPoint = hoveredPointByEntryId.get(selectedEntry.id) || null;
        if (hoveredPoint && !profile.includes(hoveredPoint)) {
          hoveredPoint = null;
          clearHoveredPoint(selectedEntry.id);
        }

        main.appendChild(createProfileSvg(profile, hoveredPoint || selectedPoint, {
          onPointSelect: (point) => selectPoint(selectedEntry, point, { revealOnMap: true }),
          onPointHover: (point) => hoverPoint(selectedEntry, point),
          onPointerLeave: () => clearPointHover(selectedEntry),
        }));

        content.appendChild(main);

        return content;
      },
    };
  }

  function activateEntry(entry, latlng = null, options = {}) {
    core.selectTrack(entry);
    selectedEntryId = entry.id;
    clearHoveredPoint();
    const profile = entry.source?.elevationProfile || [];
    if (profile.length > 0) {
      const existingPoint = selectedPointByEntryId.get(entry.id) || null;
      const selectedPoint = latlng ? (getNearestProfilePoint(profile, latlng) || profile[0]) : existingPoint;
      if (selectedPoint) {
        selectedPointByEntryId.set(entry.id, selectedPoint);
        if (options.revealOnMap) {
          const revealVersion = beginReveal(selectedPoint);
          openRevealPopup(entry, selectedPoint, revealVersion);
        }
      } else {
        clearSelectedPoint(entry.id);
      }
    } else {
      clearSelectedPoint(entry.id);
    }
    if (options.openPanel) {
      panel.openPanel(createPanelSpec());
    } else {
      panel.rerenderPanel("elevation");
    }
    const selectedPoint = selectedPointByEntryId.get(entry.id);
    if (selectedPoint) {
      onStatus(`Selected ${entry.source.name} point at ${formatDistance(selectedPoint.distanceMeters)}`);
    } else {
      onStatus(`Selected ${entry.source.name} elevation profile`);
    }
  }

  function refresh() {
    const entries = getTrackEntries();
    if (!entries.some((entry) => entry.id === selectedEntryId)) {
      selectedEntryId = entries[0]?.id || null;
    }
    selectedPointByEntryId = new Map(
      Array.from(selectedPointByEntryId.entries()).filter(([entryId]) => entries.some((entry) => entry.id === entryId)),
    );
    hoveredPointByEntryId = new Map(
      Array.from(hoveredPointByEntryId.entries()).filter(([entryId]) => entries.some((entry) => entry.id === entryId)),
    );
    if (entries.length === 0) {
      clearActivePointMarker();
    } else {
      syncFocusedPoint();
    }

    panel.rerenderPanel("elevation");
  }

  installMapControl({
    map,
    position,
    className: "tilia-elevation-control",
    createContent() {
      const wrap = createPanel("tilia-control-panel-compact");
      const button = createButton("E", "tilia-control-button-icon");
      button.title = "Elevation";
      button.setAttribute("aria-label", "Elevation");
      button.addEventListener("click", () => {
        const entry = getSelectedEntry();
        if (entry) {
          activateEntry(entry, null, { openPanel: true });
        } else {
          panel.togglePanel(createPanelSpec());
        }
      });
      wrap.appendChild(button);
      return wrap;
    },
  });

  core.subscribeInteractions({
    onTrackLayer({ entry, layer }) {
      layer.on("click", (event) => activateEntry(entry, event.latlng, { revealOnMap: true }));

      const bindDomClick = () => {
        const element = layer.getElement?.();
        if (!element || element.dataset.tiliaElevationBound === "1") {
          return;
        }
        element.dataset.tiliaElevationBound = "1";
        element.addEventListener("click", () => activateEntry(entry));
      };

      bindDomClick();
      layer.on("add", bindDomClick);
    },
  });

  map.on("popupopen", (event) => {
    popupPinned = true;
    const content = event.popup?.getContent?.();
    const revealVersion = Number(content?.dataset?.tiliaRevealVersion || 0);
    if (revealVersion > 0) {
      activePopupRevealVersion = revealVersion;
      return;
    }

    if (activePointMarker || selectedPointByEntryId.size > 0) {
      clearRevealState();
    }
  });

  map.on("popupclose", (event) => {
    popupPinned = false;
    const content = event.popup?.getContent?.();
    const closingRevealVersion = Number(content?.dataset?.tiliaRevealVersion || 0);
    if (!closingRevealVersion) {
      return;
    }
    setTimeout(() => {
      if (activePopupRevealVersion !== closingRevealVersion) {
        return;
      }
      clearRevealState();
    }, 0);
  });

  refresh();
  return { refresh };
}