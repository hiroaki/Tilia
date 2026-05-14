const gsiAttribution = '<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>';

const gsiBaseLayerDefinitions = Object.freeze([
	Object.freeze({
		id: "gsi-std",
		label: "GSI Standard",
		provider: "gsi",
		category: "street",
		url: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
		options: {
			attribution: gsiAttribution,
		},
		attributionLabel: "国土地理院",
		visibleInSelector: true,
	}),
	Object.freeze({
		id: "gsi-pale",
		label: "GSI Pale",
		provider: "gsi",
		category: "street",
		url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
		options: {
			attribution: gsiAttribution,
		},
		attributionLabel: "国土地理院",
		visibleInSelector: true,
	}),
]);

const gsiPlugin = {
	id: "x-gsi-base-maps",
	setup(app) {
		if (!app.baseMaps?.registerMany) {
			throw new Error('Plugin "x-gsi-base-maps" requires app.baseMaps.registerMany(definitions)');
		}

		const registeredDefinitions = app.baseMaps.registerMany(gsiBaseLayerDefinitions);
		return {
			definitionIds: registeredDefinitions.map((definition) => definition.id),
		};
	},
};

export { gsiBaseLayerDefinitions, gsiPlugin };
export default gsiPlugin;