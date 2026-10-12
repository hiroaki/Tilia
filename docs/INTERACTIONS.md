[日本語](INTERACTIONS.ja.md)

# Public interaction contracts

This reference describes the current APIs available to plugin and renderer authors. Read it alongside [plugin development](PLUGIN-OPERATIONS.md), [Scope ownership](PLUGIN-OPERATIONS.md#5-own-resources-with-scope), and [semantic selection](API.md#semantic-selection). Examples below are fragments within `setup(context)`; named application callbacks and options must be supplied by the plugin.

## API boundaries

| API | Consumer and operations | Ownership, errors, and contract boundary |
| --- | --- | --- |
| `context.interactions` | Ordinary plugins: `mapSurface()`, `createSurface(options)`, `bind(options)` | Owned surfaces and primary bindings, synchronous decisions, Host arbitration and diagnostics; detailed below |
| Renderer `input.interactions` | Renderer build: generation-owned surfaces and domain-target resolvers | Staged, current-generation/visibility checked; a different facade from the ordinary plugin API |
| `context.map.listen(type, callback)` | Plugins: subscribe to events delivered to the Leaflet Map | Plugin-owned, guarded, non-consuming subscription; no Host arbitration or callback error isolation |
| `context.map.advancedLeafletMap()` | Advanced plugins: borrow the actual Leaflet Map | Access is checked when acquired; retained raw objects are not guarded. The plugin owns its effects, not the Map |
| `context.selection` | Plugins: query, request, clear, and subscribe to semantic selection | Consumer-bound facade; domain-issued candidates and semantic errors, not raw physical input |
| `context.scope`, `context.lifecycle.afterCommit` | Plugins: own effects and arrange post-installation work | Existing Ownership Kernel and setup lifecycle; see the development guide |

Use the context facades rather than importing internal factories. `createInteractionHost`, `interactionInput`, `createFacade`, `withPublication`, Scope controllers/operational-check helpers, Selection Store/Coordinator, and application background-binding setup are internal. Their existence is not an additional plugin API. There is no public `app.interactions` facade. The interfaces below describe existing methods, not exported TypeScript declarations.

The documented operations, ownership boundaries, arbitration, and decisions are the contract. Internal storage, private generation tokens, listener counts, exact error messages, and unsupported return combinations are not stability guarantees. Leaflet-specific escape-hatch code remains dependent on the installed Leaflet version.

## Surfaces and binding registration

```ts
context.interactions.mapSurface(): InteractionSurface;
context.interactions.createSurface({
  id: string,
  target: DOMEventTarget | LeafletEvented,
  parent?: InteractionSurface, // default: map root
  scope?: Scope               // default: consumer scope
}): InteractionSurface;
context.interactions.bind({
  id: string,
  surface: InteractionSurface,
  event: SupportedPhysicalEvent,
  tier: "modal" | "object" | "background",
  scope?: Scope,              // default: consumer scope
  handle(input: InteractionInput): InteractionDecision
}): DisposableHandle;         // dispose(): Promise<void>
```

- A **handle** is an opaque identity belonging to this Host. Its `id` is a label, not a lookup key or a physical-target identity.
- The **target** receives the listener: it must support `on/off` or `addEventListener/removeEventListener`. Own the target's resources separately. Creating a surface does not attach a layer or mount DOM, and listener attachment occurs only on binding.
- The **owner Scope** must be the consumer itself or its descendant. A binding owner and its surface owner can be different descendants of the same consumer.
- The **logical parent** is explicit (or defaults to the map root). It is not inferred from DOM nesting, Leaflet layer groups, or event bubbling. A supplied parent must be a valid handle in this Host; its lifetime also limits descendant validity. An ancestry link does not grant ownership of the parent target.

`mapSurface()` returns the shared, application-owned root. Plugins may bind there or to child surfaces owned within their consumer. Binding to another consumer's child surface is rejected; there is no public discovery of GPX/Photo private surfaces. Keep one managed surface identity per physical target; separate handles for the same target are not a supported way to evade exclusivity or coordinate handlers.

There is no surface `dispose()` method. Ending its Scope closes it and invalidates descendant surfaces even if their independent owners remain alive. Disposing a binding removes that binding, not its surface or target; other valid event/tier bindings can remain. Use a dedicated child Scope when a surface itself needs a shorter lifetime.

`background` requires the map root. Within a surface handle/event/tier, only one primary binding is allowed, regardless of binding ID or whether its handler would decline. Registration reserves the slot immediately, including staged renderer bindings. Conflicts reject registration; there is no priority, replacement, or waiting policy. A revoked binding whose cleanup failed may still reserve its slot while its owner is alive: revocation does not guarantee successful cleanup or immediate slot reuse.

Surface and binding IDs must be nonempty strings. They do not establish global uniqueness or override an existing registration.

Invalid options, foreign/closed surfaces, unsupported event names, and invalid ownership reject synchronously (typically `TypeError`); duplicate registration currently throws `Error`. Scope/generation/adapter failures can also propagate. No dedicated public interaction error code exists; do not depend on exact messages or assume every error is a `RenderingError`.

## Input and event coverage

`handle` receives an immutable projection:

```ts
interface InteractionInput {
  type: SupportedPhysicalEvent;
  latlng: Readonly<{ lat: number; lng: number }> | null;
  key: string | null;
  button: number | null;
  shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean;
}
```

The binding's event name supplies `type`. Coordinates are copied from the delivered event's `latlng`; DOM coordinates are not converted to map coordinates. Key/button/modifiers come from `originalEvent` when present, otherwise the delivered event. Missing key/button/coordinates become `null`, and missing modifiers become `false`. There is no raw event, semantic hit target, pointer ID, pointer capture, touch list, or `preventDefault` method in this input.

Accepted registration names are `click`, `preclick`, `dblclick`, `mousedown`, `mouseup`, `mousemove`, `mouseover`, `mouseout`, `contextmenu`, `keydown`, `keyup`, `pointerdown`, `pointerup`, `pointermove`, `touchstart`, and `touchend`. Acceptance means the Host can bind that name, not that every target emits it. The installed Leaflet 2.0.0-alpha.1 Map uses pointer input; its normal DOM registration does not emit all the accepted mouse/touch names. Conversely, `pointerover`, `pointerout`, `pointercancel`, `keypress`, and map lifecycle events such as `moveend` are not accepted by Host `bind`.

Click, preclick, and double click are separate events. Host has no single/double-click recognizer, drag sequence, long-press recognizer, or multi-touch arbitration. A touch-generated click can use the click route; device-specific long press/contextmenu behavior needs browser/device validation. A marker's Leaflet `latlng` can describe the marker position rather than the precise pointer position.

## Dispatch and arbitration

For an occurrence delivered through a managed surface, the Host snapshots eligible bindings for that event, then orders them:

1. `modal` on the origin and its logical ancestors, deepest first.
2. `object` on the originating surface only (not ancestor object bindings).
3. `background` on the map root.

Thus a root modal is evaluated from an object's dispatcher before the object action, without waiting for the later Map bubble. Exclusivity resolves same-surface ties by rejecting registration, not by sorting accepted handlers. Competing registrations do not form an installation-order-independent tool-selection policy: the already reserved slot rejects a subsequent competitor.

**Background is a dispatch stage, not an empty-area hit test.** An object that consumes prevents that stage. An object that declines, or has no eligible object binding, can reach it while the origin remains valid. Application composition currently reserves root `click/background` to consume and clear semantic selection (a state no-op when nothing is selected). It survives Map Selection Presenter removal. Plugins cannot register a second binding in that slot; root modal interception also precedes normal object selection, so it is not background-only authority.

Before each handler and action, activity/disposal, owner operational authority, surface ancestry, and currentness are rechecked. Invalidated candidates are skipped, allowing otherwise valid candidates to proceed in the existing order. If the origin loses Scope/surface validity, processing ends. An obsolete originating generation or an occurrence received during internal rendering publication is suppressed defensively rather than treated as ordinary background input.

Bindings added during a dispatch do not join its snapshot. Disposal and Scope revocation affect it immediately. Reentrant dispatch of the same occurrence does not execute it again; a distinct occurrence can dispatch synchronously, with its own current candidates. Do not assume that callbacks cannot reenter.

For adapter authors: occurrence identity uses the native event for DOM, or Leaflet `originalEvent` when present (otherwise the delivered object), together with event type and Host. Later bubbling of that occurrence does not rerun arbitration, even after decline. `preclick` and `click` remain separate types. Supply a fresh event carrier for a distinct synthetic occurrence; reusing one carrier for multiple independent same-type events is unsupported. WeakMap bookkeeping and implementation details are private.

## Decisions, actions, and errors

```ts
type InteractionDecision =
  | { consume: false }
  | { consume: true; run?: () => void | Promise<void> };
```

`handle` must synchronously return a decision. Use it to decide eligibility; place the chosen effect in `run`. Decline continues arbitration. Consume is recorded immediately, then native/Leaflet propagation is stopped, authority is rechecked, and optional `run()` starts synchronously. Consume without an action is valid.

| Situation | Current guarantee |
| --- | --- |
| `handle` throws, returns a Promise, or returns an invalid decision | Diagnose and consume defensively; lower Host handlers do not run. A returned Promise's rejection is observed |
| Binding/surface/authority is revoked after a consumed decision | Do not start the action; keep consumption |
| `run` throws or rejects | Diagnose; do not retry arbitration or invoke lower handlers |
| `run` fulfills | Does not change consumption |

Host catches handler/action failures and forwards them to application diagnostics. Failures in the diagnostic reporter are contained. Errors during registration/cleanup instead follow those operations' synchronous/Promise error paths. A callback that mutates state before throwing is not rolled back.

`{ consume: false, run: someAction }` is outside the supported decision contract. The current implementation ignores a function-valued `run` in that combination, but plugins must not rely on that tolerance. Additional properties, unusual thenables, and exact validation messages are not public guarantees. This documentation does not change runtime validation.

## Lifecycle and setup

Scope existence, `alive`, operational authority, and cleanup completion differ. `alive` describes local open/active ownership; shutdown can fence operations while it remains true. Use `assertAlive()` for operational checks and `guard()` for callback entry. Closing a Scope revokes its subtree and aborts signals before asynchronous cleanup completes. Host also checks the application-owned origin/root, so an independently alive plugin cannot dispatch after app authority ends.

Explicit binding `dispose()` revokes dispatch eligibility immediately, before listener removal. Removal failure or pending cleanup does not restore authority; observe the returned Promise for cleanup errors. Ending a child Scope revokes all its bindings. An already consumed decision stays consumed if disposal occurs during `handle` or propagation stopping.

Host only prevents **new** handler/action invocation. It cannot undo execution already begun, automatically cancel a `run` Promise, or fence a continuation after `await`. `run` rejection is observed, but it is not automatically registered with `scope.track`, awaited at shutdown, or passed an AbortSignal. Owners must use their existing Scope signal, post-`await` authority checks, and task tracking when needed. Disposing just the binding leaves its owner alive; use an operation child Scope if ending the interaction should also revoke in-progress work.

Ordinary `context.interactions.bind` and `context.map.listen` attach immediately, even during plugin setup. Surface creation registers ownership but not a listener. Installation failure cleans owned resources but cannot undo already performed actions or network requests. For effects that must start after successful installation, register a void-returning `context.lifecycle.afterCommit` callback during setup. Errors there are diagnosed without rolling back the committed plugin; handle registration conflicts explicitly.

## Existing usage examples

This fragment assumes `marker` is a plugin-created Leaflet marker, `handleModifiedClicks` is a plugin option, and `showLocalCoordinate` is plugin code. Attachment and surface have different ownership operations. The helper ends the whole local operation; callers must await or catch its Promise.

```js
const operation = context.scope.child({ label: "marker-interaction" });
let binding;
context.lifecycle.afterCommit(() => {
  operation.assertAlive();
  const attachment = context.map.attachLayer(marker, { band: "overlays" });
  operation.defer(() => attachment.dispose(), { retry: "safe" });
  const surface = context.interactions.createSurface({
    id: "local-marker", target: marker, scope: operation,
  });
  binding = context.interactions.bind({
    id: "local-marker-click", surface, event: "click", tier: "object",
    scope: operation,
    handle(input) {
      if (!input.latlng || (input.shiftKey && !handleModifiedClicks)) {
        return { consume: false };
      }
      return { consume: true, run: () => showLocalCoordinate(input.latlng) };
    },
  });
});
async function stopLocalOperation() {
  await operation.dispose(); // also removes the binding and attachment
}
// To remove only the binding after registration: await binding.dispose().
```

For a safe async action, use the owning operation's signal and recheck it after suspension. This `run` fragment assumes `requestCoordinateInfo` accepts an AbortSignal. No semantic entry is needed for `lastResult`.

```js
return {
  consume: true,
  run: async () => {
    const result = await requestCoordinateInfo(input.latlng, {
      signal: operation.signal,
    });
    operation.assertAlive();
    lastResult = result;
  },
};
```

For non-consuming Map subscriptions, the following stores only plugin-local state. Multiple subscribers can coexist, but it does not promise every managed click will reach the Map. End this subscription with `listener.dispose()`; it has synchronous cleanup, unlike the Host binding's Promise-returning handle.

```js
let lastCoordinate = null;
context.lifecycle.afterCommit(() => {
  const listener = context.map.listen("click", ({ latlng }) => {
    if (latlng) lastCoordinate = latlng;
  });
  // Call listener.dispose() if this subscription should end before plugin removal.
});
```

## Host versus Leaflet

Host consume suppresses lower managed handlers and attempts native/Leaflet propagation stopping. It does not call `preventDefault` or `stopImmediatePropagation`, and it does not disable Map handlers. Independent listeners on the same Leaflet target can still run; raw DOM capture or layer propagation rules can prevent Host from receiving an event at all.

`map.listen` subscribes to the Map outside Host arbitration, with a frozen `{ type, latlng, layerPoint, containerPoint }` projection. It accepts a nonempty event name rather than the Host whitelist. It exposes no consume operation, raw event, key modifiers, or consumption result. It is guarded by the plugin Scope and automatically removed, but does not individually catch callback throws or Promise rejections. Catch synchronous errors and explicitly track/catch async work; an async callback's entry guard is insufficient after `await`. Listener order relative to Host and other native listeners is not a plugin guarantee. Even explicit `map.listen` disposal does not promise the Host binding's failure-time revocation semantics when native removal throws.

`advancedLeafletMap()` returns borrowed raw access, not a lifecycle-safe facade for later calls. Register cleanup before attaching native effects, wrap callbacks with Scope guards, check authority after suspension, and restore only state you own. Do not remove the Map, manipulate another renderer's layers, or expect raw handlers to participate in Host arbitration. This is not a security sandbox for untrusted JavaScript.

Source-verified distinctions for the installed Leaflet version:

- `preclick` occurs before `click`; popup closing can already have run before a click binding consumes. Host does not guarantee popup preservation.
- Double-click zoom is a separate Map listener. Consuming `dblclick` does not guarantee it is disabled.
- Dragging/pointer capture and touch gestures require their own native handler/lifetime management; consuming a click does not cancel them.
- Map `contextmenu` delivery itself calls `preventDefault` when it has eligible targets, independently of the Host decision. Non-consuming subscription is not a promise of unchanged browser context-menu behavior.

These are based on installed source, not a claim of cross-device gesture testing. See [Leaflet Map](../node_modules/leaflet/src/map/Map.js), [Evented](../node_modules/leaflet/src/core/Events.js), [Popup](../node_modules/leaflet/src/layer/Popup.js), and [DoubleClickZoom](../node_modules/leaflet/src/map/handler/Map.DoubleClickZoom.js).

## Renderer interactions and semantic selection

Renderer build receives `input.interactions.createSurface({ id, target, group? })` and `bind({ id, surface, event, consume = true, resolve })`. This narrower contract fixes surface/binding ownership to the generation, the logical parent to the map root, and binding tier to object; it does not expose `mapSurface` or ordinary owner/tier overrides. Targets must be generation-owned; groups must belong to that generation. Do not pass the guarded build `input.scope` or its children as an ordinary interaction owner. Forwarding of additional surface options by the current implementation is not a public renderer contract. Registration is staged during build preparation and disallowed after its ledger is sealed or during in-place update. Currentness and effective visibility gate dispatch; replacement, hiding, or withdrawal can revoke authority without deleting semantic data.

`resolve(input, { entryId, domain, semanticRevision, semanticSnapshot })` synchronously returns a domain target or `null`/`undefined` to decline. The Host issues/submits selection through its current issuer lifetime. Unlike ordinary `InteractionDecision`, renderer `consume:false` with a resolved target still requests selection while allowing background processing; it is not passive observation. Normal GPX/Photo renderer clicks consume. Resolver failures follow Host handler diagnostics; selection rejection is diagnosed and does not undo consumption. Updated generations supply current committed revision/snapshot rather than a retained stale build snapshot.

Physical input, arbitration, semantic selection, local state, and presentation are separate. Selection holds `{ entryId, domain, ref }`, requires a candidate issued to that consumer, and is validated by domain adapters. `context.selection` exposes `getCurrent`, `request`, `clear`, `subscribe`, and `subscribeRequests`; initial state must be read separately. Request notifications can represent repeated requests for the same selection; they are not physical click/modifier notifications. Scope/provider/application invalidation follows the [selection API](API.md#semantic-selection), including defined semantic errors.

A plugin can remember coordinates in a variable or status panel without artificial entries, domain providers, or selection candidates. Map Selection Presenter observes semantic selection and owns highlights/popups; it does not own standard background clearing. Existing Track Editor and Route Search also use local session state and separate native listeners; those uses do not establish universal Host gesture guarantees.

## Limits and unspecified behavior

The current API has no guaranteed consumed-event observation, temporary map-mode acquisition, authority transfer, or application fallback registration for plugins. Enabling a plugin does not itself reserve a binding, but setup can reserve one if it calls `bind`; installation and interaction ownership are therefore distinct responsibilities, not separate mode APIs today.

Do not rely on alias surfaces for the same target, private bookkeeping, unsupported decision fields, exact diagnostic timing/messages, or Host/native callback ordering. These remain unspecified to permit internal refactoring. Future observation and temporary-authority contracts require separate decisions; no proposed API is available through this reference.

Implementation and regression evidence: [Host](../src/interactions/host.js), [Map facade](../src/map/facade.js), [generation adapter](../src/rendering/generation.js), [application composition](../src/application-composition.js), [Host tests](../tests/phase-4f-interactions.test.js), and [application lifecycle tests](../tests/application-destroy.test.js).
