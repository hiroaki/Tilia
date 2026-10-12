// Lazy metadata lets dependency planning run without evaluating optional implementations.
export const builtinPluginCatalog = Object.freeze([
  Object.freeze({ id: "tilia-toolbar", requires: Object.freeze([]), load: () => import("./plugins/ui/toolbar.js") }),
  Object.freeze({ id: "tilia-gpx-renderer", requires: Object.freeze(["tilia-gpx-domain"]), load: () => import("./plugins/renderers/gpx.js") }),
  Object.freeze({ id: "tilia-gpx-input", requires: Object.freeze(["tilia-gpx-domain"]), load: () => import("./plugins/input/gpx.js") }),
  Object.freeze({ id: "tilia-gpx-ui", requires: Object.freeze(["tilia-gpx-domain"]), load: () => import("./plugins/ui/gpx.js") }),

  Object.freeze({ id: "tilia-photo-renderer", requires: Object.freeze(["tilia-photo-domain"]), load: () => import("./plugins/renderers/photo.js") }),
  Object.freeze({ id: "tilia-jpeg-input", requires: Object.freeze(["tilia-photo-domain"]), load: () => import("./plugins/input/jpeg.js") }),
  Object.freeze({ id: "tilia-photo-ui", requires: Object.freeze(["tilia-photo-domain"]), load: () => import("./plugins/ui/photo.js") }),
  Object.freeze({ id: "tilia-map-selection-presenter", requires: Object.freeze([]), load: () => import("./plugins/ui/map-selection-presenter.js") }),
  Object.freeze({ id: "tilia-panel", requires: Object.freeze([]), load: () => import("./plugins/ui/panel.js") }),
  Object.freeze({ id: "tilia-status", requires: Object.freeze([]), load: () => import("./plugins/ui/status-control.js") }),
  Object.freeze({ id: "tilia-base-maps-control", requires: Object.freeze([]), load: () => import("./plugins/ui/base-map-control.js") }),
  Object.freeze({ id: "tilia-layers", requires: Object.freeze(["tilia-panel", "tilia-toolbar"]), load: () => import("./plugins/ui/layers-control.js") }),
  Object.freeze({ id: "tilia-elevation", requires: Object.freeze(["tilia-panel", "tilia-toolbar", "tilia-gpx-domain"]), load: () => import("./plugins/ui/elevation-panel.js") }),
  Object.freeze({ id: "tilia-file-import", requires: Object.freeze(["tilia-toolbar"]), load: () => import("./plugins/input/file-import.js") }),
  Object.freeze({ id: "tilia-url-import", requires: Object.freeze(["tilia-toolbar"]), load: () => import("./plugins/input/url-import.js") }),
  Object.freeze({ id: "tilia-query-import", requires: Object.freeze([]), load: () => import("./plugins/input/query-import.js") }),
  Object.freeze({ id: "tilia-settings", requires: Object.freeze(["tilia-panel", "tilia-toolbar"]), load: () => import("./plugins/ui/settings-panel.js") }),
  Object.freeze({ id: "tilia-dropzone", requires: Object.freeze([]), load: () => import("./plugins/input/dropzone.js") }),
  Object.freeze({ id: "tilia-gpx-domain", requires: Object.freeze([]), load: () => import("./plugins/domains/gpx.js") }),
  Object.freeze({ id: "tilia-photo-domain", requires: Object.freeze([]), load: () => import("./plugins/domains/photo.js") }),
]);

export const builtins = builtinPluginCatalog;
