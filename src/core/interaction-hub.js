export function createInteractionHub(getEntries) {
  const subscribers = new Set();

  function bindEntry(subscriber, entry) {
    if (entry.kind === "gpx") {
      const trackLayer = entry.interactions?.trackLayer;
      if (trackLayer && subscriber.onTrackLayer && !subscriber.boundTrackLayers.has(trackLayer)) {
        subscriber.boundTrackLayers.add(trackLayer);
        subscriber.onTrackLayer({ entry, layer: trackLayer });
      }

      const waypoints = entry.interactions?.waypoints || [];
      for (const waypointHandle of waypoints) {
        const waypointLayer = waypointHandle.layer;
        if (!waypointLayer || !subscriber.onWaypointLayer || subscriber.boundWaypointLayers.has(waypointLayer)) {
          continue;
        }
        subscriber.boundWaypointLayers.add(waypointLayer);
        subscriber.onWaypointLayer({
          entry,
          layer: waypointLayer,
          waypoint: waypointHandle.waypoint,
        });
      }
    }

    if (entry.kind === "photo") {
      const marker = entry.interactions?.marker;
      if (marker && subscriber.onPhotoMarker && !subscriber.boundPhotoMarkers.has(marker)) {
        subscriber.boundPhotoMarkers.add(marker);
        subscriber.onPhotoMarker({ entry, layer: marker });
      }
    }
  }

  function syncEntry(entry) {
    for (const subscriber of subscribers) {
      bindEntry(subscriber, entry);
    }
  }

  function subscribe(handlers) {
    const subscriber = {
      onTrackLayer: handlers.onTrackLayer || null,
      onWaypointLayer: handlers.onWaypointLayer || null,
      onPhotoMarker: handlers.onPhotoMarker || null,
      boundTrackLayers: new WeakSet(),
      boundWaypointLayers: new WeakSet(),
      boundPhotoMarkers: new WeakSet(),
    };
    subscribers.add(subscriber);

    for (const entry of getEntries()) {
      bindEntry(subscriber, entry);
    }

    return () => {
      subscribers.delete(subscriber);
    };
  }

  return {
    subscribe,
    syncEntry,
  };
}