# Phase 2E — Selection & Interaction Design

## 1. Executive Summary

Tilia should model Selection as one piece of generic application state that identifies at most one semantic target in a committed entry. It should model Interaction separately as owned routing from concrete input surfaces to semantic actions such as requesting selection.

The recommended design is:

- `SelectionStore` is an app-owned core subsystem with zero-or-one global selection. Editor draft multi-selection remains private session state.
- A selection is an immutable domain-qualified reference: `{ entryId, domain, ref }`. Core understands only the entry ID and domain ID; `ref` is an opaque immutable domain value.
- The selection stores a reference, not GPX/Photo data, Leaflet objects, popup state, or a cached domain snapshot. Consumers synchronously resolve the current reference through the entry's guarded domain selection adapter.
- Domain selection support is optional. A participating domain validates, resolves, compares, and reconciles its references. Callers cannot insert arbitrary locators directly into SelectionStore.
- References need only be stable for their required lifetime. GPX may initially use revision-scoped structural locators and explicitly reconcile or invalidate them on mutation; persistent UUIDs for every point are unnecessary.
- Hidden targets remain semantically selectable and an existing selection survives visibility changes. Rendering interactions disappear while hidden, and presentation adapters decide what can be shown. Existence, visibility, and rendering are distinct.
- Entry removal, target deletion, provider loss, or app destruction invalidates selection. Rename, coordinate/elevation changes, renderer replacement, and popup closure do not inherently clear it.
- Domain mutations return a generic reconciliation result—`unchanged`, `refreshed`, `remapped(ref)`, or `invalid`—that the mutation coordinator applies without core interpreting domain descriptors.
- Selection changes commit before notifications. `getCurrent()` returns current state; subscriptions receive later `{previous,current,reason}` changes and do not synthesize immediate replay. Reentrant changes queue behind current delivery.
- Renderers/UI surfaces install owned interaction bindings. A binding maps a physical event/hit into one semantic intent; the relevant domain adapter constructs the valid selection reference.
- Interaction precedence uses host-defined tiers—`modal`, `object`, `background`—plus normal DOM/Leaflet propagation. It never uses plugin installation order or arbitrary numeric priorities. Competing primary bindings at the same surface/target/tier are rejected.
- One polyline binding may perform GPX nearest-point hit testing; Tilia does not register one interaction per point.
- Semantic target identity and render identity are independent. Replacing a marker/polyline withdraws old bindings, installs new bindings, and preserves valid selection.
- SelectionStore owns no popup or viewport behavior. Scope-owned presentation adapters observe selection, resolve domain presentation data, and own popups/highlights. Popup closure dismisses presentation only; selection clearing closes presentation through one-way observation.
- The current Interaction Hub should not survive as a general layer-distribution API. `x-milestone` is rendering/presentation augmentation, not semantic interaction; it needs a later typed rendering/domain contribution boundary rather than raw layer subscription.

This design preserves current single-selection behavior and editor-local multi-selection while removing GPX/Photo and Leaflet knowledge from generic core.

## 2. Inputs and Phase 2A–2D Constraints

The design preserves these approved constraints:

- registrations, subscriptions, and render bindings have one owner scope;
- callbacks and mutations are liveness-guarded;
- committed entries are app-owned and have stable app-local IDs;
- domain data/controllers remain private and providers stay alive while entries exist;
- generic core never interprets GPX/Photo structures;
- typed registries/subscriptions replace global events and mutable core access;
- notifications occur after commit and failures cannot roll back committed state;
- entry interaction registrations withdraw before entry rendering disposes;
- persistent state is created under its destination owner, not transferred from plugin scopes.

No Phase 2A–2D decision must be weakened. Phase 2E makes Phase 2C's selection invalidation and Phase 2D's typed-owned registration requirements concrete.

## 3. Current Selection Architecture

`src/core/selection-hub.js` owns three concerns together:

```text
activeSelection (domain-shaped mutable references)
activePopup (Leaflet Popup)
transition/reentrancy guard
```

`core/boot.js` attaches click listeners directly to GPX track polylines, route-point markers, waypoint markers, and Photo markers. Those listeners derive domain values and call `selectTrackPoint`, `selectRoutePoint`, `selectWaypoint`, or `selectPhoto`. The hub imports GPX/Photo popup builders from `src/map/layers.js`, optionally pans, opens a popup, and clears selection when its active popup emits `popupclose`.

```text
Leaflet click
  -> core domain-specific binding
  -> Selection Hub stores mutable entry/domain objects
  -> Selection Hub creates/opens popup
  -> subscribers receive same object references
  -> popupclose may clear selection
```

`updateGpxSource()` and `updatePhotoTimeMode()` clear selection for the entry before replacing rendering/data. `removeEntry()` and `clearAll()` also clear. Visibility changes intentionally do not clear selection (`tests/boot.test.js`).

Elevation is the only substantial Selection Hub subscriber. It also maintains per-entry selected/hovered points, an active Leaflet marker, popup pin state, popup-open/close listeners, and timers. Thus semantic selection, hover, chart focus, reveal marker, and popup lifecycle overlap.

`x-track-editor` does not use Selection Hub for drafts. It has stable draft track/segment/point IDs, a local set-valued selection, local focus/editing state, and a separate non-interactive overlay. This is evidence that not every focus belongs in global selection.

## 4. Current Selection Payloads

| Payload | Actual shape | Identity | Non-identity/coupling |
|---|---|---|---|
| track | `{kind:"track", entry}` | entry plus implicit whole/track meaning | mutable entry reference; no explicit track ID |
| track point | `{kind:"track-point", entry, point}` | `point.locator:{trackIndex,segmentIndex,pointIndex}` | point also carries lat/lon/elevation/time/distance; entry/source mutable |
| route point | `{kind:"route-point", entry, routePoint, locator}` | `{routeIndex,pointIndex}` | routePoint object contains domain data |
| waypoint | `{kind:"waypoint", entry, waypoint}` | object identity only; no explicit locator in payload | mutable waypoint reference |
| photo | `{kind:"photo", entry}` | entry identity | mutable Photo source reachable through entry |

There is no global generic entry-only selection distinct from current `track`, no map-coordinate selection, and no route-polyline selection. Layer and Popup references are not stored in payloads, but popup state is stored beside selection and generated from the payload.

Editor selection is separate: `{trackId,segmentId,pointIds:Set}` over draft IDs, plus focused cell/point and local editing controller. It can select multiple points and reconciles on insert/delete/undo. Milestone has no semantic selection; its markers are presentation derived from track layers. Route-search request markers are plugin-session controls, not application selection.

## 5. Current Interaction Architecture

`src/core/interaction-hub.js` is a layer publication hub, not an input router. Producers call `syncEntry(entry)` after add/rebuild. Subscribers register optional `onTrackLayer`, `onWaypointLayer`, and `onPhotoMarker` callbacks. The hub immediately enumerates existing entries, publishes raw entry/layer/domain objects, and deduplicates layer objects per subscriber with `WeakSet`.

It lacks route layers/points, withdrawal/removal events, registration ownership, error isolation, conflict semantics, and semantic actions. Rebuilt layers are delivered as new objects; old ones are not withdrawn. `x-track-editor` attaches click callbacks and manually retains bindings for later removal. `x-milestone` attaches anonymous `add/remove` callbacks that cannot be detached.

Selection bindings bypass Interaction Hub and are installed directly in `core/boot.js`. Route-search/editor also attach their own map/layer events. Physical Leaflet propagation and z-order currently provide implicit arbitration.

## 6. Selection Definition and Lifetime

Selection is application-owned runtime state identifying the user's currently focused semantic object within one committed entry, independently of renderer and presentation.

It is ephemeral rather than persistent document data: it is not serialized, does not outlive the app, and may clear on semantic invalidation. Its root lifetime is the application, constrained by the selected entry and domain provider. A popup, marker, panel, or plugin may present/observe selection but does not own it.

```text
entry lifetime >= selection validity
domain provider lifetime >= entry lifetime
renderer lifetime independent of valid selection
popup/plugin presentation lifetime independent of selection state
```

## 7. Selection Cardinality

Recommendation: exactly zero or one global semantic selection.

Current Selection Hub is single-valued; popup/elevation behavior assumes one focus. Photo, waypoint, and track-point interactions replace one another. No current committed-data use case requires simultaneous selection.

Multiple editor draft points remain editor-session-local because they support a command operation, not application-wide focus. Future tree multi-select can introduce its own local selection or motivate a later explicit application-selection-set design. The descriptor shape and domain references do not prevent that evolution, but initial core should not pay for set ordering, mixed-domain operations, or partial invalidation.

## 8. Selection Identity

Recommended generic descriptor:

```js
{
  entryId,
  domain,
  ref, // immutable opaque domain selection reference
}
```

`entryId` roots lifetime and lookup. `domain` catches mismatches and selects the proper adapter. `ref` contains the domain's semantic kind/locator but generic core only freezes/stores/returns it.

This is preferable to generic `kind/locator` because a core kind enum would grow with every domain. A bare `targetId` forces every domain to invent stable IDs even when a revision-scoped locator suffices. Full domain-owned objects leak private data. References need not be globally serializable or meaningful outside their app/entry lifetime.

## 9. Domain Identity Stability

Identity strength is domain-defined and documented:

- **entry-lifetime stable:** best for naturally identified objects such as normalized feature IDs;
- **domain-revision stable:** sufficient for current normalized GPX positional locators when mutations explicitly reconcile;
- **render-generation stable:** insufficient for global selection and allowed only for private interaction binding identity.

Initial GPX can use opaque references containing a semantic kind, structural locator, and provider-known revision. Moving a point within the same revision/command can preserve or remap it; wholesale replacement invalidates by default. No persistent UUID is required for every point. The editor already creates local draft IDs because its mutation-heavy session needs stronger identity, but those IDs remain local.

## 10. Selection Snapshot vs Reference

SelectionStore stores only the immutable reference descriptor. Consumers call the domain adapter to resolve it into a current immutable semantic snapshot.

```text
SelectionStore.getCurrent()
  -> {entryId, domain, ref}
  -> domains.get(domain).selection.resolve(entryId, ref)
  -> current immutable domain snapshot or null
```

This avoids stale coordinate/elevation/name values after valid mutation. A generic cached display bag would reintroduce domain semantics and cache invalidation. Resolution is synchronous; selection should not require network or long computation. If resolution returns null, the coordinator queues domain invalidation and consumers treat the selection as unavailable until cleared.

## 11. Domain Selection Contract

Selection participation is an optional interface on a domain API/provider, not a Capability Registry. A participating domain conceptually provides:

- `create/validateRef(entryId, candidate)` through domain-owned methods;
- `resolve(entryId, ref)` to an immutable semantic snapshot;
- `equals(leftRef,rightRef)` or canonical references enabling equality;
- mutation reconciliation result;
- optional presentation-neutral description/bounds data through domain APIs.

Domains without this interface can still create/render entries but cannot create global sub-entry selections. Generic entry selection could later be a core-defined reference if a demonstrated UI need emerges; it is not required to fake domain support now.

## 12. Generic Selection Store

SelectionStore is app/core-owned and contains `null` or one frozen descriptor. Its conceptual API is:

```text
getCurrent()
request(domain-issued selection candidate, reason metadata)
clear(reason)
subscribe(scope, listener)
internal reconcile/invalidate from entry/domain coordinator
```

All mutations are serialized with entry/domain operations. A successful change commits before typed notifications. Selecting the canonically equal current reference is an idempotent no-op. The store never calls Leaflet, creates popups, or interprets `ref`.

External callers use a guarded facade. Internal removal/destruction has privileged invalidation authority but follows the same state transition path.

## 13. Selection Initiation and Validation

Callers do not construct arbitrary generic descriptors. They ask the domain selection interface to select a domain target or pass a domain-issued immutable candidate/token.

```text
renderer/UI domain action
  -> caller scope alive
  -> EntryStore confirms committed entry and matching domain
  -> domain adapter validates/canonicalizes reference synchronously
  -> SelectionStore compares and commits
  -> post-commit typed notification
```

Unknown entry, domain mismatch, missing selection interface, or invalid locator rejects before commit. Renderer existence is not required. Async validation is excluded initially because current domains can validate in memory and delayed selection creates race-prone UI.

## 14. Hidden and Invisible Targets

Semantic existence and visibility are separate. Hidden entries or domain-hidden objects may be selected programmatically from a tree/list, and an existing selection survives hiding. This matches current entry-visibility behavior and supports inspecting hidden items.

Map interaction cannot newly select an invisible target because its render binding is withdrawn/disabled. Presentation adapters suppress map popup/highlight when the selected target is not render-visible, while non-map UI may still highlight it.

If a domain mutation removes a target from its semantic model, that is invalidation rather than visibility and clears selection.

## 15. Selection Invalidation

Selection clears when:

- its entry begins removal or app clear;
- the domain reports the referenced semantic object no longer exists;
- an identity-preserving update explicitly returns `invalid`;
- the provider becomes unavailable through an invariant failure;
- app destruction begins.

It does not clear merely because:

- the entry/target is hidden;
- a marker/polyline/popup is removed or rebuilt;
- coordinates, elevation, timestamp, or label change while identity remains;
- a presentation plugin uninstalls;
- a popup closes.

Whole-source replacement invalidates by default unless the domain explicitly proves unchanged/remapped identity.

## 16. Domain Mutation and Reconciliation

Every committed domain mutation affecting the selected entry must produce one generic result for the current reference:

```text
unchanged       same identity and resolved semantics unchanged
refreshed       same reference; consumers must re-resolve changed values
remapped(ref)   same semantic target under a new canonical reference
invalid         target no longer exists
```

The domain mutation coordinator applies this result in the same serialized operation before post-commit domain/selection notifications. Generic core switches on the result tag but never interprets domain mutation data or `ref` contents.

Remapping is supported because it is inexpensive at the boundary, but domains are not required to provide it; initial GPX replacement may return invalid. Editor draft reconciliation remains local and richer.

## 17. Entry Removal Ordering

Consistent with Phase 2C:

```text
mark entry removing and exclude it from public lookup/mutation
  -> commit selection clear if it references the entry
  -> notify selection subscribers (entry already unavailable)
  -> withdraw entry/render interaction bindings
  -> close rendering and entry resources
  -> publish entry-removed notification
```

The domain provider/controller remains alive until entry-scope disposal completes. Selection presenters seeing the clear cannot resolve or mutate the removed entry, but can release their own UI. No callback sees a publicly usable half-removed entry or an interaction pointing to disposed rendering.

## 18. Selection Subscription

SelectionStore provides explicit `getCurrent()` plus change-only subscription. It does not invoke an immediate synthetic callback; callers read a snapshot, subscribe, then recheck/version as provided by the typed subscription primitive to avoid a race.

Each notification contains frozen `{ previous, current, reason }`. Delivery is synchronous after commit, scope-owned, liveness-guarded, exception-isolated, and uses a subscriber snapshot. Unsubscribe is idempotent. Reentrant mutation queues behind current delivery.

This replaces the current immediate replay, whose first `null` callback is easy to confuse with a real clear transition.

## 19. Selection Change Reasons

Use a small semantic reason set:

```text
requested          validated selection/replacement request
cleared            explicit clear request
entry-removed
domain-invalidated
app-destroyed
```

`refreshed` and `remapped` are state-change/reconciliation metadata where relevant; a refreshed reference may produce a notification so presenters re-resolve even when descriptor equality is unchanged.

Detailed origins such as map, chart, tree, or programmatic caller are optional diagnostics (`origin`/owner ID), not behavior-driving enums. Visibility change is not a clear reason under the recommended policy.

## 20. Interaction Definition

Interaction is the owned mapping from a concrete user input occurrence on a rendering/UI surface to a semantic application intent. It is not selection state, a raw event bus, rendering itself, or a general command system.

Selection is one possible intent. Other local intents—hover preview, drag edit, open context UI—may be handled by their owning renderer/session without entering a central application state.

## 21. Interaction Categories

Phase 2E standardizes only semantic routing categories needed for arbitration:

- `select`: request global semantic selection;
- `activate`: host/domain-defined primary activation, if distinct from select;
- `context`: request context presentation/action;
- `background`: map-level action with no semantic target.

Hover/focus is normally local ephemeral presentation; editor drag/insert/delete remains session-local. Physical events (`click`, `pointermove`, `keydown`) are renderer details translated by bindings. New semantic categories require typed host support, not arbitrary strings on a global bus.

## 22. Interaction Registration Model

Bindings are registered per rendered interactive surface, not per semantic data object when a renderer can resolve hits dynamically. A conceptual binding records:

```text
owner scope
host/surface identity
render binding identity (private diagnostics/removal)
precedence tier
physical event attachment/disposer
domain-owned resolver -> semantic intent/reference
primary/consume behavior
```

Entry renderer bindings are owned by the active entry rendering-generation scope. UI bindings are owned by their surface scope; editor bindings by the session child. Registration is staged with render preparation where possible and withdrawn synchronously on scope close.

Interaction registration exposes neither Leaflet layers nor callbacks to unrelated subscribers.

## 23. Semantic vs Rendering Identity

One semantic GPX point may be targeted by a polyline nearest-point hit, elevation chart point, or tree row. Each surface has a different render binding but asks the GPX adapter for the same canonical selection reference.

Conversely one polyline represents many points and resolves a click dynamically. Render binding identity is valid only for its generation and exists for cleanup/conflict diagnostics. It is never stored in SelectionStore.

## 24. Layer Event Routing

Use a hybrid local-binding model:

- renderers attach owned Leaflet/DOM listeners through helpers;
- a listener performs renderer/domain hit testing;
- the domain adapter canonicalizes a semantic target;
- the binding submits a typed intent to the interaction host/SelectionStore;
- host arbitration/propagation decides whether lower tiers run.

GPX track clicks keep one listener per polyline and nearest-point calculation; no per-point registrations. Waypoint/Photo/route markers use one binding per rendered marker because those objects already exist. Editor markers stay session-local unless intentionally selecting committed data.

A central catalog of every Leaflet object would recreate the current Interaction Hub leak without improving routing.

## 25. Interaction Conflict Semantics

Native DOM/Leaflet event targeting and propagation first determine applicable surfaces. Within one interaction host occurrence:

1. the highest active precedence tier is considered;
2. at most one primary binding may claim the same surface target/event/tier;
3. a successful exclusive/consuming primary stops lower tiers;
4. non-consuming host-defined presentation observers, if supported, cannot mutate semantic state directly;
5. duplicate primary claims are a registration/preflight conflict, not ordered callbacks.

Overlapping independent map objects follow Leaflet hit/propagation rules; bindings should stop propagation when their semantic action consumes the event. This is deterministic without a general arbitration framework.

## 26. Interaction Priority

Use host-defined tiers:

```text
modal       active editing/drawing/session capture
object      normal domain object or UI item
background  map/container fallback
```

There are no arbitrary numeric priorities. The track editor's active session installs modal bindings/suppression so normal GPX object/background actions do not race. Outside a session its entry-selection binding is normal object behavior. Tier is semantic to the host and validated; plugin install order is irrelevant.

## 27. Interaction Ownership

Every binding has one owner:

- entry-render generation owns normal domain bindings;
- editor session owns draft/edit bindings;
- UI surface scope owns UI interactions;
- plugin scope owns genuinely plugin-global bindings;
- app/core host owns background map behavior.

The physical listener and semantic resolver are one disposal record or tightly coupled records. Owner close marks binding inactive before detaching. Dispatch checks owner, entry, domain, and render-generation liveness immediately before invoking. Dead owners never receive callbacks.

## 28. Interaction Withdrawal and Rendering Replacement

Withdrawal order is:

```text
mark binding inactive
  -> remove from host arbitration/index
  -> detach physical listener
  -> dispose referenced render resource
```

Renderer replacement prepares new rendering and bindings in a sibling generation, commits the generation switch, withdraws old bindings, then disposes old resources. A valid semantic selection remains. New presentation adapters/rendering read `SelectionStore.getCurrent()` after activation or subscribe before switch using the race-safe snapshot protocol to render selected styling.

Editor session end withdraws modal bindings before draft layers. Plugin uninstall closes sessions before plugin-global UI. App destroy clears selection, then follows entry/plugin disposal order.

## 29. Popup Ownership

SelectionStore owns no popup. Recommended ownership is a scope-owned map selection presentation adapter, potentially domain-specific or composed through Phase 2F contributions.

The adapter subscribes to selection, resolves domain presentation data, creates/removes its Popup and highlight, and uses domain-provided description/bounds without exposing raw data to core. Different presenters may coexist (map popup, elevation, tree highlight) without becoming selection authorities.

This removes `selection-hub.js` imports of `map/layers.js` and allows Photo UI/popup code to remain optional.

## 30. Popup Close Semantics

Closing a popup dismisses only that presentation. It does not clear semantic selection. Clearing/replacing selection causes the adapter to close its popup.

This one-way authority avoids `clear -> close -> popupclose -> clear` loops and delayed `popupclose` races tested in the current hub. The adapter associates a generation token with each popup and ignores close events for obsolete popups.

If a future UX explicitly wants “dismiss equals deselect,” the adapter may issue a normal guarded clear request for its still-current selection token; that is an opt-in policy, not core semantics.

## 31. Selection Presentation

```text
SelectionStore typed changes
  ├─ map popup/highlight adapter
  ├─ elevation presenter
  ├─ layers/tree presenter
  └─ domain-specific accessibility/UI presenter
```

Each adapter owns its UI resources/subscription and re-resolves current domain data. Failure in one adapter is reported as presentation failure and does not alter semantic selection or stop other subscribers. UI schemas and visual/accessibility rules belong to Phase 2F.

## 32. Domain Presentation Data

Popup/chart/tree presenters obtain data through domain APIs such as a selection resolver or presentation descriptor method. Generic selection never gains `label`, coordinates, elevation, Photo metadata, or arbitrary `data`.

A domain may return typed immutable snapshots tailored to a registered presentation contract. Generic core transports the reference and lifecycle only. If resolution fails, semantic invalidation is scheduled; the presenter does not retain its last snapshot as if still current.

## 33. Selection and Viewport Behavior

Selection does not imply pan, zoom, fit, or reveal. Those are separate presentation/viewport intents.

A map click may request selection without moving the map. Elevation chart activation may request selection and then ask a guarded map presenter to reveal the target. A tree may select a hidden entry without revealing it. This removes current `selectPhoto/selectTrackPoint({panTo})` coupling and keeps SelectionStore independent of Leaflet.

## 34. Global vs Session-Local Selection

Use one global SelectionStore plus ordinary private plugin/session state. Do not create generalized nested selection stores.

A target belongs globally when it is part of committed application data and multiple independent subsystems benefit from a shared focus. A target remains local when it exists only within a transient operation, supports tool-specific multi-selection/commands, or has no stable committed-entry identity.

Thus editor draft points, route-search origin/via/destination markers, rectangle selections, and hover are local. A committed GPX point, waypoint, route point, Photo, GeoJSON feature, or marker item may be global.

## 35. `x-track-editor` Validation

Before editing, clicking a committed GPX layer may request a global GPX entry/track selection and set editor source choice. Starting a session copies GPX data and creates a session child scope.

Draft point IDs, multi-selection Set, inspector focus, rectangle selection, history reconciliation, and draft overlay remain session-local. Insert/delete/move/undo therefore do not burden global SelectionStore. Removing the original entry cancels the session via EntryStore subscription; session bindings/layers dispose. Cancel/uninstall removes all local state.

Save Copy creates a new app-owned GPX entry. It does not promote draft selection. The editor may explicitly select the new committed entry/target afterward, but no local scope or identity is transferred.

## 36. Elevation Validation

Elevation uses `domains.require("gpx")` and a scope-owned SelectionStore subscription. Chart interaction asks GPX to create/validate a track-point reference, commits selection, and separately requests reveal if desired.

On selection change it resolves the current GPX snapshot, updates chart/highlight, and shows no GPX UI for other domains. A moved point returning `refreshed` causes re-resolution; deletion returns invalid and clears; entry removal clears before disposal. Popup behavior belongs to the map presenter, so elevation no longer listens to `popupopen/popupclose` or manages popup timers. Uninstall removes its subscription and markers automatically.

## 37. Layers / Tree UI Validation

The host lists generic entry snapshots and obtains domain child descriptors/actions through Phase 2F contributions/domain APIs. It compares selection by entry ID plus domain reference using the provider adapter, not raw object identity.

A row can ask the domain to select a target, including a hidden one. Deletion causes ordered selection invalidation followed by entry removal; the tree receives both typed changes. Domain-specific children and visual schema remain outside Phase 2E.

## 38. Photo Validation

Photo marker binding is owned by the Photo entry render generation. Click asks the Photo domain for the entry/Photo reference and selects it. The map presenter resolves current Photo metadata and opens a popup.

Popup close leaves selection. Time-mode change may return `refreshed`; marker rendering can rebuild while selection remains and the new presenter/binding uses the same semantic reference. Hiding removes/suppresses marker interaction and popup presentation but retains selection. Entry removal invalidates selection before marker/URL disposal. Removing a Photo UI presenter closes only its UI; the Photo selection and provider remain valid.

## 39. GPX Validation

- Track polyline click performs nearest-point hit testing and selects a revision-scoped GPX point reference.
- Waypoint and route-point markers produce domain references without storing waypoint objects.
- Route-polyline/track selection can be added as GPX reference kinds without core enum changes.
- Point move returns refreshed or remapped; delete returns invalid; segment/track deletion reconciles according to the provider.
- GPX track/entry visibility does not clear semantic selection but removes map interactivity/presentation.
- Renderer rebuild replaces bindings only and preserves selection.
- Entry removal clears through generic entry-root invalidation.

## 40. `x-milestone` Validation

Current milestone observes raw track layers to add distance markers. Its markers do not initiate selection and it has no selected semantic target. Therefore it is not a Selection or semantic Interaction consumer.

Future milestone should use GPX immutable track data plus a typed rendering/presentation augmentation point or domain-owned overlay contribution, with its markers owned by the relevant entry-generation/plugin scope. Exact rendering extension belongs to a later renderer/Phase 2F design. Recreating the current raw-layer Interaction Hub solely for milestone would violate domain privacy and withdrawal guarantees.

If milestones later become selectable, GPX (or a milestone domain integration) must define a canonical semantic reference; marker object identity remains insufficient.

## 41. Route Search Validation

Origin/destination/via markers and context-menu map clicks are request/session-local interaction bindings owned by the route-search plugin or request child. Their drag/focus state is not global SelectionStore state.

Committed route results become GPX entries and thereafter use normal GPX interactions/selection independent of route-search lifetime. Route-search uninstall removes preview/control bindings but not committed entries or their semantic selection. A future native route-result domain follows the same split.

## 42. Future Domain Validation

- GeoJSON uses `{entryId,domain:"geojson",ref:<feature reference>}`; feature IDs may be entry-stable or revision-scoped. Rendered polygons and tree rows converge on it.
- Marker collection uses a marker-item reference; rebuilt/clustering markers do not change identity.
- Native route results define route/leg/point references and reconcile on route revision.

No new core selection kinds, payload fields, or Interaction Hub callbacks are required.

## 43. Error Semantics

| Code | Meaning/commit state |
|---|---|
| `UNKNOWN_ENTRY` | selection rejected before commit |
| `SELECTION_DOMAIN_MISMATCH` | entry and requested domain differ; rejected |
| `INVALID_SELECTION_REFERENCE` | domain validation failed; rejected |
| `SELECTION_TARGET_GONE` | resolution/reconciliation found disappearance; later invalidation |
| `DEAD_CALLER_SCOPE` | request/binding forbidden before commit |
| `STALE_INTERACTION_BINDING` | withdrawn binding attempted dispatch |
| `INTERACTION_CONFLICT` | duplicate primary binding/claim; registration or dispatch rejected |
| `DOMAIN_UNAVAILABLE` | provider invariant/liveness failure |
| `SELECTION_VALIDATION_FAILED` | adapter threw; rejected, prior selection unchanged |
| `SELECTION_NOTIFICATION_FAILED` | selection committed; subscriber failures aggregated |
| `SELECTION_PRESENTATION_FAILED` | semantic selection remains; one adapter failed |

Errors include entry/domain/binding IDs and whether a state mutation committed. Expected stale physical events after withdrawal are ignored or diagnosed at debug level rather than surfaced as user failures.

## 44. Reentrancy and Serialization

Selection, entry removal, and domain reconciliation use the app's serialized mutation queue:

1. validate against current committed entry/domain state;
2. commit one state transition;
3. snapshot and deliver notifications;
4. enqueue subscriber-requested select/clear/removal after current delivery;
5. isolate callback failures.

A popup close requesting optional clear carries the selection token it presented; the queued clear is ignored if current selection changed. An interaction may request entry removal, but removal queues after the interaction's current semantic action and revalidates. Entry removal's selection clear completes before interaction withdrawal/resource disposal as specified in section 17.

## 45. Testing Model

Selection unit tests:

- initial null, valid select, replacement, explicit clear, equal-reference no-op;
- unknown entry/domain mismatch/invalid reference rejection with prior state retained;
- entry removal and app clear/destroy invalidation;
- unchanged/refreshed/remapped/invalid reconciliation;
- hidden selection persistence and invisible interaction absence;
- snapshot/subscription race protocol, unsubscribe, callback isolation;
- reentrant select/clear queue ordering and reason metadata.

Interaction unit tests:

- scope-owned binding registration/withdrawal and stale-event gating;
- modal/object/background precedence and duplicate primary conflict;
- native propagation consumption;
- renderer generation switch before old resource disposal;
- polyline hit test without per-point registration;
- entry removal withdrawal ordering.

Presentation tests:

- popup/highlights follow resolved selection;
- popup failure/close does not corrupt selection;
- selection clear closes current popup without feedback loop;
- refreshed selection re-resolves; stale popup generation ignored.

Integration/smoke tests cover GPX nearest point, waypoint, route point, Photo marker/rebuild/hide/remove, elevation chart, editor session/local multi-selection, route result, plugin uninstall, and app destruction.

## 46. Migration Pressure

| Current file/API | Direction |
|---|---|
| `src/core/selection-hub.js` | replace/split into generic SelectionStore and presentation adapter |
| `src/core/interaction-hub.js` | remove raw layer publication; replace with owned interaction binding infrastructure |
| `src/core/boot.js` selection binders | move to GPX/Photo renderers and domain adapters |
| `src/core/state.js` entry references | replace with EntryStore IDs/snapshots from Phase 2C |
| GPX/Photo overlay builders | move bindings to domain renderer generation scopes |
| popup builders/ownership | move domain data formatting to domain APIs and popup resource to presenter |
| layers control | move selection UI to Phase 2F contributions + SelectionStore |
| elevation panel | domain API + SelectionStore; remove raw core/popup event coupling |
| `x-track-editor` | retain local selection concept; migrate committed-entry observation/actions |
| `x-milestone` | move to rendering/domain presentation augmentation; not Interaction Hub |
| route search | retain local marker interactions; committed results use domain selection |
| current selection/interaction tests | replace payload/layer expectations with semantic references, ownership, reconciliation |
| smoke tests | retain UX outcomes while adding popup/selection separation and rebuild persistence |

## 47. Requirements Passed to Phase 2F

Phase 2F may assume:

- one app-owned zero-or-one semantic SelectionStore;
- immutable `{entryId,domain,ref}` descriptors and explicit `getCurrent()`;
- typed change-only subscriptions with reason/reconciliation metadata;
- guarded domain resolution/description APIs;
- semantic selection independent of visibility, rendering, popup, and viewport;
- owned interaction bindings with modal/object/background precedence;
- renderer replacement preserving valid selection;
- presentation adapters own popups/highlights and failures are isolated;
- popup close does not clear selection by default;
- editor/session-local focus remains private.

Phase 2F must define presenter/contribution schemas, visual state, keyboard/accessibility behavior, host group structure, and optional dismiss-to-clear UX without changing semantic authority.

## 48. Recommended Architecture

```text
                         User input
                             |
                renderer / UI / session surface
                             |
             owned physical Interaction binding
             (modal | object | background)
                             |
                domain hit-test / valid ref
                             |
                      semantic intent
                             v
                       SelectionStore
                 {entryId, domain, opaque ref}
                             |
              typed post-commit subscription
             +---------------+---------------+
             |               |               |
       map presenter    elevation UI    layers/tree UI
             |               |               |
             +------ domain.resolve(ref) -----+

EntryStore
  -> validates entry/domain root
  -> invalidates selection before removal
  -> withdraws render bindings before resources

Domain provider
  -> creates/validates/resolves refs
  -> reconciles refs after mutation

Ownership scopes
  -> own bindings, subscriptions, popups, highlights, sessions
```

SelectionStore and interaction-host primitives are core mechanisms. Target semantics and hit testing are domain-owned. Physical events/render objects are renderer-owned. Popup/highlight/chart/tree state is presentation-owned.

## 49. Core Invariants

1. Global selection is always null or one immutable semantic reference.
2. Every non-null selection roots in one currently committed entry and matching domain.
3. Generic selection state contains no mutable domain objects, render objects, or presentation data.
4. Generic core never interprets opaque domain refs or enumerates GPX/Photo target kinds.
5. Only a domain selection adapter can validate/canonicalize its targets.
6. Selection identity and render identity are distinct.
7. Renderer replacement alone never invalidates semantic selection.
8. Entry removal invalidates its selection before interaction/resource disposal.
9. Domain mutation explicitly returns reconciliation for the current reference.
10. Hidden semantic targets may remain selected; invisible renderings cannot emit interactions.
11. Selection commit precedes notification; callback failure cannot roll it back.
12. Equal canonical selection requests are idempotent.
13. Interaction maps physical input to semantic intent; it does not store selection.
14. Every interaction binding has exactly one owner scope.
15. Withdrawn/dead bindings cannot invoke semantic actions.
16. Interaction precedence uses host-defined tiers, never plugin install order.
17. GPX polyline selection does not require per-point bindings.
18. Popup and viewport state are not SelectionStore state.
19. Popup close does not clear selection by default.
20. Presentation failures do not corrupt semantic selection.
21. Draft/session-only objects use local selection unless committed application identity exists.
22. Plugins gain no mutable entry/domain access through selection or interaction.

## 50. Open Questions Requiring Human Decision

1. **Cardinality:** global single selection versus set/per-domain. Recommendation: zero-or-one global; local tool multi-selection stays private. Blocks SelectionStore shape.
2. **Identity:** opaque target ID versus domain-qualified reference. Recommendation: `{entryId,domain,ref}`. Blocks domain adapter contract.
3. **GPX identity strength:** stable IDs versus revision locators. Recommendation: revision-scoped locators plus explicit reconciliation initially; no universal UUIDs. Does not block generic store.
4. **Stored value:** full snapshot versus resolvable reference. Recommendation: reference only, synchronously resolved. Blocks payload API.
5. **Domain participation:** mandatory versus optional selection interface. Recommendation: optional; nonparticipating domains remain valid entries. Blocks DomainRegistry optional interface.
6. **Hidden targets:** clear/forbid versus retain/allow semantic selection. Recommendation: retain and allow programmatic selection; suppress map interaction/presentation. Blocks visibility tests.
7. **Mutation:** always clear versus domain reconciliation. Recommendation: `unchanged/refreshed/remapped/invalid`. Blocks domain mutation integration.
8. **Interaction model:** raw-layer publication, central object catalog, or owned local binding. Recommendation: owned local binding plus semantic host routing. Blocks renderer integration.
9. **Conflict/priority:** callback order/numeric priority versus host tiers. Recommendation: modal/object/background and duplicate-primary rejection. Blocks interaction host.
10. **Popup ownership:** SelectionStore, renderer, or presenter. Recommendation: scope-owned presentation adapter. Blocks popup migration.
11. **Popup close:** clear selection versus dismiss presentation. Recommendation: presentation only; optional adapter policy may request guarded clear. Blocks UX tests.
12. **Editor drafts:** global versus session-local. Recommendation: local, because they are transient and multi-selected. Does not block core implementation.
13. **Reason metadata:** extensive UI origins versus small semantic reasons. Recommendation: small reason enum plus diagnostic origin. Blocks notification payload.
14. **Replay:** immediate callback versus explicit snapshot/change-only subscription. Recommendation: explicit `getCurrent()` with race-safe subscription protocol, no synthetic replay. Blocks subscription API.
15. **Same-reference refresh:** no notification versus reconciliation notification. Recommendation: emit a `refreshed` change so presenters re-resolve without inventing domain events. Blocks reconciliation delivery.
16. **Milestone integration:** preserve layer subscription versus later rendering augmentation. Recommendation: later typed rendering/domain contribution; do not retain raw Interaction Hub. Does not block SelectionStore but affects migration planning.

## 51. Files and Symbols Consulted

- `plugin-architecture/DESIGN.md` — generic-core/domain and lifecycle principles.
- `plugin-architecture/PHASE-1-INVENTORY.md` — current selection/interaction baseline.
- `plugin-architecture/phase-2/RUNTIME-DESIGN.md` — runtime serialization and destruction.
- `plugin-architecture/phase-2/OWNERSHIP-DESIGN.md` — owned subscriptions/bindings, liveness, child scopes.
- `plugin-architecture/phase-2/ENTRY-DOMAIN-DESIGN.md` — entry identity, removal, domain reconciliation constraints.
- `plugin-architecture/phase-2/EXTENSION-MECHANISMS-DESIGN.md` — typed registrations/subscriptions and guarded facades.
- `src/core/selection-hub.js` — current state, popup creation, reentrancy, selection payloads.
- `src/core/interaction-hub.js` — raw layer publication/deduplication.
- `src/core/boot.js` — GPX/Photo bindings, replacement/removal invalidation.
- `src/core/state.js` — current mutable entry identity/data.
- `src/gpx/interpretation.js`, `source.js` — structural locators and nearest-point resolution.
- `src/map/layers.js` — GPX/Photo rendering and popup content.
- `src/plugins/ui/elevation-panel.js` — selection consumer/initiator, hover/reveal/popup coupling.
- `src/plugins/ui/layers-control.js` — entry/domain UI and visibility/removal paths.
- `plugins/x-track-editor/loader.js`, `selection.js`, `selection-overlay.js`, `editing-layers.js`, `rectangle-selection.js` — local IDs, multi-selection, reconciliation, bindings.
- `plugins/x-milestone/loader.js` — raw track-layer subscription and presentation markers.
- `plugins/x-route-search/loader.js` — local route-point marker interactions and committed results.
- `tests/selection-hub.test.js` — payload, popup, close/reentrancy, subscription behavior.
- `tests/interaction-hub.test.js` — current publication/replay/deduplication behavior.
- `tests/boot.test.js` — replacement/removal/visibility selection behavior.
- `tests/x-track-editor-*.test.js`, `x-milestone.test.js`, `x-route-search-*.test.js` — plugin-local interaction behavior.
- `tests/smoke/editor.spec.js`, `viewer-elevation.spec.js`, `viewer-file-import.spec.js` — integrated selection/popup/editor UX.

---

No source code was modified. This design investigation created only `plugin-architecture/phase-2/SELECTION-INTERACTION-DESIGN.md`.

- Unit tests: `npm test` — 37 files, 336 tests passed.
- Smoke tests: `npm run test:smoke` — 28 tests passed.
- Formatting check: `git diff --no-index --check /dev/null plugin-architecture/phase-2/SELECTION-INTERACTION-DESIGN.md` — no whitespace errors reported (exit status `1` is expected because the new file differs from `/dev/null`).
