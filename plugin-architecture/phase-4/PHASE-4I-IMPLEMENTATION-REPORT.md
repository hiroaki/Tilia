# Phase 4I — Implementation and Verification Report

Implementation and verification completed after approval-documentation commit `7b7bb11` (`docs: approve Phase 4I operation and lifecycle amendments`). A/B/C were explicitly approved on 2026-10-08. Implementation review/acceptance remains with the user; this report does not claim a later acceptance decision.

## Delivered behavior

- **A:** native operation signal validation/checkpoints, caller-owned invocation Scope, exact winning registration/lifetime checks, and bounded `InputDispatchError` evidence/precedence. Original successful results remain unchanged; dispatch errors do not assert a global commit/rollback outcome. Falsy handler rejections retain evidence. Concrete cleanup and safe residuals remain owned; arbitrary handler settlement is observed with `await:false`.
- **B:** one exclusive private host Drop target, staged activation, immutable File snapshot, host-owned binding/invocation scopes and contributor resource-close obligation. Delivery/highlight/listeners revoke on closure. Plain callback settlement is observed, while actual resource disposal remains joined and retryable.
- **C:** setup-only cancellable one-shot `lifecycle.afterCommit`; own active publication precedes invocation. Rollback/closure suppresses callbacks. Errors/thenables diagnose without undoing commit. Query startup distinguishes activation from input-handler availability.
- **Hosts:** fixed typed Toolbar descriptors/order/placement; Panel side/bottom layout, Escape/dialog labels/focus recovery; private measured layout annotations/observers with guarded restoration. Layers keeps stable entry/adapter rows, action-time absence withdrawal and public typed Delete all. Settings keeps entry/contribution/descriptor mount identity and isolates support/mount failures.
- **Domain UI:** reactive GPX hierarchy/selection/category/track preferences, GPX Settings style/visibility, per-entry Photo auto/local/utc Settings and reactive metadata/preview/selection. Manual Fit/Reveal uses semantic geometry without forcing visibility/rendering.
- **Elevation:** track-only semantic profiles, proportional track spans/separation, missing-elevation stroke breaks, inferred-gap styling/ascent exclusion, singleton/constant/zero-distance behavior, keyboard sample selection and an independently owned hover overlay. Opening preserves waypoint selection/popup. Renderer absence/hidden targets suppress automatic map effects.
- **Transports:** sequential immutable File/Drop batches, busy rejection, File Cancel, URL close/reopen generation guards, one-shot Query startup, full fetch/body/dispatch timeout, declared/actual byte limits and streaming cleanup. Handler-withdrawal cancellation closes the captured operation and suppresses successful completion status. Remote metadata never coerces XML/unknown input to GPX.
- **Product resources:** accessible owned status output/dismissal, owned catalog selector/error restoration, feature stylesheet leases, explicit Viewer and both Embed compositions. Embed inference uses an auto-compatible helper and hides the returned helper entry ID through typed Entries.

Classification is **22 enabled / 4 disabled**. Only export, route search, track editor and milestone remain disabled for 4J. Public terminal asynchronous app destruction stays 4K. Editor and PartiallyEditablePolyline were not changed.

## Pinned EXIF investigation

Investigated the exact sample import-map artifact:

- URL: `https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js`
- Bytes: **45,456**
- SHA-256: **`9c18a09ddc50bb7f4171fa292e5593d6bf4b96857783b6e8e20cc6c0a53c73c1`**
- Unmodified test copy: `tests/fixtures/exifr-7.1.3-lite.esm.js`; license: `LICENSES/exifr-MIT.txt`.

The Blob reader's `readWhole` and `_readChunk` use bundle helper `U` (`readBlobAsArrayBuffer`). Each call constructs a local native FileReader, assigns `onloadend`/`onerror`, starts `readAsArrayBuffer`, and returns its Promise. It has no signal argument, exposed FileReader handle or abort hook. Exporting the Promise helper does not expose reader cancellation. `_readChunk` slices the Blob and awaits the same helper.

Reader-base `close()` is a no-op for this browser Blob path. Parser success calls `file.close()`; parser failure is not universally protected by a finally. For this pinned Blob reader the omitted failure-close does not omit an implemented resource-release operation. The library does not explicitly clear its FileReader callbacks after settlement. Source review found no persistent collection retaining those FileReaders: the reader/callback/Promise closure is local to each helper call. Completed callback cycles are left to garbage collection. This is a source-level retention analysis, not a forced-GC or heap-liveness proof; no immediate memory reclamation guarantee is claimed.

`thumbnailUrl()` separately calls `URL.createObjectURL`. Tilia calls `parse(file,{tiff:true,exif:true,gps:true})` and never calls thumbnail URL acquisition. Normal parse returns plain EXIF data. Preview URLs are acquired later by the app-owned Photo provider under its existing disposal/lease contract.

Validation uses the actual bundle, not a replacement EXIF implementation:

1. Hash verification; a controllably pending browser-reader model proves JPEG uninstall completes before read settlement, late parsing cannot publish an entry, and no preview URL is acquired.
2. Initial FileReader error and subsequent Blob `_readChunk` failure both settle/are observed; no private modeled reader remains loading afterward.
3. Real Chromium FileReader with delayed `onloadend` delivery verifies uninstall does not join the private parse Promise and late completion creates no entry. The harness retains readers for inspection and deliberately delays callback delivery; it is not a GC experiment or proof of aborting native I/O.
4. Existing real JPEG EXIF/inference/preview/replacement/removal scenarios pass.

**No new approved-contract change is required by these findings.** Private EXIF reads cannot be physically interrupted through this integration; they may delay settlement and the still-installed transport's next batch. Late plain data is guarded/ignored. Uninstall does not promise to finish all EXIF parsing. Concrete owned FileReaders, stream readers, preview URLs, provider preparation/leases and retained cleanup residuals continue to follow their actual owners' cleanup/wait contracts.

## Verification

Final code verification:

| Command | Result |
|---|---|
| `npm test -- --reporter=dot` | **73 files / 731 tests passed** |
| `npx playwright test tests/smoke/viewer*.spec.js tests/smoke/embed.spec.js tests/smoke/phase-4*.spec.js --workers=3` | **33 passed**; no noneditor skips |
| `git diff --check` | Passed |

The 14 Editor smoke scenarios are explicitly outside 4I and were not counted as passes. Both language Embed variants pass. Earlier failed iterations were corrected; the table records successful final verification rather than historical investigation totals.

Coverage mapping:

- `phase-4i-input-cancellation`: validation/preabort/exact registration, cleanup cancellation, handler/result/error evidence, responsive caller/handler removal, falsy rejection, native-reader abort/late events, source-listener and physical-reader cleanup residual retry.
- `phase-4i-activation`, `query-import`, `phase-4i-transports`: own-commit/rollback/cancel/diagnostic semantics, Query-first/handler-first/dynamic availability, no-parameter/uninstall suppression, URL pending close/reopen, timeout during fetch/body/dispatch.
- `phase-4i-drop-binding`, `phase-4i-lifecycle`, `dropzone`: frozen snapshot/exclusive/headless/staged behavior, no plain-callback join, concrete resource waits, failed-listener residual retry, rollback and busy sequential batches.
- `phase-4i-hosts`, `ui-surfaces`, `phase-4i-product`: dormant/copy/order/failure-isolated Toolbar, Panel validation, annotation restoration/foreign writes/stale leases, stable domain/UI mounts, delayed unselected removal/action-time withdrawal, two Settings surfaces admitting the same revision and authoritative recovery, renderer-free singleton selection and missing/inferred/zero-distance layout.
- `phase-4i-clear` plus retained EntryStore/foundation suites: guarded public forwarding, reverse snapshot, frozen empty batch, final-subscriber mutation gate; underlying pending-create, FIFO, committed cleanup/lease and retry behavior remains covered without changing EntryStore.
- `file-import`, `remote-url-import`, `url-import`, status/base-map and existing 4G/4H production tests: File Cancel/handler withdrawal/stale continuation, limits/metadata/configuration, status redisplay/accessibility, catalog failure/fallback and contribution/preview/popup lifetime regressions.
- `phase-4i-exifr-pinned`, `smoke/phase-4i`: exact pinned source/hash, error/follow-up chunk/late work, real native FileReader, JPEG Drop and cross-realm dispatch signal.

Obsolete raw-installer, forced-GPX metadata, global/custom Photo-mode and elevation-opening selection expectations were migrated at their corresponding cutovers. Existing 4H uninstall-before-delayed-source-release ordering was retained. Focus fixtures now attach launchers so connected-launcher behavior is tested realistically.

## Audits and manual provenance review

`phase-4i-audits.test.js` passes five independent gates:

1. Qualified text scan covers `src`, all `plugins` and all `samples`, including Editor. Four disabled loaders are byte-identical to pinned baseline `b4dbb30d3c914ffb6e970a481840c7a914936aea`.
2. Parsed static/reexport/literal-dynamic imports, including HTML module scripts, traverse enabled catalog/public/sample roots. Nonliteral imports fail the audit. No disabled loader or removed standard helper is reached. The lexer is a dev-only dependency; its existing locked 1.7.0 artifact is declared directly.
3. Eager public graph excludes Photo implementation/EXIF. Existing real 4G request-capture scenarios separately verify GPX-only/first-JPEG lazy loading.
4. Generic host edges have no domain UI/provider/renderer implementation imports or raw semantic snapshot interpretation. Manual review traces viewport effects to typed semantic queries and MapFacade; Elevation/presenter construct their own layers and never traverse foreign renderer groups. Facade-internal GPX query imports remain the permitted semantic implementation boundary.
5. Shared CSS retains shell primitives; host/transport/domain/presenter sheets have owning `styles.use` leases. Repeated production install/uninstall checks resources/DOM/feature links. Physical link balance and shared leases also retain 4C coverage.

Raw refresh remnants are **not repository-wide zero**: export has one `addRefreshHandler`, route search one `refreshView`, track editor one of each, milestone one `addRefreshHandler`. Their recorded legacy app/core/state/source dependencies likewise remain only in those disabled, unchanged loaders. Qualified enabled/sample paths have zero forbidden matches. No additional exception was introduced.

Deleted standard legacy files: `src/core/input-processing.js`, `src/core/remote-url-import.js`, `src/ui/styles.js`, `src/ui/surfaces.js`. The legacy standard installer exports were removed at cutover. `map/controls.js` helpers still needed by exact disabled 4J loaders remain; there are no compatibility aliases or new raw-map/DOM bridges. SelectionStore authority and EntryStore serialization/publication/removal/lease implementations were not redesigned.
