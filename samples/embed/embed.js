import { createDefaultTiliaApp } from "../../src/index.js";

async function loadIntoApp(app, url) {
  // Fetch the asset and hand it to Tilia through the same File-based path as local input.
  const response = await fetch(url);
  const blob = await response.blob();
  const name = url.split("/").at(-1);
  const file = new File([blob], name, {
    type: blob.type,
  });
  const result = await app.load(file);
  const summary = result.entry.domain.id === "gpx" ? `${Math.round(app.domains.gpx.getDistance(result.entry.id).totalMeters)} m` : result.locationSource ?? "no location";
  return { ...result, summary };
}

function setStatus(node, text) {
  node.textContent = text;
}

// 1. Embed a GPX track in its own map.
async function bootTrackCard(card) {
  const gpxUrl = card.dataset.tiliaGpxUrl;
  const mapNode = card.querySelector(".story-map");
  const statusNode = card.querySelector(".story-status");

  // Each content block creates its own independent map and Tilia application.
  const app = createDefaultTiliaApp(mapNode, {
    plugins: [
      "tilia-gpx-renderer",
      "tilia-gpx-input",
      "tilia-gpx-ui",
      "tilia-map-selection-presenter",
    ] });

  // The GPX URL comes from the card's data attribute.
  const result = await loadIntoApp(app, gpxUrl);
  setStatus(statusNode, `Loaded ${result.name}: ${result.summary}`);
}

// 2. Place a photo using the GPS coordinates stored in its EXIF data.
async function bootGpsPhotoCard(card) {
  const photo = card.querySelector("img[data-tilia-photo-url]");
  const mapNode = card.querySelector(".story-map");
  const statusNode = card.querySelector(".story-status");
  const app = createDefaultTiliaApp(mapNode, {
    plugins: [
      "tilia-photo-renderer",
      "tilia-jpeg-input",
      "tilia-photo-ui",
      "tilia-map-selection-presenter",
    ],
  });

  const result = await loadIntoApp(app, photo.dataset.tiliaPhotoUrl);
  setStatus(statusNode, `Loaded ${result.name}: ${result.summary}`);
}

// 3. Infer a photo's location from a GPX track and its capture time.
async function bootInferredPhotoCard(card) {
  const photo = card.querySelector("img[data-tilia-photo-url]");
  const mapNode = card.querySelector(".story-map");
  const statusNode = card.querySelector(".story-status");
  const app = createDefaultTiliaApp(mapNode, {
    plugins: [
      "tilia-gpx-renderer",
      "tilia-gpx-input",
      "tilia-photo-renderer",
      "tilia-jpeg-input",
      "tilia-photo-ui",
      "tilia-map-selection-presenter",
    ],
    pluginOptions: {
      "tilia-jpeg-input": { defaultPhotoTimeMode: photo.dataset.tiliaPhotoTimeMode },
    },
  });

  // Load the time reference into this app, but keep its track off the map.
  const helper = await loadIntoApp(app, card.dataset.tiliaGpxUrl);
  await app.entries.setVisible(helper.entry.id, false);
  const result = await loadIntoApp(app, photo.dataset.tiliaPhotoUrl);
  setStatus(statusNode, `Loaded ${result.name}: ${result.summary}`);
}

// 4. Connect a GPX route to an external list and plain-text details.
async function bootRouteCard(card) {
  const statusNode = card.querySelector(".story-status");
  const list = card.querySelector(".route-list");
  const title = card.querySelector(".route-detail-title");
  const description = card.querySelector(".route-detail-description");
  const emptyTitle = title.textContent;
  const app = createDefaultTiliaApp(card.querySelector(".story-map"), {
    // No GPX UI plugin: the external detail panel replaces popups.
    plugins: ["tilia-gpx-input", "tilia-gpx-renderer", "tilia-map-selection-presenter"],
  });

  // This bundled GPX has one route with named points and no other geometry.
  const result = await loadIntoApp(app, card.dataset.tiliaGpxUrl);
  const gpx = app.domains.gpx;
  const route = gpx.getDocument(result.entry.id).document.routes[0];
  card.querySelector(".route-title").textContent = route.name || result.name;
  const buttons = route.points.map((point, pointIndex) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = point.name || String(pointIndex + 1);
    button.addEventListener("click", async () => {
      const selected = await app.selection.request(gpx.selection.createCandidate(result.entry.id, {
        kind: "route-point", routeIndex: 0, pointIndex,
      }));
      if (app.selection.getCurrent() === selected) app.map.panTo([point.lat, point.lon]);
    });
    item.append(button);
    list.append(item);
    return button;
  });

  // Selection belongs to Tilia; both controls project the same state.
  // Map clicks update these nodes without moving the map.
  const renderSelection = (current) => {
    const point = current?.ref.kind === "route-point"
      ? gpx.selection.resolve(current.entryId, current.ref) : null;
    buttons.forEach((button, index) => {
      button.setAttribute("aria-pressed", String(!!point && index === current.ref.pointIndex));
    });
    title.textContent = point ? buttons[current.ref.pointIndex].textContent : emptyTitle;
    description.textContent = point?.description || "";
  };
  app.selection.subscribe(({ current }) => renderSelection(current));
  renderSelection(app.selection.getCurrent());
  setStatus(statusNode, `Loaded ${result.name}`);
}

// Each example initializes only its own card; none depends on another.
bootTrackCard(document.getElementById("track-embed"));
bootGpsPhotoCard(document.getElementById("gps-photo-embed"));
bootInferredPhotoCard(document.getElementById("inferred-photo-embed"));
bootRouteCard(document.getElementById("route-guide-embed"));
