# Track Editor

Track Editor (`x-track-editor`) makes local corrections to GPX tracks: move, insert, or delete points; edit point values; and select nearby points for deletion. It works on an independent draft and saves the result as a new GPX entry. The source entry is never edited in place.

Use it for focused corrections and cleanup. By default, only a limited number of points around the location you click, within one segment, are available for editing at a time. Try the [editor sample](../../samples/editor/localhost.html) using the [development server](../../docs/DEVELOPMENT.md#local-server).

## Enable the editor

The plugin requires `tilia-gpx-domain`, `tilia-panel`, and `tilia-toolbar`; Tilia installs those dependencies automatically. File loading, track display, status messages, and export are separate features.

Using the browser dependencies and map container with a defined height from the [README](../../README.md#basic-usage), this configuration provides file input, track display, editing, and GPX download:

```js
import { createDefaultTiliaApp } from "./src/index.js";

const app = createDefaultTiliaApp("map", {
  plugins: [
    "tilia-gpx-input", "tilia-gpx-renderer", "tilia-file-import",
    "tilia-status", "x-track-editor", "x-gpx-export",
  ],
  pluginOptions: {
    "x-track-editor": { editablePointRadius: 100 },
  },
});
await app.ready;
```

The import assumes a host page in the repository root. Deploy both `src/` and `plugins/`, preserving their relative paths. The editor loads its own styles and editing tools; no additional editor import-map entry is needed.

`tilia-status` is optional but displays session and save messages. `x-gpx-export` is optional: **Save Copy** adds an entry to the app; it does not download a file. Add `tilia-layers`, `tilia-gpx-ui`, and `tilia-map-selection-presenter` if you also want viewer layer controls and visual feedback for selected map features. See the [plugin guide](../../docs/PLUGINS.md) for combinations.

### Configuration

| Option | Meaning |
| --- | --- |
| `editablePointRadius` | Default `100`; number of neighboring points on each side of the nearest point, within the current segment |
| `position`, `priority`, `edgePolicy`, `rank` | Shared toolbar placement/order settings; see [control placement](../../docs/PLUGINS.md#control-placement) |

Set `editablePointRadius` to a nonnegative integer or `Infinity`. The default value of `100` makes up to 201 existing points available for editing: the point nearest to the location you click and up to 100 points on either side, limited to the current segment. This setting counts neighboring points, not distance in meters or pixels. Setting it to `Infinity` makes all points in the segment available for editing, but may reduce performance on large tracks.

## Basic workflow

1. Load a GPX file and make the track you want to edit visible.
2. Open **Track editor**, choose the GPX source, and select **Start Edit**.
3. Click a draft track line (or the circle for a single-point segment) near the correction to show point markers for editing.
4. Change point positions/values or select points for deletion. Use **Undo** and **Redo** as needed.
5. Select **Save Copy** to add the edited entry, or **Cancel** to discard the draft.
6. To download a saved entry, open **GPX export**, choose that entry, and select **Export GPX**.

## Starting an editing session

Before a session starts, clicking a normally rendered track can select its GPX source for the editor. The source list is disabled while a session is active; finish or cancel it before switching sources.

**Start Edit** copies the source's track data into an independent draft. Tracks visible at that moment are shown as editable drafts, while their original map display is temporarily hidden. This does not change the source entry's visibility or track preferences. Hidden source tracks are also copied into the draft and saved output, but are not shown for editing in that session. Show the tracks you want to edit before starting.

Once editing starts, changes to or deletion of the source entry do not change the draft or prevent **Save Copy**. Editing and Undo/Redo remain available even if the GPX renderer plugin is removed. Removing the editor plugin or shutting down the application ends the session. Closing the panel alone does not discard the draft; reopen it to continue.

Click a draft line to edit points near that location. This is called local point editing: the editor shows markers for nearby points, selects the point nearest to where you clicked, and displays its values in the editor panel's selected-point inspector. Clicking another location on a draft line changes which points have editing markers and selects the nearest point. Clicking a different draft track or segment switches editing to that segment. Clicking the map background hides the editing markers and clears the point selection without ending the session.

A segment containing only one point is displayed as a filled circle. Clicking the circle selects that point for local point editing and replaces the circle with an editing marker. When local point editing ends, the circle reappears at the point's current position.

## Editing individual points

| Action | Result |
| --- | --- |
| Drag an existing point marker | Move the point |
| Drag a smaller midpoint marker | Insert a point at the drop location |
| Right-click a point marker (or use your device’s context-menu gesture) | Delete the point |
| Click a point marker | Select it and show its inspector values |

Clicking a midpoint alone does not insert or select a point. New points start without elevation or timestamps; enter those values in the inspector if needed. They are not interpolated automatically.

`editablePointRadius` determines which points receive editing markers. Click another location on the draft to edit points beyond that range.

Dragging an unselected point preserves the existing selection. Dragging a selected point updates its inspector values and selection ring after the drag finishes; rings do not follow continuously during the drag.

## Selecting multiple points

**Select area** requires active local point editing:

1. Select **Select area**; its active state appears and normal map dragging is temporarily disabled.
2. Drag with the primary mouse button to draw a rectangle.
3. Release to select eligible points inside it.

Selection is limited to points with editing markers in the current segment. Other points inside the rectangle are ignored. A successful selection replaces the previous selection and exits selection mode; selected points appear as rings and inspector rows.

An empty rectangle leaves the previous selection unchanged and keeps selection mode active for another attempt. Press **Escape** or select **Select area** again to cancel the mode without changing the selection. Ending the mode restores the map's previous dragging state.

Individual point clicks replace the selection; there is no additive/subtractive multi-point selection. Multiple points can be inspected or deleted together, but their values cannot be assigned in bulk.

## Selected-point inspector

The inspector lists selected points in their order along the segment. Select a cell to edit one value; the focused row and point ring are highlighted.

| Field | Meaning |
| --- | --- |
| **Lat** | Latitude in degrees |
| **Lon** | Longitude in degrees |
| **Ele** | Elevation in meters; may be cleared |
| **Time** | Date/time edited in the browser's local timezone; may be cleared |

Press **Enter** or move focus away to apply a valid value. Press **Escape** to cancel the cell edit. Invalid input remains highlighted and is not applied or added to the undo history. Latitude/longitude require finite numeric values; saved data must also satisfy GPX geographic coordinate ranges. An invalid open cell prevents **Save Copy** from proceeding.

When a cell is not being edited, the inspector displays rounded coordinates and elevation values, and only the time of day. Editing a cell shows the stored numeric precision or full local date/time; display rounding does not change the point. Timestamps are stored as Unix milliseconds, and local time interpretation follows the browser's timezone.

## Deleting selected points

**Delete 1 point** or **Delete N points** deletes the selected points as one undoable action, then clears the selection. If the deletion empties a segment, that segment is removed; if its track has no remaining segments, the track is removed too.

**Undo** restores the complete deletion, including any removed segments and tracks, but does not recreate the cleared selection. After restoring a completely removed segment or track, click its draft line or single-point circle to show editing markers again.

## Undo and Redo

Undo and Redo cover point movement, insertion, individual deletion, inspector changes, and deletion of selected points throughout the session. Changing the selection or focus is not undoable. Undo/Redo can retain selected points that are still available for editing, but do not restore a cleared selection. Making a new edit after Undo clears the Redo history.

Buttons are enabled when the matching operation is available. Shortcuts work while keyboard focus is in the map and outside a form input:

| Shortcut | Action |
| --- | --- |
| Ctrl+Z / Command+Z | Undo |
| Ctrl+Shift+Z / Command+Shift+Z | Redo |
| Ctrl+Y | Redo |

## Saving or cancelling

**Save Copy** applies any valid unfinished inspector edit, hides the editing markers, and creates a new visible GPX entry in the app. Successful creation ends the session and removes the draft display. Saving without edits still creates a copy. Names receive ` (edited)` before a final `.gpx` extension, for example `walk.gpx` becomes `walk (edited).gpx`.

The saved document contains all draft tracks and segments, including tracks that were hidden at session start. It preserves track names and each point's latitude, longitude, elevation, and timestamp. It excludes routes, waypoints, document metadata, track descriptions, and point names/descriptions/symbols. It is a track-editing output, not a lossless copy of the original GPX document.

Saving does not modify or recreate the source. If saving fails, the draft remains available. Check the status message or browser console for details. You can resume editing by clicking a draft line or single-point circle, or retry Save Copy. During a pending save, editing, Undo/Redo, and another save are disabled; **Cancel** remains available.

**Cancel** ends the session and discards the draft. It never restores an earlier version of the source or recreates a deleted source. If a save is pending, cancelling before the new entry is added prevents its creation; cancelling after it has been added does not remove it.

When the session ends, the original entry, if it still exists, is displayed according to its current visibility settings. Those settings may have changed while the draft was open. Selecting draft points does not change which source feature is selected elsewhere in the app.

## Scope and limitations

- Designed for local corrections and cleanup, not comprehensive long-track authoring.
- Only track points are editable; routes and waypoints are excluded from the saved copy.
- Editing markers and rectangle selection are limited to one segment at a time; `editablePointRadius` determines how many neighboring points are available.
- No bulk value assignment, automatic elevation recovery, or timestamp interpolation.
- Save creates an application entry; download requires the separate export plugin.
- Drafts/history are held in memory. Save the copy and export it before leaving the page if you need a file.
