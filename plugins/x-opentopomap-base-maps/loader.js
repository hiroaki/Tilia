const openTopoMapDefinition = Object.freeze({
	id: "opentopomap",
	label: "OpenTopoMap",
	provider: "opentopomap",
	category: "topo",
	url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
	options: {
		maxZoom: 17,
		subdomains: ["a", "b", "c"],
		attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="https://www2.jpl.nasa.gov/srtm/">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org/about">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
	},
	attributionLabel: "OpenTopoMap",
	visibleInSelector: true,
});

const openTopoMapPlugin = {
	id: "x-opentopomap-base-maps",
	setup(app) {
		if (!app.baseMaps?.register) {
			throw new Error('Plugin "x-opentopomap-base-maps" requires app.baseMaps.register(definition)');
		}

		const registeredDefinition = app.baseMaps.register(openTopoMapDefinition);
		return {
			definitionId: registeredDefinition.id,
		};
	},
};

export { openTopoMapDefinition, openTopoMapPlugin };
export default openTopoMapPlugin;