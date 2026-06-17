export function createAppState() {
  return {
    nextEntryId: 1,
    nextTrackStylePresetIndex: 0,
    gpxVisibility: {
      tracks: true,
      waypoints: true,
    },
    entries: [],
    sources: [],
    layers: [],
    lastError: null,
  };
}

export function claimNextTrackStylePresetIndex(state, presetCount) {
  const nextIndex = Number.isInteger(state.nextTrackStylePresetIndex)
    ? state.nextTrackStylePresetIndex
    : 0;

  if (!Number.isInteger(presetCount) || presetCount <= 0) {
    state.nextTrackStylePresetIndex = 0;
    return 0;
  }

  state.nextTrackStylePresetIndex = (nextIndex + 1) % presetCount;
  return nextIndex % presetCount;
}

export function addEntry(state, entry) {
  const nextEntry = {
    ...entry,
    id: state.nextEntryId,
  };
  state.nextEntryId += 1;
  state.entries.push(nextEntry);
  state.sources.push(nextEntry.source);
  state.layers.push(nextEntry.layer);
  return nextEntry;
}

export function clearLayers(state, teardown) {
  for (const layer of state.layers) {
    teardown(layer);
  }
  state.layers = [];
}

export function clearSources(state) {
  state.sources = [];
}

export function clearEntries(state) {
  state.entries = [];
}

export function removeEntry(state, entryId) {
  const index = state.entries.findIndex((candidate) => candidate.id === entryId);
  if (index < 0) {
    return null;
  }

  const [entry] = state.entries.splice(index, 1);
  state.sources.splice(index, 1);
  state.layers.splice(index, 1);
  return entry;
}

export function replaceEntryPresentation(state, entryId, presentation) {
  const entry = state.entries.find((candidate) => candidate.id === entryId);
  if (!entry) {
    return null;
  }

  const index = state.entries.indexOf(entry);
  if (presentation.layer) {
    entry.layer = presentation.layer;
    state.layers[index] = presentation.layer;
  }
  if (presentation.interactions) {
    entry.interactions = presentation.interactions;
  }
  if (Object.hasOwn(presentation, "visible")) {
    entry.visible = presentation.visible;
  }
  if (presentation.presentation) {
    entry.presentation = {
      ...(entry.presentation || {}),
      ...presentation.presentation,
    };
  }
  return entry;
}

export function replaceEntrySource(state, entryId, nextSource) {
  const entry = state.entries.find((candidate) => candidate.id === entryId);
  if (!entry) {
    return null;
  }

  const index = state.entries.indexOf(entry);
  entry.source = nextSource;
  state.sources[index] = nextSource;
  return entry;
}

export function setError(state, error) {
  state.lastError = error;
}
