// Metadata stays separate from implementation imports so dependency planning and
// migration classification never evaluate disabled plugin modules.
export const builtinPluginCatalog = Object.freeze([
  Object.freeze({ id: "tilia-panel", requires: Object.freeze([]), load: () => import("./plugins/ui/panel.js") }),
  Object.freeze({ id: "tilia-status", requires: Object.freeze([]), load: () => import("./plugins/ui/status-control.js") }),
  Object.freeze({ id: "tilia-base-maps-control", requires: Object.freeze([]), load: () => import("./plugins/ui/base-map-control.js") }),
  Object.freeze({ id: "tilia-layers", requires: Object.freeze(["tilia-panel"]), load: () => import("./plugins/ui/layers-control.js") }),
  Object.freeze({ id: "tilia-elevation", requires: Object.freeze(["tilia-panel"]), load: () => import("./plugins/ui/elevation-panel.js") }),
  Object.freeze({ id: "tilia-file-import", requires: Object.freeze([]), load: () => import("./plugins/input/file-import.js") }),
  Object.freeze({ id: "tilia-url-import", requires: Object.freeze([]), load: () => import("./plugins/input/url-import.js") }),
  Object.freeze({ id: "tilia-query-import", requires: Object.freeze([]), load: () => import("./plugins/input/query-import.js") }),
  Object.freeze({ id: "tilia-settings", requires: Object.freeze(["tilia-panel"]), load: () => import("./plugins/ui/settings-panel.js") }),
  Object.freeze({ id: "tilia-dropzone", requires: Object.freeze([]), load: () => import("./plugins/input/dropzone.js") }),
]);

export const builtins = builtinPluginCatalog;
