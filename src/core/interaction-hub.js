export function createInteractionHub(getEntries) {
  const subscribers = new Set();

  function bindEntry(subscriber, entry) {
    if (entry.kind === "gpx") {
      const trackLayers = entry.interactions?.trackLayers || [];
      for (const trackHandle of trackLayers) {
        const trackLayer = trackHandle?.layer;
        if (!trackLayer || !subscriber.onTrackLayer || subscriber.boundTrackLayers.has(trackLayer)) continue;
        subscriber.boundTrackLayers.add(trackLayer);
        subscriber.onTrackLayer({ entry, layer: trackLayer, trackIndex: trackHandle.trackIndex });
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
      boundTrackLayers: new WeakSet(),
      boundWaypointLayers: new WeakSet(),
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