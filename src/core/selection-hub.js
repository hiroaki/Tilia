import { Popup } from "leaflet";
import {
  createPhotoPopupContent,
  createRoutePointPopupContent,
  createTrackPointPopupContent,
  createWaypointPopupContent,
} from "../map/layers.js";

export function createSelectionHub(map) {
  let activeSelection = null;
  let activePopup = null;
  let currentTransitionId = 0;
  const subscribers = new Set();

  function notify() {
    for (const subscriber of subscribers) {
      subscriber(activeSelection);
    }
  }

  function clearSelectionState() {
    const hadSelection = activeSelection !== null;
    activePopup = null;
    activeSelection = null;
    if (hadSelection) {
      notify();
    }
  }

  function createPopup({ latlng, content, panTo = false, className = "tilia-info-popup-window", closeOnClick = false }) {
    if (!latlng || !content) {
      return null;
    }

    return {
      popup: new Popup({ className, closeOnClick })
        .setLatLng(latlng)
        .setContent(content),
      latlng,
      panTo,
    };
  }

  function closePopup(popup) {
    if (popup) {
      map.closePopup?.(popup);
    }
  }

  function disposeFailedPopup(popup) {
    if (activePopup === popup) {
      activePopup = null;
    }
    try {
      popup?.close();
    } catch {
      // Preserve the original popup-opening error.
    }
  }

  function transitionSelection(selection, popupOptions = null) {
    const transitionId = ++currentTransitionId;
    const nextPopupState = popupOptions ? createPopup(popupOptions) : null;
    const nextPopup = nextPopupState?.popup || null;
    const previousSelection = activeSelection;
    const previousPopup = activePopup;

    activeSelection = selection;
    activePopup = nextPopup;
    closePopup(previousPopup);

    if (transitionId !== currentTransitionId || activeSelection !== selection || activePopup !== nextPopup) {
      return activeSelection;
    }

    try {
      if (nextPopupState?.panTo) {
        map.panTo(nextPopupState.latlng);
      }
      if (transitionId !== currentTransitionId || activeSelection !== selection || activePopup !== nextPopup) {
        return activeSelection;
      }
      if (nextPopup) {
        map.openPopup(nextPopup);
      }
    } catch (error) {
      if (transitionId === currentTransitionId && activeSelection === selection && activePopup === nextPopup) {
        activeSelection = null;
        disposeFailedPopup(nextPopup);
        if (previousSelection !== null) {
          notify();
        }
      }
      throw error;
    }

    if (transitionId === currentTransitionId && activeSelection === selection && activePopup === nextPopup) {
      notify();
    }
    return activeSelection;
  }

  function openPopup(options) {
    const nextPopupState = createPopup(options);
    if (!nextPopupState) {
      return;
    }
    const transitionId = ++currentTransitionId;

    const previousPopup = activePopup;
    activePopup = nextPopupState.popup;
    closePopup(previousPopup);

    if (transitionId !== currentTransitionId || activePopup !== nextPopupState.popup) {
      return;
    }

    try {
      if (nextPopupState.panTo) {
        map.panTo(nextPopupState.latlng);
      }
      if (transitionId !== currentTransitionId || activePopup !== nextPopupState.popup) {
        return;
      }
      return map.openPopup(nextPopupState.popup);
    } catch (error) {
      if (transitionId === currentTransitionId && activePopup === nextPopupState.popup) {
        disposeFailedPopup(nextPopupState.popup);
      }
      throw error;
    }
  }

  map.on?.("popupclose", (event) => {
    if (event?.popup !== activePopup) {
      return;
    }
    currentTransitionId += 1;
    clearSelectionState();
  });

  return {
    getSelection() {
      return activeSelection;
    },
    clearSelection() {
      return transitionSelection(null);
    },
    clearSelectionForEntry(entryId) {
      if (activeSelection?.entry?.id !== entryId) {
        return false;
      }

      transitionSelection(null);
      return true;
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
      return transitionSelection({ kind: "track", entry });
    },
    selectTrackPoint(entry, point, options = {}) {
      return transitionSelection(
        { kind: "track-point", entry, point },
        options.openPopup !== false ? {
          latlng: [point?.lat, point?.lon],
          content: createTrackPointPopupContent(entry.source, point),
          panTo: options.panTo !== false,
        } : null,
      );
    },
    selectRoutePoint(entry, routePoint, locator, options = {}) {
      return transitionSelection(
        { kind: "route-point", entry, routePoint, locator },
        options.openPopup !== false ? {
          latlng: [routePoint?.lat, routePoint?.lon],
          content: createRoutePointPopupContent(entry.source, routePoint, locator),
          panTo: options.panTo === true,
        } : null,
      );
    },
    selectWaypoint(entry, waypoint, options = {}) {
      return transitionSelection(
        { kind: "waypoint", entry, waypoint },
        options.openPopup !== false ? {
          latlng: [waypoint?.lat, waypoint?.lon],
          content: createWaypointPopupContent(entry.source?.name, waypoint),
          panTo: options.panTo === true,
        } : null,
      );
    },
    selectPhoto(entry, options = {}) {
      return transitionSelection(
        { kind: "photo", entry },
        options.openPopup !== false ? {
          latlng: [entry.source?.lat, entry.source?.lon],
          content: createPhotoPopupContent(entry.source),
          panTo: options.panTo !== false,
        } : null,
      );
    },
  };
}
