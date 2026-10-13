# Photo and Editor test fixtures

Ordinary tests use these purpose-built fixtures without importing or fetching public samples. `tests/samples/` continues to validate the real Viewer, Embed and Editor pages and their original assets.

## Current fixture contracts

- `photo-exif.jpg` (987 bytes): synthetic 2×1 solid-color baseline JPEG. A little-endian EXIF TIFF contains only Make (`Apple`), Model (`iPhone 5`), DateTimeOriginal (`2013:11:24 15:17:17`), GPS latitude N 34°59′48.41″ and longitude E 135°49′10.27″, plus the required IFD pointers. It contains no sample photograph, thumbnail or camera-specific metadata. It supplies valid browser previews and one small input for real exifr integration.
- `../helpers/photo-exif.js`: supplies two named upload payloads using that same image, and intercepts only the pinned external exifr module. GPS results use latitude 34.99678055555556 / longitude 135.81951944444444 and local DateTimeOriginal 2013-11-24 15:17:17. Timestamp-only results use local 2013-11-24 15:22:39 and omit GPS. Both return Make/Model. Historical input names remain to preserve the existing filename assertions. Image EXIF is ignored in mocked tests.
- `photo-offset-track.gpx` (543 bytes): one track/segment and four distinct points, bracketing 06:22:39Z and 06:52:39Z on 2013-11-24. Their coordinates preserve the original interpolation for `+09:00` and `+08:30`. Both offsets succeed, `-09:00` fails, and AUTO in Asia/Tokyo succeeds. The `+08:30` match is required when the visibility reconciliation triggers focusout of the offset draft. Full route length, elevations and unrelated metadata are unnecessary for this settings ownership test.
- `editor.html` (954 bytes): a dedicated full-height `#map`, local installed Leaflet JS/CSS and the actual public app factory. GPX input/rendering/UI, selection presentation, Panel, Layers, File input, Drop and Track Editor are production plugins; their dependency declarations load the GPX domain and Toolbar. No Editor behavior is implemented in the page. Route search, export, sample wrapper, sample colors and rank overrides are unnecessary for its consumers.

## Why real exifr is retained

The successful integration in `photo-dependency-isolation.spec.js` checks Tilia's lazy pinned URL import without an import-map entry and the handoff of GPS, local Date, Make and Model into the Photo domain. `phase-4i-exifr-pinned.test.js`, the first `phase-4i.spec.js` test, and the EXIF-reader test in `application-lifecycle.spec.js` check that uninstall/destroy do not join private native FileReader work and that late settlement cannot create entries or preview URLs. They use the tiny real input rather than a parser mock because reader lifetime is the integration contract. They do not need camera photos or a matrix of EXIF encodings. Other Photo tests mock the returned metadata and keep real Tilia normalization, validation, inference, selection, layout and resource ownership. The existing normalization/invalid-metadata cases in `phase-4g-jpeg.test.js` already use an exifr mock.

The browser thumbnail test additionally checks naturalWidth=2, so successful parsing cannot hide an invalid/undecodable image fixture.

## Original copied-fixture consumers

The inventory below records the consumers before minimization; test titles and assertions remain in place. JPEG consumer behavior does not depend on the original pixels. The GPS copy was 290,730 bytes, the timestamp-only copy 269,454 bytes, the GPX copy 188,863 bytes (1,787 track points), and the modified-copy Editor page 1,885 bytes. The three sample-asset copies were removed. Editor was replaced in place.

### `IMG_2889.JPG`

- [smoke/viewer-photo-import.spec.js](../smoke/viewer-photo-import.spec.js): viewer sample imports a GPS-tagged photo and shows it as an EXIF-based layer
- [smoke/photo-dependency-isolation.spec.js](../smoke/photo-dependency-isolation.spec.js): JPEG succeeds without an exifr mapping and installation does not request EXIF
- [smoke/jpeg-viewport.spec.js](../smoke/jpeg-viewport.spec.js): JPEG import restores GPS/inferred viewport and leaves unlocated photos alone (renderer true / false)
- [smoke/phase-4g.spec.js](../smoke/phase-4g.spec.js): Phase 4G GPS Photo production lifecycle, popup/highlight independence and rendering termination
- [smoke/phase-4g.spec.js](../smoke/phase-4g.spec.js): Phase 4G optional Photo/JPEG roles load EXIF only for first handled JPEG and accept native cross-realm signals

### `IMG_2892.JPG`

- [phase-4i-exifr-pinned.test.js](../phase-4i-exifr-pinned.test.js): does not join private reads at uninstall and blocks late EXIF entry/URL creation
- [smoke/photo-fixed-offset.spec.js](../smoke/photo-fixed-offset.spec.js): drafts, failed inference, deletion and disposal preserve ownership
- [smoke/phase-4i.spec.js](../smoke/phase-4i.spec.js): pinned exifr uses native FileReader; uninstall does not join reads and late parsing cannot create entries
- [smoke/phase-4i.spec.js](../smoke/phase-4i.spec.js): Drop imports actual JPEG through the shared domain handler
- [smoke/viewer-photo-inference.spec.js](../smoke/viewer-photo-inference.spec.js): viewer sample infers a photo location from an imported GPX track
- [smoke/phase-4h.spec.js](../smoke/phase-4h.spec.js): Phase 4H real EXIF inference is one-shot and independent of GPX renderer, deletion, service availability and preview replacement
- [smoke/jpeg-viewport.spec.js](../smoke/jpeg-viewport.spec.js): JPEG import restores GPS/inferred viewport and leaves unlocated photos alone (renderer true / false)
- [smoke/visual-regression.spec.js](../smoke/visual-regression.spec.js): Photo thumbnail dimensions, long Layers scrolling and shared GPX leases survive renderer disposal
- [smoke/application-lifecycle.spec.js](../smoke/application-lifecycle.spec.js): public destroy does not join pinned EXIF readers and their late settlement cannot create a Photo URL
- [smoke/viewer-settings.spec.js](../smoke/viewer-settings.spec.js): viewer settings exposes per-entry Photo modes and owns side layout/focus
- [smoke/phase-4g.spec.js](../smoke/phase-4g.spec.js): Phase 4G timestamp-only Photo tree selection, three settings modes and UI lifetimes

### `biwakososui.gpx`

- [smoke/photo-fixed-offset.spec.js](../smoke/photo-fixed-offset.spec.js): drafts, failed inference, deletion and disposal preserve ownership

### `editor.html`

- [smoke/editor.spec.js](../smoke/editor.spec.js): editor displays draft segments immediately when editing starts
- [smoke/editor.spec.js](../smoke/editor.spec.js): editor can start again after cancel without retaining draft layers
- [smoke/editor.spec.js](../smoke/editor.spec.js): point marker click selects it, midpoint click does not, and map background clears selection
- [smoke/editor.spec.js](../smoke/editor.spec.js): editor marker drags preserve selection and update the form only for the selected point
- [smoke/editor.spec.js](../smoke/editor.spec.js): point inspector edits one cell with validation, cancellation, focus, and history
- [smoke/editor.spec.js](../smoke/editor.spec.js): insert, undo, and redo preserve the existing selection
- [smoke/editor.spec.js](../smoke/editor.spec.js): deleting selected and unselected points only removes deleted IDs from selection
- [smoke/editor.spec.js](../smoke/editor.spec.js): area selection replaces selection with one point and restores normal editing
- [smoke/editor.spec.js](../smoke/editor.spec.js): empty area selection retries, multiple selection succeeds, and Escape cancels
- [smoke/editor.spec.js](../smoke/editor.spec.js): bulk delete removes and Undo restores the final segment and track
- [smoke/editor.spec.js](../smoke/editor.spec.js): editor point deletion retains local editing until the final structure is removed
- [smoke/editor.spec.js](../smoke/editor.spec.js): clicking a normal track selects its GPX source without starting a session
- [smoke/editor.spec.js](../smoke/editor.spec.js): displays multiple draft tracks and transfers local editing between segments
