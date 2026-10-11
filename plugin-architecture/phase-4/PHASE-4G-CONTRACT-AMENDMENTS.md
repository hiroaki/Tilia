# Phase 4G — Approved Contract Amendments

## 1. Authority, Status and Historical Boundary

Approval recorded: 2026-10-07. **Both amendments are approved; implementation and required verification are complete in Phase 4G, with implementation review/acceptance pending.** This record supplements the completed-phase plans. It does not retrospectively change the contracts under which Phase 4C/4D/4F were implemented and accepted, and the planning approval itself did not authorize Phase 4G implementation. The user subsequently accepted the plan and instructed implementation to begin.

Distinguish these three records:

- Completed-phase implementation plans retain their original contract text as historical acceptance records, with short subsequent-amendment notes.
- [ARCHITECTURE.md](../ARCHITECTURE.md) §§33/40 and [MIGRATION-PLAN.md](../MIGRATION-PLAN.md) §13 state the currently approved normative requirements and migration boundaries, including these additions.
- This record explains the approved additions and their implementation status; the [Phase 4G implementation plan](PHASE-4G-IMPLEMENTATION-PLAN.md) records future tasks, tests and acceptance criteria.

The accepted code baseline is commit `fd4ea23a62face90916355292e2a39142b9b0c01`. **That Phase 4F implementation provides neither a public PresentationHandle invalidation signal nor domain-create caller-signal publication cancellation.** Approval of the additions must not be read as implementation or verification of them.

## 2. PresentationHandle Permanent Invalidation

### 2.1. Original contract and historical sections

[Phase 4F plan](PHASE-4F-IMPLEMENTATION-PLAN.md) §33 defines immutable geographic/presentation data, `isCurrent()` and controlled `highlight({scope})`; it captures exact registration, generation token, semantic revision, consumer and exposure lifetimes. Exposure invalidation is permanent; same-token update/unhide require fresh authority. The original handle interface has no public signal. Its controlled highlight context does have a signal, which is a distinct API.

Related historical sections: 4F §38 (logical deletion/render withdrawal) and §40 (rendering-root termination). Termination revokes authority and disposes generation resources without a final rendering-status event. Semantic selection remains independent of renderer/presenter lifetime.

### 2.2. Concrete gap in accepted implementation

[Presentation resolution](../../src/rendering/presentation.js) returns token, revision, anchor, bounds, highlight descriptor, `isCurrent` and `highlight`, but no handle-level signal. Its controlled-highlight path already listens to consumer/exposure aborts; ordinary presenter-owned popup or independent descriptor-based highlight cannot subscribe to those private lifetimes through the returned handle.

[Rendering-root termination](../../src/rendering/coordinator.js) sets termination authority false and closes controllers without delivering a final status. Thus a still-live presenter cannot use rendering-status notification alone to reliably observe permanent handle invalidation and remove its own popup/independent highlight. This gap does not justify adding a final status event or exposing private generation scopes.

### 2.3. Approved contract change and limits

Add `readonly signal: AbortSignal` to the immutable handle returned by accepted presentation resolution. It reports permanent loss of that particular handle's authority and captures the exact presentation exposure and presentation consumer lifetime, not merely the generation token.

- Revoke authority before abort delivery. Every abort listener must observe `handle.isCurrent() === false`.
- Hide invalidates the old exposure; show resolves a fresh handle. Same-token revision advancement likewise renews exposure without reviving an old handle. Replacement, withdrawal, logical deletion, consumer closure and rendering termination permanently invalidate old handles.
- Combine the two captured lifetimes without exposing their controllers. Remove forwarding listeners from both when either ends. Check currentness/aborted sources before and after registration; if registration races invalidation, detach partial listeners and return null under the accepted final-currentness check. An already returned handle becomes permanently aborted. Resolution must retain its final currency checks around renderer hooks; no new resolve outcome is introduced.
- Consumers check both currentness and signal state before mounting or accepting async results. The signal is an invalidation notification, not permission to skip currentness checks.
- Retain accepted generation authority renewal, sealed ledgers, replacement and selection contracts. Rendering termination emits no final rendering-status event. Signal invalidation supplies the missing notification for presenter-owned popup/highlight teardown, including when the presenter plugin itself remains alive.

Tests will assert ordering within abort callbacks, consumer closure without generation change, hide/show and same-token renewal, replacement/withdrawal/deletion/termination, already-invalid sources and invalidation during registration, partial listener cleanup, removal from both sources, and synchronous popup/highlight withdrawal followed by awaited cleanup during rendering-root termination. No public application destruction API is added.

### 2.4. Reason for approval, APIs and invariants

Approval supplies the narrow missing authority-loss notification needed by the minimum Photo presentation slice while preserving the accepted no-final-status termination contract. It supplements currency checks rather than introducing a new rendering lifecycle or presentation authority.

Affected APIs: returned `PresentationHandle.signal` and generic presentation resolution/consumer teardown. No renderer hook signature, SelectionStore API, renderer registry, generation token, revision policy or public application destruction API is replaced.

Preserved invariants: exact registration/token/revision/exposure currency, permanent old-handle invalidation, one resource owner, presenter-owned popup/highlight, semantic selection independence, sealed generation publication, and accepted replacement policy. In particular, definitive failure of a newer semantic revision retires stale rendering.

### 2.5. Required implementation and verification; status

Implement the composite invalidation notification in generic presentation handling, detach source forwarding listeners, and connect presenter-owned teardown to it. Verify the ordering/race/lifetime cases in §2.3 and the production popup/highlight cases in the [4G plan §12](PHASE-4G-IMPLEMENTATION-PLAN.md#12-required-tests-and-smoke-expectations). Existing generation and termination tests must continue to pass without a final status event.

**Status: approved, implemented and verified in Phase 4G; implementation review/acceptance pending.** The historical Phase 4F interface remains the interface that was implemented and accepted; its short note points here for the subsequent addition.

## 3. Domain-Create Commit-Boundary Cancellation

### 3.1. Original contract and historical sections

[Phase 4C plan](PHASE-4C-IMPLEMENTATION-PLAN.md) §9 gives each InputRegistry invocation a signal tied to caller/handler lifetime. This cancels temporary input work; it does not establish cancellation of domain publication.

[Phase 4D plan](PHASE-4D-IMPLEMENTATION-PLAN.md) §9 supplies `prepareCreate` with an entry-owned scope/signal; §16 defines preparation, caller/app/provider checks and atomic publication. The creation facade (§26) has no accepted caller-signal publication contract. Relevant existing protections remain in §11 (creation/entry leases and uninstall guard), §24 (private URL ownership), §30 (failure/concurrency) and §32 (error/diagnostic conventions). The broad §16 historical failure summary remains unchanged as a historical record; the accepted implementation already retains cleanup-failed creation residuals and leases rather than releasing them prematurely.

Phase 4F §37 places creation rendering hooks after semantic commit; §38 orders logical removal and rendering teardown before provider-resource cleanup. Neither adds domain-create caller cancellation.

### 3.2. Concrete gap in accepted implementation

[EntryStore.create](../../src/entries/store.js) accepts `{visible = true}` only, reserves an ID, acquires the exact creation lease, and passes only `entryScope.signal` to `prepareCreate`. It rechecks requester/app/provider authority after preparation, then performs record assignment, lease promotion and insertion before rendering hooks/created notifications. It neither validates a caller `options.signal` nor checks that signal at publication.

[Domain facades](../../src/domains/facades.js) pass options through; that forwarding does not mean the store implements a signal option. Therefore input cancellation during otherwise-live preparation cannot independently prohibit publication. Adding the input invocation signal requires a new publication predicate and late-resource recovery; it is not completion of an already accepted option.

The existing creation catch retains `SEMANTIC_CLEANUP_FAILED`, its original error, a creation residual and the provider lease when scope cleanup fails. Existing cleanup retry releases the lease after recovery. The amendment must preserve this behavior when cancellation is the original creation failure.

### 3.3. Approved contract change and limits

Extend typed domain creation to `create(value, { visible = true, signal } = {})`. The optional signal is a **new publication contract**, not completion of an already accepted domain-create option. InputRegistry's accepted invocation signal currently cancels input work; forwarding it into publication requires this addition.

1. Validate caller/application authority, options and the supplied native AbortSignal (using a platform brand check rather than duck typing), then check cancellation **before reserving an entry ID**. Omitted/undefined means no caller signal; null or another invalid value rejects `ENTRY_INVALID` with `committed: false`, consistent with generic creation-option validation. Pre-aborted creation rejects `ENTRY_CREATION_ABORTED` with `committed: false`, reserves no ID and invokes no provider. Validation must not admit an arbitrary callback-bearing substitute for a native signal into the commit guard.
2. Reserve the never-reused ID, resolve the exact provider registration, acquire its creation lease and create the app-owned destination scope as today. Forward supplied cancellation and existing entry/requester/application cancellation into the signal delivered to `prepareCreate`; retain all existing lifetime/currentness checks, including provider-owner authority. Cancellation delivery alone never releases the lease.
3. Await preparation settlement even if it ignores cancellation. Capture returned cleanup/resources and retain provider-registered scope obligations before discarding an uncommitted result. A cancelled operation cannot publish a late result. While preparation remains unsettled, keep the creation lease, including while requester/handler/provider/application authority is unavailable; cancellation does not declare cleanup complete. Reserve the returned-disposer cleanup obligation before invoking preparation. Represent preparation plus its disposer handoff as explicitly awaitable destination-scope work using the accepted Scope mechanism: authority dies immediately on closure, but physical cleanup waits until late resources have been captured in that obligation. Do not register late resources into an already closing/closed scope or release the lease from an early abort callback. Observe preparation rejection without unhandled promises. This is entry creation work, not a change to Phase 4F detached rendering acquisition policy.
4. After preparation, validation and lifetime guards, perform the final cancellation check immediately before the callback-free publication block. No await, provider hook, subscriber, renderer hook or other external callback may occur between that check and completion of instance/snapshot/revision assignment, lease promotion and active-store insertion. All post-commit rendering hooks/notifications occur afterward. Do not place a second cancellation-driven rollback check after publication.
5. If cancelled before commit, run the existing rollback path. Recover late resources and await successful cleanup before releasing the provider lease. Reject `ENTRY_CREATION_ABORTED` with `committed: false` (and reserved entry/domain information when available). When the supplied signal has cancelled before commit, preserve cancellation as the original error if preparation also rejects because it observed cancellation; keep relevant underlying failure information without replacing the cancellation outcome.
6. If rollback cleanup fails, retain the existing creation residual and exact provider lease. Preserve the existing `SEMANTIC_CLEANUP_FAILED`, `committed: false`, cleanup error as its cause and cancellation as the original creation cause in the existing residual/original-error reporting. Do not replace the cleanup-failure error with an abort error. Existing cleanup retry remains the sole recovery path; release the lease last after successful retry and never publish the cancelled entry.
7. After commit, cancellation never deletes or rolls back the entry, including cancellation synchronously triggered by a created notification. The app owns the entry independently of requester/input completion. Remove cancellation-forwarding listeners on success/failure settlement; remove them independently of retaining cleanup residuals. IDs reserved by failed/cancelled preparation remain gaps.

Non-cooperative preparation can delay settlement indefinitely; no timeout or early lease release is approved. This uses existing ownership, residuals and retry machinery rather than introducing another transaction system. Scope checks remain authoritative alongside the new cancellation predicate.

Tests must include invalid/pre-aborted signals before reservation, cooperative and non-cooperative preparation, cancellation immediately before commit, post-commit observer cancellation, simultaneous lifetime closure, listener registration races/removal, late returned resources, reserved ID gaps, cancellation plus URL-revocation failure, provider uninstall rejection while creation/residual leases remain, repeated failed cleanup retry, and lease release only after successful cleanup retry.

### 3.4. Reason for approval, APIs and invariants

Approval makes temporary input cancellation effective before semantic publication while preserving application ownership after commit. A caller cannot cancel a preparing input and still unintentionally publish its late result, or cancel a completed input and thereby delete its committed entry.

Affected APIs: optional `options.signal` on typed domain `create`, privileged `EntryStore.create`, provider preparation signal forwarding, and new `ENTRY_CREATION_ABORTED` error code under existing SemanticError conventions. JPEG input will forward the accepted invocation signal. Provider hook shape, existing lifetime checks, registry lease/uninstall APIs and residual retry APIs remain in place.

Preserved invariants: app-owned committed entries, callback-free semantic publication, notifications/rendering hooks after commit, exact-registration creation-to-entry lease continuity, no ID reuse, private preview ownership, cleanup failure attribution and retry, and no provider uninstall while preparing/live/residual entries retain leases. No new ownership-transfer, transaction, registry or general reference-count system is approved.

### 3.5. Required implementation and verification; status

Implement signal validation/forwarding and the final commit guard using existing scope/lease machinery. Keep the preparation/disposer handoff and rollback cleanup owned until settlement; do not register late resources in a dead scope. Integrate the abort error with existing creation residual reporting and successful retry without changing cleanup-failure precedence.

Verify the cases in §3.3 and the [4G plan §12](PHASE-4G-IMPLEMENTATION-PLAN.md#12-required-tests-and-smoke-expectations), explicitly including cancellation with URL-revocation failure, uninstall rejection while residual leases remain, and lease release only after successful cleanup retry. No cancelled late result is ever published. Post-commit cancellation is verified separately from pre-commit rollback.

**Status: approved, implemented and verified in Phase 4G; implementation review/acceptance pending.** The accepted Phase 4F baseline has no caller-signal publication contract; Phase 4G implements the addition.

## 4. Unchanged Migration Scope and Verification Boundary

[MIGRATION-PLAN.md §13](../MIGRATION-PLAN.md#13-phase-4g--photo-vertical-slice) still governs minimum Photo popup/presentation, settings/tree contribution and JPEG input. Only per-Photo `auto`/`local`/`utc` settings are in scope. Photo-from-GPX inference remains in 4H; broader standard UI/global defaults/custom offsets remain in 4I; public application destruction remains in 4K. No RenderingCoordinator or SelectionStore redesign is approved.

Preview consumer-closure/logical-deletion access guards, physical URL teardown ordering, separate popup-dismissal versus popup-adapter-removal tests, GPS smoke filename/`exif-gps` assertions, and scenario-identified projected smoke counts remain concrete 4G verification obligations in the implementation plan. They do not retrospectively extend completed-phase implementation claims.

Documentation approval is not a passing implementation test. The implementation and verification supporting the current status are recorded in the implementation report. The earlier documentation reorganization changed no production code/tests or completed-phase implementation reports and created no commit at that review step. Subsequent commit and implementation progress are recorded below.

## 5. Implementation Progress After Plan Acceptance

The planning documents were committed as `398fab5`. Subsequent user authorization covered the full accepted Photo slice, and the user clarified that completion of the generic amendments was only an intermediate checkpoint. Both amendments are implemented in the working tree. Phase 4G remains unaccepted; the subsequent review reproduced three UI lifecycle defects and an additional panel close/open reentrancy defect, whose corrections and verification are recorded in the report. The [implementation report](PHASE-4G-IMPLEMENTATION-REPORT.md) records 630 passing unit tests, three passing 4G browser scenarios, the existing GPS import assertions, real popup/highlight termination, native cross-realm signal validation and the complete 38-scenario audit (13 pass / 25 fail, no skipped scenarios). It also records the pre-provider-invocation authority regression fix and its application/requester/caller-cancellation tests. Changes are uncommitted; user implementation review/acceptance remains pending. The accepted Phase 4F checkpoint remains an unchanged historical baseline and provides neither amendment.
