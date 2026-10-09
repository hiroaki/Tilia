# Track Editor

[Tilia README](../../README.md) · [Plugin guide](../../docs/PLUGINS.md#track-editor-and-gpx-export) · [API reference](../../docs/API.md) · [Architecture](../../docs/ARCHITECTURE.md)

Track Editor (`x-track-editor`) makes local corrections to GPX tracks: move, insert, or delete points; edit point values; and select nearby points for deletion. It works on an independent draft and saves the result as a new GPX entry. The source entry is never edited in place.

Use it for focused corrections and coarse cleanup. Point editing normally covers a local window within one segment, rather than every point of a long track at once. Try the [editor sample](../../samples/editor/localhost.html) using the [development server](../../docs/DEVELOPMENT.md#local-server).

## Enable the editor

The plugin requires `tilia-gpx-domain`, `tilia-panel`, and `tilia-toolbar`; Tilia installs those dependencies automatically. File loading, source rendering, status messages, and export are separate features.

Using the browser dependencies and sized container from the [README](../../README.md#basic-usage), this configuration provides file input, track display, editing, and GPX download:

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

The import assumes a host page in the repository root. Deploy both `src/` and `plugins/`, preserving their relative paths. The editor loads its own styles and bundled editing helper; no additional editor import-map entry is needed.

`tilia-status` is optional but displays session and save messages. `x-gpx-export` is optional: **Save Copy** adds an entry to the app; it does not download a file. Add `tilia-layers`, `tilia-gpx-ui`, and `tilia-map-selection-presenter` if you also want viewer layer controls and selection presentation. See the [plugin guide](../../docs/PLUGINS.md) for combinations.

### Configuration

| Option | Meaning |
| --- | --- |
| `editablePointRadius` | Default `100`; number of neighboring points on each side of the nearest point, within the current segment |
| `position`, `priority`, `edgePolicy`, `rank` | Shared toolbar placement/order settings; see [control placement](../../docs/PLUGINS.md#control-placement) |

Use a nonnegative integer for `editablePointRadius`. A radius of `100` exposes at most 201 existing points, truncated at segment boundaries; it is not a distance in meters or pixels. The bundled helper also accepts `Infinity` to expose the whole segment, which increases the number of markers and may make large tracks expensive to edit.

## Basic workflow

1. Load a GPX file and make the track you want to edit visible.
2. Open **Track editor**, choose the GPX source, and select **Start Edit**.
3. Click a draft track segment near the correction to activate local point editing.
4. Change point positions/values or select points for deletion. Use **Undo** and **Redo** as needed.
5. Select **Save Copy** to add the edited entry, or **Cancel** to discard the draft.
6. To download a saved entry, open **GPX export**, choose that entry, and select **Export GPX**.

## Starting an editing session

Before a session starts, clicking a normally rendered track can select its GPX source for the editor. The source list is disabled while a session is active; finish or cancel it before switching sources.

**Start Edit** copies the source's track data into an independent draft. Tracks visible at that moment receive draft lines, and their normal source presentations are temporarily suppressed. This does not change the source entry's visibility or track preferences. Hidden source tracks are also copied into the draft and saved output, but do not receive draft lines in that session. Show the tracks you want to edit before starting.

Source changes, deletion, or removal of the GPX renderer do not terminate the draft or block **Save Copy**. Draft interaction and history belong to the editor session. Application/editor disposal ends that session. Closing or toggling the panel alone does not discard it; reopen the panel to continue.

Click a draft segment to show nearby point markers and select the nearest point. Its values appear in the inspector. Clicking another location rebuilds the editing window and replaces the point selection; clicking another track or segment transfers local editing there.

## Editing individual points

| Action | Result |
| --- | --- |
| Drag an existing point marker | Move the point |
| Drag a smaller midpoint marker | Insert a point at the drop location |
| Right-click/context-click a point marker | Delete the point |
| Click a point marker | Select it and show its inspector values |

Clicking a midpoint alone does not insert or select a point. New points start without elevation or timestamps; enter those values in the inspector if needed. They are not interpolated automatically.

Only points in the current local window receive editing markers. Clicking the map background away from draft lines ends local point editing and clears its selection, while the overall session remains active. Click a draft line to continue.

Dragging an unselected point preserves the existing selection. Dragging a selected point updates its inspector values and selection ring after the drag finishes; rings do not follow continuously during the drag.

## Selecting multiple points

**Select area** requires active local point editing:

1. Select **Select area**; its active state appears and normal map dragging is temporarily disabled.
2. Drag with the primary mouse button to draw a rectangle.
3. Release to select eligible points inside it.

Selection is limited to the current editing window and segment. Other points inside the rectangle are ignored. A successful selection replaces the previous selection and exits selection mode; selected points appear as rings and inspector rows.

An empty rectangle leaves the previous selection unchanged and keeps selection mode active for another attempt. Press **Escape** or select **Select area** again to cancel the mode without changing the selection. Ending the mode restores the map's previous dragging state.

Individual point clicks replace the selection; there is no additive/subtractive multi-point selection. Multiple points can be inspected or deleted together, but their values cannot be assigned in bulk.

## Selected-point inspector

Rows appear in segment order. Select a cell to edit one value; the focused row and point ring are highlighted.

| Field | Meaning |
| --- | --- |
| **Lat** | Latitude in degrees |
| **Lon** | Longitude in degrees |
| **Ele** | Elevation in meters; may be cleared |
| **Time** | Date/time edited in the browser's local timezone; may be cleared |

Press **Enter** or move focus away to apply a valid value. Press **Escape** to cancel the cell edit. Invalid input remains marked and does not enter history. Latitude/longitude require finite numeric values; saved data must also satisfy GPX geographic coordinate ranges. An invalid open cell prevents **Save Copy** from proceeding.

The compact display rounds coordinates and elevation and shows only the time of day. Editing exposes the stored numeric precision or full local date/time; display rounding does not change the point. Timestamps are stored as Unix milliseconds, and local time interpretation follows the browser's timezone.

## Deleting selected points

**Delete 1 point** or **Delete N points** removes the selection as one history operation, then clears it. If the deletion empties a segment, that segment is removed; if its track has no remaining segments, the track is removed too.

**Undo** restores the complete deletion, including removed structure, but does not recreate the cleared selection. After restoring a completely removed segment or track, click its draft line to activate local editing again.

## Undo and Redo

History includes point movement, insertion, individual deletion, inspector changes, and deletion of the selected points. Selection and focus are not history operations. Undo/Redo can preserve a still-valid selection but do not recreate points of selection that were cleared. Recording a new edit after Undo clears the Redo history.

Buttons are enabled when the matching operation is available. Shortcuts work while keyboard focus is in the map and outside a form input:

| Shortcut | Action |
| --- | --- |
| Ctrl+Z / Command+Z | Undo |
| Ctrl+Shift+Z / Command+Shift+Z | Redo |
| Ctrl+Y | Redo |

## Saving or cancelling

**Save Copy** commits any valid open inspector edit, stops local interaction, and creates a new visible GPX entry. Successful creation ends the session and releases its draft layers, markers, and temporary suppression. Saving without edits still creates a copy. Names receive ` (edited)` before a final `.gpx` extension, for example `walk.gpx` becomes `walk (edited).gpx`.

The saved document contains all draft tracks and segments, including tracks that were hidden at session start. It preserves track names and each point's latitude, longitude, elevation, and timestamp. It excludes routes, waypoints, document metadata, track descriptions, and point names/descriptions/symbols. It is a track-editing output, not a lossless copy of the original GPX document.

Saving does not modify or recreate the source. If creation fails, the draft remains available; use the status message/browser error to identify the cause, then click a draft line to resume or retry saving. During a pending save, editing, Undo/Redo, and another save are disabled; **Cancel** remains available.

**Cancel** discards the session and releases owned interactions/suppression without creating an entry. It never restores an earlier version or recreates a deleted source. Cancellation before save publication prevents that copy; cancellation after publication does not remove an already committed entry.

When suppression ends, any surviving source is displayed according to its current visibility preferences. Its state may have changed while the draft was open. Draft selection remains separate from the application's semantic selection.

## Scope and limitations

- Designed for local corrections and cleanup, not comprehensive long-track authoring.
- Only track points are editable; routes and waypoints are excluded from the saved copy.
- Editing and rectangle selection normally cover one local window in one segment.
- No bulk value assignment, automatic elevation recovery, or timestamp interpolation.
- Save creates an application entry; download requires the separate export plugin.
- Drafts/history are held in memory. Save the copy and export it before leaving the page if you need a file.

For plugin implementation and lifecycle contracts, see [Developing plugins](../../docs/PLUGIN-OPERATIONS.md). For contributor checks and browser testing, see [Developing Tilia](../../docs/DEVELOPMENT.md).
