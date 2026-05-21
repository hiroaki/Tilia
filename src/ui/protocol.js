export const TILIA_CONTROL_PRIORITY = Object.freeze({
  low: "low",
  normal: "normal",
  high: "high",
});

export const TILIA_UI_LAYER = Object.freeze({
  panel: "panel",
  floating: "floating",
  control: "control",
});

export const TILIA_UI_STYLESHEET_ID = "tilia-core-ui";

export const TILIA_UI_LAYER_Z_INDEX = Object.freeze({
  panel: 900,
  floating: 950,
});

export const TILIA_BUILTIN_UI_DEFAULTS = Object.freeze({
  "tilia-base-maps-control": Object.freeze({ position: "topright", priority: TILIA_CONTROL_PRIORITY.normal }),
  "tilia-elevation": Object.freeze({ position: "topleft", priority: TILIA_CONTROL_PRIORITY.normal }),
  "tilia-file-import": Object.freeze({ position: "topleft", priority: TILIA_CONTROL_PRIORITY.high }),
  "tilia-layers": Object.freeze({ position: "topleft", priority: TILIA_CONTROL_PRIORITY.normal }),
  "tilia-settings": Object.freeze({ position: "topleft", priority: TILIA_CONTROL_PRIORITY.normal }),
  "tilia-status": Object.freeze({ position: "bottomleft", priority: TILIA_CONTROL_PRIORITY.low }),
  "tilia-url-import": Object.freeze({ position: "topleft", priority: TILIA_CONTROL_PRIORITY.normal }),
});

export function resolveBuiltinUiOptions(pluginId, options = {}) {
  return {
    ...(TILIA_BUILTIN_UI_DEFAULTS[pluginId] || {}),
    ...(options && typeof options === "object" ? options : {}),
  };
}