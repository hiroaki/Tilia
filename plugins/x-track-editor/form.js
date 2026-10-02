function pad(value) {
  return String(value).padStart(2, "0");
}

const FIELD_DEFINITIONS = [
  { property: "lat", label: "Lat", type: "number", step: "0.000001" },
  { property: "lon", label: "Lon", type: "number", step: "0.000001" },
  { property: "elevation", label: "Ele", type: "number", step: "0.1" },
  { property: "timestamp", label: "Time", type: "datetime-local", step: "1" },
];

export function describePointSelection(selectedPoints) {
  const count = selectedPoints.length;
  if (count === 0) return { kind: "empty", count, label: "No editable point selected" };
  return { kind: count === 1 ? "single" : "multiple", count, label: `${count} ${count === 1 ? "point" : "points"} selected` };
}

export function formatTimestampForDateTimeLocal(timestamp) {
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatTimestampForInspector(timestamp) {
  if (!Number.isFinite(timestamp)) return "—";
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseDateTimeLocal(value) {
  if (!value) return { valid: true, value: null };
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? { valid: true, value: timestamp } : { valid: false, value: null };
}

export function formatPointProperty(point, property) {
  const value = point[property];
  if (property === "timestamp") return formatTimestampForInspector(value);
  if (!Number.isFinite(value)) return "—";
  return property === "lat" || property === "lon" ? value.toFixed(5) : value.toFixed(1);
}

export function formatPointPropertyForEdit(point, property) {
  const value = point[property];
  if (property === "timestamp") return formatTimestampForDateTimeLocal(value);
  return value == null ? "" : String(value);
}

export function parsePointProperty(property, value) {
  if (property === "timestamp") return parseDateTimeLocal(value);
  if (property === "elevation" && value === "") return { valid: true, value: null };
  const parsed = Number(value);
  return value !== "" && Number.isFinite(parsed)
    ? { valid: true, value: parsed }
    : { valid: false, value: null };
}

export function isFormTarget(target) {
  return target instanceof HTMLElement
    && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
}

export function createPointInspector(selectedPoints, inspector, callbacks) {
  const root = document.createElement("div");
  root.className = "tilia-track-editor-inspector";
  if (selectedPoints.length === 0) {
    root.classList.add("tilia-track-editor-inspector-empty");
    root.textContent = "Select editable points to inspect their values.";
    return root;
  }

  const header = document.createElement("div");
  header.className = "tilia-track-editor-inspector-grid tilia-track-editor-inspector-header";
  for (const { label } of FIELD_DEFINITIONS) {
    const cell = document.createElement("span");
    cell.textContent = label;
    header.appendChild(cell);
  }
  root.appendChild(header);

  const rows = document.createElement("div");
  rows.className = "tilia-track-editor-inspector-rows";
  rows.scrollTop = inspector.scrollTop || 0;
  rows.addEventListener("scroll", () => callbacks.onScroll(rows.scrollTop));

  for (const selectedPoint of selectedPoints) {
    const row = document.createElement("div");
    row.className = "tilia-track-editor-inspector-grid tilia-track-editor-inspector-row";
    row.dataset.pointId = selectedPoint.pointId;
    row.classList.toggle("tilia-track-editor-inspector-row-focused", inspector.focusedPointId === selectedPoint.pointId);
    row.addEventListener("focusin", () => callbacks.onFocus(selectedPoint.pointId));

    for (const field of FIELD_DEFINITIONS) {
      const isEditing = inspector.editingCell?.pointId === selectedPoint.pointId
        && inspector.editingCell.property === field.property;
      if (isEditing) {
        const input = document.createElement("input");
        input.type = field.type;
        input.step = field.step;
        input.value = inspector.editingCell.draftValue;
        input.className = "tilia-track-editor-cell-input";
        input.setAttribute("aria-label", `${field.label} value`);
        input.classList.toggle("tilia-track-editor-cell-input-invalid", Boolean(inspector.editingCell.error));
        if (inspector.editingCell.error) {
          input.setAttribute("aria-invalid", "true");
          input.title = inspector.editingCell.error;
        }
        input.addEventListener("input", () => callbacks.onDraftChange(input.value));
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            callbacks.onCommit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            callbacks.onCancel();
          }
        });
        input.addEventListener("blur", () => callbacks.onCommit());
        row.appendChild(input);
        queueMicrotask(() => {
          rows.scrollTop = inspector.scrollTop || 0;
          input.focus();
          input.select();
        });
      } else {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "tilia-track-editor-cell";
        cell.textContent = formatPointProperty(selectedPoint.point, field.property);
        cell.title = `Edit ${field.label}`;
        cell.setAttribute("aria-label", `Edit ${field.label}: ${cell.textContent}`);
        cell.addEventListener("click", () => callbacks.onBeginEdit({
          pointId: selectedPoint.pointId,
          property: field.property,
          draftValue: formatPointPropertyForEdit(selectedPoint.point, field.property),
        }));
        row.appendChild(cell);
      }
    }
    rows.appendChild(row);
  }
  root.appendChild(rows);
  queueMicrotask(() => { rows.scrollTop = inspector.scrollTop || 0; });
  return root;
}
