// Canonical visibility only: renderer availability and editing suppression are
// deliberately excluded. This policy belongs to checkbox consumers, not APIs.
export function isGpxTargetVisible({ data, preferences }, ref) {
  const trackVisible = (index) => !!data.tracks[index] && preferences.tracksVisible && preferences.trackVisibility[index] !== false;
  switch (ref.kind) {
    case "track": case "segment": case "track-point": return trackVisible(ref.trackIndex);
    case "route": case "route-point": return !!data.routes[ref.routeIndex] && preferences.routesVisible;
    case "waypoint": return !!data.waypoints[ref.waypointIndex] && preferences.waypointsVisible;
    case "document": return data.tracks.some((_, index) => trackVisible(index))
      || (data.routes.length > 0 && preferences.routesVisible)
      || (data.waypoints.length > 0 && preferences.waypointsVisible);
    default: return false;
  }
}

export async function clearSelectionHiddenByGpxCheckbox({ scope, entry, entries, gpx, selection }, before, gate) {
  if (gate.visible || !scope.alive || (entries && !entries.get(entry.id))) return;
  const selected = selection.getCurrent();
  if (selected?.entryId !== entry.id || selected.domain !== entry.domain) return;
  const latest = gpx.get(entry.id);
  if (!latest.entry.visible) return;
  if (selected.ref.kind !== "document" && selected.ref.revision !== latest.revision) return;
  const { preferences } = latest.snapshot;
  // Only the gate changed by this operation can revoke UI selection. A no-op
  // hide, a show, or an unrelated already-hidden ancestor must not clear it.
  const changedToHidden = gate.category
    ? before.snapshot.preferences[`${gate.category}Visible`] && !preferences[`${gate.category}Visible`]
    : before.snapshot.preferences.trackVisibility[gate.trackIndex] !== false && preferences.trackVisibility[gate.trackIndex] === false;
  const withoutHide = { ...latest.snapshot, preferences: gate.category
    ? { ...preferences, [`${gate.category}Visible`]: true }
    : { ...preferences, trackVisibility: { ...preferences.trackVisibility, [gate.trackIndex]: true } },
  };
  if (changedToHidden && isGpxTargetVisible(withoutHide, selected.ref) && !isGpxTargetVisible(latest.snapshot, selected.ref)) {
    await selection.clear({ ifCurrent: selected });
  }
}
