import { createPhotoPopupContent, createWaypointPopupContent } from "../map/layers.js";

export function createSelectionHub(map) {
  let activeSelection = null;
  const subscribers = new Set();

  function notify() {
    for (const subscriber of subscribers) {
      subscriber(activeSelection);
    }
  }

  function openPopup({ latlng, content, panTo = false, className = "tilia-info-popup-window", closeOnClick = false }) {
    if (!latlng || !content) {
      return;
    }
    if (panTo) {
      map.panTo(latlng);
    }
    map.openPopup(content, latlng, {
      className,
      closeOnClick,
    });
  }

  function setSelection(selection) {
    activeSelection = selection;
    notify();
    return activeSelection;
  }

  return {
    getSelection() {
      return activeSelection;
    },
    clearSelection() {
      return setSelection(null);
    },
    subscribe(listener) {
      subscribers.add(listener);
      listener(activeSelection);
      return () => {
        subscribers.delete(listener);
      };
    },
    openPopup,
    selectTrack(entry) {
      return setSelection({ kind: "track", entry });
    },
    selectWaypoint(entry, waypoint, options = {}) {
      if (options.openPopup !== false) {
        openPopup({
          latlng: [waypoint?.lat, waypoint?.lon],
          content: createWaypointPopupContent(entry.source?.name, waypoint),
          panTo: options.panTo === true,
        });
      }
      return setSelection({ kind: "waypoint", entry, waypoint });
    },
    selectPhoto(entry, options = {}) {
      if (options.openPopup !== false) {
        openPopup({
          latlng: [entry.source?.lat, entry.source?.lon],
          content: createPhotoPopupContent(entry.source),
          panTo: options.panTo !== false,
        });
      }
      return setSelection({ kind: "photo", entry });
    },
  };
}