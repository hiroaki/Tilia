# Distance Markers

[日本語](README.ja.md)

`x-distance-markers` shows the cumulative distance from the start of the
selected GPX track. This Tilia Birch repository plugin requires
`tilia-gpx-domain`. Selecting a track, segment, or track point shows labels for
the corresponding track. Clicks on track points still use the existing popups.
The dedicated sample lets you compare settings without changing the selection.

The existing `x-milestone` plugin places labels at vertices on visible tracks
and uses its target count to choose a zoom interval. `x-distance-markers`
interpolates positions along the selected track and limits candidate generation
even when a single edge spans thousands of kilometers. Birch core, the
application defaults, and `x-milestone` are unaffected.

## Options

Enable the plugin in the application plugin list or install it with `app.use`.
Birch loads the repository plugin by ID. See [Plugin Operations](../../docs/PLUGIN-OPERATIONS.md).

| Option | Type | Default | Accepted values | Unit and effect |
| --- | --- | --- | --- | --- |
| `spacing` | String | `"medium"` | `"small"`, `"medium"`, `"large"` | Targets roughly 140, 220, or 320 screen pixels between labels along the projected path. Actual spacing depends on zoom, rounding, and the candidate limit. |
| `maxMarkers` | Integer | `100` | 1 through 1,000 inclusive | Maximum number of distance candidates across the whole track per placement pass, before viewport and collision filtering. |

```js
await app.use("x-distance-markers", { spacing: "small", maxMarkers: 300 });
```

Invalid values fail plugin setup with a `TypeError` as the cause of Birch's
`PLUGIN_SETUP_FAILED`. Install without options to use the defaults.
The 100 m minimum interval and collision thresholds are fixed internally.

## Placement and drawing

1. Read the selected track's public GPX Domain snapshot and
   `getElevationProfile()` samples. Sample locators identify the original
   points, and sample distances measure from the start of the track. Birch
   includes inferred edges between nonempty segments in this distance.
   Project each vertex at zoom zero and cache the projected points,
   cumulative distances, and total projected length for the selected revision.
2. Compute the minimum interval in meters as the greatest of 100 m,
   track length divided by `maxMarkers`, and the spacing target in pixels
   multiplied by the ratio of track length to projected length at the current
   zoom. Round up to an interval in the 1, 2, 5 × powers of ten series.
   A 30 km track needs a limit of at least 300 to allow 100 m intervals,
   and the zoom and density must also permit them. Different spacing presets can
   yield the same rounded interval.
3. Enumerate positive integer multiples of the interval through the track
   end, limiting the loop to `maxMarkers` before entering it. For each multiple,
   binary-search the first sample at or beyond that distance. Use the
   cumulative-distance fraction to interpolate along the corresponding
   projected edge, including inferred gap edges. Unproject the surviving
   anchors at zoom zero. A distance shared by two zooms keeps its position.
4. Discard anchors outside the viewport. In increasing distance order,
   discard candidates less than 90 screen pixels horizontally and less than
   30 screen pixels vertically from an accepted anchor. This inexpensive collision rule uses fixed
   thresholds based on anchor positions.
5. Create noninteractive Leaflet markers for the remaining anchors in a
   single owned LayerGroup, above selection highlights and below popups.
   Labels use meters below 1 km and kilometers otherwise, with fractional
   kilometers when the distance is not an integer kilometer. Reuse the group
   and keep its markers when the filtered result is unchanged. When it changes,
   clear and rebuild the group contents.

## Lifecycle

Selection changes and entry or suppression notifications recheck eligibility.
Clear the layer group when selection is cleared, moves to a non-track object,
or the track is hidden, suppressed, or removed. Selecting a different track
or changing the GPX revision invalidates the cached distance series. GPX
replacement invalidates the old selection through Birch. Entry-bound scope
cleanup removes labels on deletion, and post-attachment checks account for
synchronous callbacks that change eligibility during a rebuild. A refresh pass
resolves the selection once if it passes the initial eligibility checks. Before
and after each layer addition, check the immutable selection reference, revision,
visibility, suppression, and scope liveness.

On `zoomend`, `moveend`, or `resize`, reuse the prepared series. An identical
zoom and bounds for the current series skip placement work, including the
common consecutive zoom and move notifications. Plugin removal clears the
group and releases its map attachment and scoped subscriptions.

## Performance and limits

The bound applies before allocating per-candidate positions, and no more
than that many marker layers are created in a completed rebuild. A limit of
1,000 preserves the sample's existing largest preset and bounds the current
pairwise collision pass to 499,500 comparisons per placement. These figures bound the work in those steps. Actual execution time can
vary.

For N vertices and up to K candidates, series preparation takes O(N) time
and storage. Per-placement binary searches take O(K log N) time, collision
checks take up to O(K²), and candidate and marker storage take O(K).
GPX parsing, the GPX Domain query, vertex projection, work in other map
layers, and update frequency are outside this bound. Series preparation runs
synchronously, including for GPX tracks with 100,000 or more points.

A whole-track budget can keep labels coarse even when zoomed into a short
portion. Some labels can change when the interval switches, for example from
2 km to 5 km. Panning and zooming also affect which labels survive clipping
and collision filtering. Interpolation
follows the projected polyline using the distance fraction, so it can differ
from geodesic chainage within very long edges. Antimeridian unwrapping,
world-copy labels, and special handling for polar projection limits are
outside the implementation.

## Verification

Run `npm run serve` and open the [distance marker sample](http://127.0.0.1:8010/samples/distance-markers/).
The sample starts with no selection. Try the sparse track with an inferred
gap, the track that follows the same loop twice, or the track with two distant
points. You can also import your own GPX file with the file picker or by
dragging it onto the sample. Use **Marker spacing** (Small, Medium, Large) and
**Candidate limit** (100, 300, 1,000) to compare settings. Each control keeps
the other setting and the current selection. The header shows the zoom and
the number of Leaflet marker layers created after filtering.

When evaluating the sample, check how readable fractional kilometers are
when zoomed out, how labels change at zoom boundaries, and whether labels
on tight loops provide the distance information you need. During sample
development, the button margins were limited to the track buttons, the
default spacing target increased from 90 to 220 px, and the centered labels
were made more compact with 10 px text instead of 11 px, smaller horizontal
padding, and a shorter line height.

```sh
npm test -- --project=unit tests/x-distance-markers.test.js
npx playwright test --project=regression tests/smoke/x-distance-markers.spec.js
```

Unit coverage includes two distant points, option limits and invalid values,
empty and repeated geometry, gap interpolation, stable anchors, duplicate
viewport notifications, viewport and collision filtering, selection, visibility,
suppression, edits, replacement, and cleanup. The browser test covers the
sample’s initial state, controls, zoom, marker count, highlight stacking,
selection, visibility, and disposal.
