function pad(value) {
  return String(value).padStart(2, "0");
}

export function formatTimestampForDateTimeLocal(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseDateTimeLocal(value) {
  if (!value) {
    return { valid: true, value: null };
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? { valid: true, value: timestamp } : { valid: false, value: null };
}

export function isFormTarget(target) {
  return target instanceof HTMLElement
    && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
}

function appendField(root, label, input) {
  const labelNode = document.createElement("label");
  labelNode.className = "tilia-track-editor-v2-label";
  labelNode.textContent = label;
  root.append(labelNode, input);
}

function createNumberInput(value, step) {
  const input = document.createElement("input");
  input.type = "number";
  input.step = step;
  input.className = "tilia-control-select tilia-track-editor-v2-input";
  input.value = value == null ? "" : String(value);
  return input;
}

export function createPointForm(selection, onPatch) {
  const root = document.createElement("div");
  root.className = "tilia-track-editor-v2-form";
  if (!selection?.point) {
    root.textContent = "Select an editable point to edit its values.";
    return root;
  }

  const { point } = selection;
  const lat = createNumberInput(point.lat, "0.000001");
  const lon = createNumberInput(point.lon, "0.000001");
  const elevation = createNumberInput(point.elevation, "0.1");
  const timestamp = document.createElement("input");
  timestamp.type = "datetime-local";
  timestamp.step = "1";
  timestamp.className = "tilia-control-select tilia-track-editor-v2-input";
  timestamp.value = formatTimestampForDateTimeLocal(point.timestamp);

  function apply() {
    const nextLat = Number(lat.value);
    const nextLon = Number(lon.value);
    const nextElevation = elevation.value === "" ? null : Number(elevation.value);
    const nextTimestamp = parseDateTimeLocal(timestamp.value);
    if (lat.value === "" || lon.value === "" || !Number.isFinite(nextLat) || !Number.isFinite(nextLon)
      || (elevation.value !== "" && !Number.isFinite(nextElevation)) || !nextTimestamp.valid) {
      return;
    }
    onPatch({
      lat: nextLat,
      lon: nextLon,
      elevation: nextElevation,
      timestamp: nextTimestamp.value,
    });
  }

  for (const input of [lat, lon, elevation, timestamp]) {
    input.addEventListener("change", apply);
    input.addEventListener("blur", apply);
  }

  appendField(root, "Latitude", lat);
  appendField(root, "Longitude", lon);
  appendField(root, "Elevation (m)", elevation);
  appendField(root, "Timestamp", timestamp);
  return root;
}
