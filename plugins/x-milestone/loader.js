import { DivIcon, Marker } from "leaflet";

const defaultIntervalDefinition = Object.freeze({
	mapping: {
		5: 400000,
		6: 300000,
		7: 200000,
		8: 100000,
		9: 100000,
		10: 50000,
		11: 50000,
		12: 20000,
		13: 20000,
		14: 10000,
		15: 10000,
		16: 2000,
		17: 2000,
		18: 1000,
		19: 1000,
	},
	minZoom: 5,
	maxZoom: 20,
	maxNumberOfSigns: 100,
	minIntervalMeters: 100,
});

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function resolveInterval(fullLengthMeters, zoom, definition) {
	const roundedZoom = Math.trunc(Number(zoom) || definition.minZoom);
	let interval = roundedZoom < definition.maxZoom
		? (definition.mapping[roundedZoom] || definition.minIntervalMeters)
		: definition.minIntervalMeters;
	const minInterval = fullLengthMeters / definition.maxNumberOfSigns;

	if (interval <= minInterval) {
		for (let candidateZoom = roundedZoom - 1; candidateZoom >= definition.minZoom && interval <= minInterval; candidateZoom -= 1) {
			interval = candidateZoom < definition.maxZoom
				? (definition.mapping[candidateZoom] || definition.minIntervalMeters)
				: definition.minIntervalMeters;
		}
	}

	return Math.max(interval, definition.minIntervalMeters);
}

function buildMilestones(trackPointDetails, intervalMeters) {
	const milestones = [];
	let nextCheckpoint = intervalMeters;

	for (let index = 1; index < trackPointDetails.length; index += 1) {
		const point = trackPointDetails[index];
		const distanceMeters = Number(point?.distanceMeters);
		if (!Number.isFinite(distanceMeters)) {
			continue;
		}

		while (nextCheckpoint <= distanceMeters) {
			milestones.push({
				index,
				lat: point.lat,
				lon: point.lon,
				distanceMeters: nextCheckpoint,
			});
			nextCheckpoint += intervalMeters;
		}
	}

	return milestones;
}

function formatMilestoneLabel(distanceMeters) {
	if (distanceMeters >= 1000) {
		const kilometers = distanceMeters / 1000;
		const digits = Number.isInteger(kilometers) ? 0 : 1;
		return `${kilometers.toFixed(digits)} km`;
	}
	return `${Math.round(distanceMeters)} m`;
}

function createMilestoneMarker(milestone, options) {
	const label = escapeHtml(options.formatLabel(milestone.distanceMeters));
	return new Marker([milestone.lat, milestone.lon], {
		interactive: false,
		keyboard: false,
		pane: options.pane,
		zIndexOffset: options.zIndexOffset,
		icon: new DivIcon({
			className: "",
			html: `<span style="display:inline-block;padding:1px 5px;border:1px solid #0f766e33;border-radius:999px;background:#fffcf7f0;color:#134e4a;font:600 11px/1.4 'Hiragino Sans','Yu Gothic',sans-serif;white-space:nowrap;box-shadow:0 2px 8px #00000014;">${label}</span>`,
		}),
	});
}

function createTrackState(entry, layer) {
	return {
		entry,
		layer,
		markers: [],
		milestoneCache: new Map(),
		currentInterval: null,
	};
}

function clearTrackMarkers(trackState) {
	for (const marker of trackState.markers) {
		marker.remove();
	}
	trackState.markers = [];
	trackState.currentInterval = null;
}

export const milestonePlugin = {
	id: "x-milestone",
	setup(app, options = {}) {
		if (!app.subscribeInteractions) {
			throw new Error('Plugin "x-milestone" requires interaction subscriptions');
		}

		const config = {
			intervalDefinition: defaultIntervalDefinition,
			formatLabel: formatMilestoneLabel,
			pane: "markerPane",
			zIndexOffset: -1000,
			...options,
		};
		const map = app.getMap();
		const tracks = new Map();
		let destroyed = false;

		function renderTrack(trackState) {
			if (destroyed) {
				return;
			}
			const trackPointDetails = trackState.entry.source?.trackPointDetails;
			if (!Array.isArray(trackPointDetails) || trackPointDetails.length < 2) {
				clearTrackMarkers(trackState);
				return;
			}

			if (trackState.entry.visible === false || !map.hasLayer(trackState.layer)) {
				clearTrackMarkers(trackState);
				return;
			}

			const fullLengthMeters = Number(trackPointDetails[trackPointDetails.length - 1]?.distanceMeters);
			if (!Number.isFinite(fullLengthMeters) || fullLengthMeters < config.intervalDefinition.minIntervalMeters) {
				clearTrackMarkers(trackState);
				return;
			}

			const intervalMeters = resolveInterval(fullLengthMeters, map.getZoom(), config.intervalDefinition);
			if (trackState.currentInterval === intervalMeters && trackState.markers.length > 0) {
				return;
			}

			clearTrackMarkers(trackState);

			let milestones = trackState.milestoneCache.get(intervalMeters);
			if (!milestones) {
				milestones = buildMilestones(trackPointDetails, intervalMeters);
				trackState.milestoneCache.set(intervalMeters, milestones);
			}

			trackState.markers = milestones.map((milestone) => {
				const marker = createMilestoneMarker(milestone, config);
				marker.addTo(map);
				return marker;
			});
			trackState.currentInterval = intervalMeters;
		}

		function refresh() {
			if (destroyed) {
				return;
			}
			for (const [entryId, trackState] of tracks) {
				if (!app.state.entries.some((entry) => entry.id === entryId)) {
					clearTrackMarkers(trackState);
					tracks.delete(entryId);
					continue;
				}
				renderTrack(trackState);
			}
		}

		const unsubscribeInteractions = app.subscribeInteractions({
			onTrackLayer({ entry, layer }) {
				const trackState = createTrackState(entry, layer);
				tracks.set(entry.id, trackState);
				layer.on("add", () => renderTrack(trackState));
				layer.on("remove", () => clearTrackMarkers(trackState));
				renderTrack(trackState);
			},
		});

		map.on("zoomend", refresh);
		const removeRefreshHandler = app.addRefreshHandler(refresh);

		return {
			refresh,
			getTrackCount() {
				return tracks.size;
			},
			destroy() {
				destroyed = true;
				unsubscribeInteractions();
				removeRefreshHandler();
				map.off("zoomend", refresh);
				for (const trackState of tracks.values()) {
					clearTrackMarkers(trackState);
				}
				tracks.clear();
			},
		};
	},
};

export default milestonePlugin;