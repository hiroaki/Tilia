import { installDropzonePlugin } from "./plugins/input/dropzone.js";
import { installFileImportControl } from "./plugins/input/file-import.js";
import { installUrlImportControl } from "./plugins/input/url-import.js";
import { installElevationPanelControl } from "./plugins/ui/elevation-panel.js";
import { installLayersControl } from "./plugins/ui/layers-control.js";
import { installPanelPlugin } from "./plugins/ui/panel.js";
import { installSettingsPanelControl } from "./plugins/ui/settings-panel.js";
import { installStatusControl } from "./plugins/ui/status-control.js";

function definePlugin(spec) {
	return Object.freeze(spec);
}

export const panel = definePlugin({
	id: "tilia-panel",
	setup(app) {
		return installPanelPlugin({ map: app.map });
	},
});

export const status = definePlugin({
	id: "tilia-status",
	setup(app) {
		return installStatusControl({ map: app.map });
	},
});

export const layers = definePlugin({
	id: "tilia-layers",
	requires: ["tilia-panel", "tilia-status"],
	setup(app, options = {}) {
		const api = installLayersControl({
			map: app.map,
			core: app.core,
			panel: app.services["tilia-panel"],
			onStatus: app.setStatus,
			onError: app.setError,
			onEntriesChanged: () => app.refreshView(),
			...options,
		});
		api.render();
		app.addRefreshHandler(() => api.render());
		return api;
	},
});

export const elevation = definePlugin({
	id: "tilia-elevation",
	requires: ["tilia-panel", "tilia-status"],
	setup(app, options = {}) {
		const api = installElevationPanelControl({
			map: app.map,
			core: app.core,
			panel: app.services["tilia-panel"],
			onStatus: app.setStatus,
			...options,
		});
		api.refresh();
		app.addRefreshHandler(() => api.refresh());
		return api;
	},
});

export const fileImport = definePlugin({
	id: "tilia-file-import",
	setup(app, options = {}) {
		return installFileImportControl({
			map: app.map,
			registry: app.registry,
			context: app.context,
			onStatus: app.setStatus,
			onError: app.setError,
			onItemLoaded: () => app.refreshView(),
			...options,
		});
	},
});

export const urlImport = definePlugin({
	id: "tilia-url-import",
	setup(app, options = {}) {
		return installUrlImportControl({
			map: app.map,
			registry: app.registry,
			context: app.context,
			onStatus: app.setStatus,
			onError: app.setError,
			onItemLoaded: () => app.refreshView(),
			...options,
		});
	},
});

export const settings = definePlugin({
	id: "tilia-settings",
	requires: ["tilia-panel", "tilia-status"],
	setup(app, options = {}) {
		return installSettingsPanelControl({
			map: app.map,
			core: app.core,
			panel: app.services["tilia-panel"],
			onStatus: app.setStatus,
			...options,
		});
	},
});

export const dropzone = definePlugin({
	id: "tilia-dropzone",
	setup(app, options = {}) {
		installDropzonePlugin({
			dropTarget: options.target || app.map.getContainer(),
			registry: app.registry,
			context: app.context,
			onStatus: app.setStatus,
			onError: app.setError,
			onItemLoaded: () => app.refreshView(),
		});
		return { target: options.target || app.map.getContainer() };
	},
});

// Expose the built-in plugin set as a registry for string-based app.use(...) lookups.
export const builtins = Object.freeze({
	panel,
	status,
	layers,
	elevation,
	fileImport,
	urlImport,
	settings,
	dropzone,
	"tilia-panel": panel,
	"tilia-status": status,
	"tilia-layers": layers,
	"tilia-elevation": elevation,
	"tilia-file-import": fileImport,
	"tilia-url-import": urlImport,
	"tilia-settings": settings,
	"tilia-dropzone": dropzone,
});