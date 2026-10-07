# Semantic selection

The application semantic root owns one SelectionStore. Production callers use
`app.selection`, and plugins use the scope-bound `context.selection`. Domain
facades issue opaque candidates and synchronously resolve immutable semantic
refs. The public snapshot is exactly `{ entryId, domain, ref }`; `domain` is the
accepted frozen DomainKey.

```js
const candidate = app.domains.gpx.selection.createCandidate(entryId, {
  kind: "track-point", trackIndex: 0, segmentIndex: 0, pointIndex: 0,
});
await app.selection.request(candidate);
const selected = app.selection.getCurrent();
const point = app.domains.gpx.selection.resolve(entryId, selected.ref);
```

Candidates belong to their issuing consumer scope/application. Selection itself
remains application-owned when that consumer ends. Equal requests and repeated
clears do not notify. Subscriptions are change-only; events contain immutable
`{ previous, current, reason }`. Reentrant commands wait until the current
semantic notification batch finishes. A command's Promise settles at its commit,
before callbacks, and retains that result even if callbacks terminate selection.

## Semantic transactions

EntryStore has a private fixed lifecycle collaborator, not a selection import or
public event bus. The coordinator reconciles current selection at the semantic
commit boundary, after asynchronous provider preparation. Domain and selection
state commit without callbacks; domain notification precedes selection
notification. Both precede queued selection commands and resource cleanup.

Logical entry removal excludes the entry from lookup, clears its selection, and
notifies before entry-scope cleanup. Cleanup failure does not restore either.
The existing provider lease rules and reverse-order EntryStore clear remain.

GPX structural refs include the semantic revision and structural indices.
Domain visibility/style changes increment the accepted semantic revision once
and remap selected refs to that value. Whole-document replacement invalidates
structural refs; document selection refreshes. Photo uses `{ kind: "photo" }`.
Resource-only Photo changes preserve selection without refresh. Selection never
increments semantic revision. Whole-entry visibility never clears selection.

## Deferred invalidation and termination

A private never-reused generation advances on selection changes, refresh/remap,
invalidation, and termination. Failed current resolution and provider-abort
callbacks capture that generation, entry identity, and exact registration.
Queued work checks all three and re-resolves current semantics before clearing.
Obsolete work cannot clear a replacement or an identical descriptor reselected
after clear. Dead-provider hooks are never called for revalidation.

Termination is internal, synchronous, idempotent, and emits no final event. It
revokes selection authority, clears private state, suppresses remaining delivery,
detaches listeners/subscriptions, rejects uncommitted requests/clears, and discards
invalidation tickets. Committed results remain successful. Reads/subscriptions,
candidate issuance, and resolution throw `SELECTION_STORE_DESTROYED`; requests
and clears return rejected Promises. Existing unsubscribe handles remain safe.

Semantic foundation disposal retains its entry/residual precondition. A rejected
preflight leaves selection active; valid disposal terminates it before root
cleanup. Root abort is an idempotent termination fallback. Public `app.destroy()`
and application-wide teardown remain Phase 4K.

## Phase 4E audit

Selection Hub source/tests are deleted. Selection modules transitively import no
browser, renderer, popup, Interaction Hub, or domain implementation. There is no
GPX/Photo branching in the generic store. Contract tests enforce these boundaries.

Remaining migration-symbol matches are intentionally classified as follows:

| Location | Classification / restoration phase |
|---|---|
| Base-map catalog `selectedLayer` | Active target map infrastructure, separate from semantic selection |
| GPX renderer and popup adapters | Active 4H domain/presentation path, outside generic selection |
| Legacy overlay and Interaction Hub | Source and obsolete authority tests deleted in 4H |
| Legacy input-processing helper | Inactive legacy input path, input restoration / final purge |
| Full layers/elevation UX | Minimum layers host active; elevation and extended UX deferred to 4I |
| Disabled export/route/editor/milestone integrations | Inactive legacy, 4J |
| Legacy unit mocks and product smoke fixtures | Preserved tests for their scheduled migration |
| Architecture plans and this note | Documentation |

The production allowlist remains the accepted six-plugin set. Popup restoration,
renderer generation/interaction infrastructure, and editor migration are absent.
