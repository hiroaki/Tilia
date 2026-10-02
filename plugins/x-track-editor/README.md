# Track Editor

The Track Editor is a lightweight tool for making local corrections to an existing GPX track. It is useful for moving, inserting, or removing individual points, correcting point values, and selecting a nearby group of points for deletion.

The editor deliberately works with a local portion of a track at a time. Use it for focused corrections and coarse cleanup rather than detailed point-by-point authoring of an entire long track.

## Basic workflow

1. Open **Track Editor** and choose a GPX source.
2. Select **Start Edit**.
3. Click a draft track segment to activate point editing near that location.
4. Edit or select points. Use **Undo** and **Redo** as needed.
5. Select **Save Copy** to keep the edited result, or **Cancel** to discard it.

## Starting an editing session

Open the editor with the **Track editor** map button. Choose a GPX source from the list. Before an editing session starts, clicking a track on the map also selects its GPX source.

Select **Start Edit** to create a temporary working copy. The currently visible tracks from the source are replaced on the map by draft tracks; the original GPX entry is not modified.

Next, click the draft track segment near the area you want to change. Point markers appear around the nearest track point, that point is selected, and its values appear in the inspector. Click another part of the same segment, or another draft track or segment, to move the local editing context there.

## Editing individual points

While local point editing is active:

- Drag an existing point marker to change its position.
- Drag a smaller midpoint marker between two existing points to insert a new point at the drop location. Clicking a midpoint marker alone does not insert or select a point.
- Right-click (context-click) an existing point marker to delete that point.
- Click an existing point marker to select it and show its values in the inspector.

An inserted point starts without elevation or time values. You can enter those values in the inspector if needed.

## The editable range

Only a local window of points around the place you clicked receives editing markers. This keeps long tracks manageable and limits selection and editing to the area currently in view for editing.

Click a different location on a draft segment to rebuild the editing markers around that location. Doing so replaces the current point selection. Clicking a different track or segment transfers local editing to that track or segment.

The local-window model is why the editor works best for small corrections rather than exhaustive editing of every point in a large track.

## Selecting multiple points

**Select area** becomes available after you click a draft segment and local point editing is active.

1. Select **Select area**. The button shows its active state and normal map dragging is temporarily disabled.
2. Drag across the map with the primary mouse button to draw a rectangle.
3. Release the button to select the editable points inside the rectangle.

A successful rectangle selection replaces the previous selection and exits rectangle-selection mode. Selected points are shown with rings on the map and as rows in the inspector.

Only points in the current local editing window and current segment can be selected. Points elsewhere in the rectangle are ignored.

If the rectangle contains no eligible points, the previous selection is left unchanged and selection mode remains active so you can try again. Press **Escape** or select **Select area** again to cancel the mode; either action preserves the existing selection. The map's previous dragging state is restored when the mode ends.

## Selected-point inspector

The inspector shows one row for each selected point, in track order. Each row has four values:

- **Lat** — latitude
- **Lon** — longitude
- **Ele** — elevation
- **Time** — timestamp

Select a cell to edit that value. The corresponding row is highlighted, and the selected point's ring on the map changes to show which point is currently focused.

- Press **Enter** to apply a valid value.
- Move focus away from the input to apply a valid value automatically.
- Press **Escape** to cancel the cell edit and keep the previous value.
- Invalid input remains open and is marked as invalid; it is not added to the edit history.

Elevation and time may be cleared. Latitude and longitude require numeric values.

## Deleting selected points

When points are selected, the editor shows **Delete 1 point** or **Delete N points**. Selecting it removes all currently selected points as one operation and then clears the selection.

If the deletion empties a segment, the empty segment is removed. If that leaves its track without any segments, the empty track is removed as well. **Undo** restores the entire deletion as one operation, including a removed segment or track, but does not restore the previous point selection.

After restoring a completely removed segment or track, click the restored draft line to activate local point editing again.

## Undo and Redo

The following changes participate in **Undo** and **Redo** history:

- moving a point;
- inserting a point;
- deleting an individual point;
- editing a point's latitude, longitude, elevation, or time in the inspector;
- deleting the current point selection.

Selection and focus are not history operations. Undoing or redoing a data change does not recreate a selection that was cleared by that change. A selection that still refers to unchanged points may remain selected.

The buttons are enabled only when the corresponding operation is available. Keyboard shortcuts also work while focus is on the map rather than in an inspector input:

- **Ctrl+Z** or **Command+Z** — Undo
- **Ctrl+Shift+Z** or **Command+Shift+Z** — Redo
- **Ctrl+Y** — Redo

Recording a new change after Undo clears the available Redo history.

## Saving or cancelling

**Save Copy** ends the editing session and adds the edited draft as a new GPX layer. The new layer name includes ` (edited)`. The original GPX entry remains unchanged and is shown again with its previous visibility.

**Cancel** ends the session, discards the draft, and restores the original entry without adding a new layer.

Saving is valid even when no edit has been recorded; it still creates a copy. Both actions also close rectangle-selection mode and remove editing and selection markers.

## Interaction notes

- Clicking the map background ends local point editing and clears the current selection. The overall editing session remains active; click a draft segment to continue.
- Clicking a different draft segment ends the previous local editing context, clears its selection, and activates editing near the new click.
- Dragging an unselected point does not replace the current selection. Dragging a selected point updates its inspector values when the drag finishes.
- Selection rings update after a point drag finishes rather than continuously during the drag.
- Buttons are disabled when their action is unavailable. For example, **Select area** requires active local point editing, and **Undo** and **Redo** require matching history entries.

## Scope and limitations

- The editor is intended for local corrections and coarse cleanup, not comprehensive authoring of a long track.
- Only track points are editable. GPX routes (`<rte>`) and waypoints are not editing targets, and neither is included in the saved edited copy.
- Point markers and rectangle selection are limited to the current local editing window and segment.
- Rectangle selection replaces the current selection. Individual points cannot currently be added to or removed from an existing multi-point selection.
- Multiple selected points can be inspected or deleted together, but latitude, longitude, elevation, and time cannot be assigned to them in bulk.
- New points do not receive reconstructed elevation or interpolated timestamps automatically.
- Saving creates a new GPX layer rather than replacing the original entry in place.
