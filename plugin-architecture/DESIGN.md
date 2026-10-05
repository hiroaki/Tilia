# Tilia Plugin Architecture Design Principles

## 1. Purpose

This document defines the architectural principles and target direction for the next major revision of Tilia's plugin system.

It is intentionally not a detailed API specification.

The purpose of this document is to establish stable design constraints before concrete APIs, dependency resolution rules, extension points, and migration plans are designed.

Later design and implementation work should use these principles as the basis for deciding:

- what belongs in core,
- what belongs in a plugin,
- how plugins depend on and communicate with other components,
- how optional functionality is loaded,
- how resources and lifecycle are managed,
- and how Tilia can remain extensible without turning its plugin system into a general-purpose framework.

Concrete API shapes remain open unless explicitly stated otherwise.

---

## 2. Context and Motivation

Tilia has evolved from a GPX-focused map application into a system with multiple built-in and external plugins.

The existing plugin system already provides useful foundations, including:

- plugin IDs,
- `setup()` and cleanup lifecycle,
- `app.use()` and `app.unuse()`,
- dependency declarations through `requires`,
- plugin services,
- built-in and external plugin namespaces,
- plugin stylesheets.

However, some functionality that conceptually belongs to optional features is still implemented directly in core or in shared modules that core imports.

Photo support is the clearest current example.

Photo handling currently involves responsibilities such as:

- JPEG input recognition,
- EXIF parsing,
- GPS and timestamp extraction,
- GPX-based location inference,
- photo overlays,
- photo selection,
- photo marker interactions,
- preview resource cleanup,
- photo time-mode handling,
- photo-specific UI.

These responsibilities cross core, map, selection, interaction, input, and UI boundaries.

As a result, functionality that should be optional can become a static dependency of otherwise unrelated configurations. For example, an application that only needs GPX functionality may still be required to resolve an EXIF implementation.

This is not considered a photo-specific problem.

It exposes a broader architectural boundary that should be clarified before Tilia gains more data types, editing features, UI extensions, and third-party plugins.

The plugin architecture will therefore be redesigned as part of a major-version change.

Issue #74, which moves photo input and EXIF parsing behind an optional plugin, is temporarily deferred. It will later serve as one of the primary validation cases for the redesigned architecture.

---

## 3. Primary Design Principle

The central architectural rule is:

> **Core owns mechanisms. Plugins own domain-specific policy and behavior.**

Core should provide the mechanisms necessary to keep the application internally consistent.

Plugins should provide the meaning and behavior associated with particular features, domains, or data types.

For example, core may understand:

- application lifecycle,
- entry identity and lifecycle,
- state consistency,
- map-layer attachment and removal,
- visibility,
- selection lifecycle,
- interaction primitives,
- input dispatch,
- resource disposal,
- plugin lifecycle.

Core should not need to understand concepts such as:

- JPEG,
- EXIF,
- photo thumbnails,
- camera metadata,
- photo time modes,
- GPX-based photo location inference.

The same principle should be applied to future functionality.

A generic API must be genuinely generic. Renaming a domain-specific operation to a generic name does not make it a core abstraction.

---

## 4. Dependency Direction

The normal dependency direction is:

```text
plugin
  |
  v
core
```

Core must not depend on plugin implementations.

In particular:

```text
core -> plugin
```

is prohibited as an architectural dependency.

Optional functionality must not be required in order to import or initialize core.

Dependencies between plugins should also be explicit and minimized.

Direct imports between plugin implementations should not be the default integration mechanism when the relationship can instead be expressed through the plugin runtime, services, capabilities, or extension points.

This gives the system an intended dependency structure similar to:

```text
                    +-------------------+
                    |   Plugin Runtime  |
                    +---------+---------+
                              |
                    +---------v---------+
                    |       Core        |
                    +-------------------+
                       ^      ^      ^
                       |      |      |
             +---------+      |      +----------+
             |                |                 |
       +-----+-----+    +-----+-----+     +-----+-----+
       | GPX/domain |    |   Photo   |     | External  |
       | components |    |   plugin  |     |  plugins  |
       +-----------+    +-----------+     +-----------+
```

The exact placement of GPX functionality remains an open design question. The architecture must not assume that GPX-specific functionality will always live in core.

---

## 5. Core Responsibilities

Core should remain small and domain-agnostic where practical.

Expected core responsibilities include mechanisms such as:

### 5.1 Application state integrity

Core owns the authoritative mechanisms required to keep application state internally consistent.

Plugins should not need to directly mutate private core state structures.

### 5.2 Entry lifecycle

Core should provide the generic primitives required to manage application entries.

The exact API remains to be designed, but the lifecycle may include concepts such as:

```text
register/create
attach
replace
visibility
selection
remove
dispose
```

The lifecycle must not assume that an entry is a GPX document, photo, or any other specific data type.

### 5.3 Resource lifecycle

Core/runtime should provide a mechanism by which resources owned by an entry or plugin can be reliably released.

Examples may include:

- Blob/Object URLs,
- event subscriptions,
- map layers,
- workers,
- temporary resources,
- external handles.

Core does not need to understand the resource itself.

It only needs to guarantee the lifecycle contract.

### 5.4 Input dispatch

Core may provide generic registration and dispatch mechanisms for supported inputs.

Knowledge of particular formats should belong to the component or plugin that implements support for that format.

### 5.5 Selection and interaction primitives

Core may own generic selection state and interaction lifecycle where application-wide consistency is required.

It should not contain APIs whose semantics are tied specifically to photos or another optional domain.

### 5.6 Map mechanisms

Core may own generic map integration required by the application.

Presentation rules belonging to a particular data type should remain outside generic core mechanisms where practical.

---

## 6. Plugin Responsibilities

A plugin owns the domain-specific behavior it introduces.

For an optional photo plugin, this would eventually include responsibilities such as:

```text
JPEG recognition
EXIF provider integration
metadata normalization
GPS extraction
timestamp interpretation
GPX-based location inference
photo presentation
photo marker behavior
photo-specific selection integration
photo time mode
photo-specific UI
photo-owned resources
```

Core should not need to know which EXIF library is used, or even that EXIF exists.

The same principle applies to future optional data formats and features.

---

## 7. Plugin Lifecycle

Plugin lifecycle is a first-class architectural concern.

A plugin is not considered fully supported merely because it can be initialized.

The architecture must account for the complete lifecycle:

```text
resolve
load
resolve dependencies
setup
operate
unuse
cleanup
dispose
```

Plugin setup and teardown should be symmetrical where practical.

A plugin must be able to release the resources, registrations, subscriptions, services, and contributions that it owns.

The runtime should make correct cleanup easier than incomplete cleanup.

Lifecycle behavior during partial setup failure must also be defined.

The detailed transactional semantics will be designed in a later phase.

---

## 8. Plugin Dependencies

Plugin dependencies must be explicit.

The long-term direction is for a dependency declaration such as:

```text
A requires B
B requires C
```

to be resolvable by the plugin runtime rather than requiring callers to manually establish the correct installation order.

Conceptually:

```text
use A

-> resolve C
-> setup C
-> setup B
-> setup A
```

The runtime should eventually define behavior for:

- missing dependencies,
- dependency resolution,
- circular dependencies,
- duplicate installation,
- setup failures,
- uninstalling a required dependency,
- cleanup after dependency failure.

The exact dependency-resolution algorithm and uninstall policy are intentionally not defined by this document.

External JavaScript package dependencies are not Tilia plugin dependencies.

For example, an EXIF parsing library used internally by a photo plugin is an implementation dependency of that plugin, not a Tilia plugin dependency.

---

## 9. Dependencies, Services, Capabilities, and Contributions

These concepts must remain distinct.

### 9.1 Dependency

A dependency is required for a plugin to operate correctly.

If plugin A cannot function without plugin B, B is a dependency.

### 9.2 Service

A service is callable functionality exposed by a plugin or subsystem for use by other components.

The existing `app.services` mechanism may evolve to serve this role.

Its final API is not defined here.

### 9.3 Capability

A capability describes functionality currently available to the application.

For example, the application may currently be capable of accepting a particular input type because an appropriate handler has been registered.

Capabilities should allow components to discover available functionality without requiring knowledge of the plugin implementation that provides it.

### 9.4 Contribution

A contribution is optional functionality added to an extension point owned by another subsystem.

For example, a photo plugin might contribute photo-related controls to a layers UI when that UI is available.

This should not necessarily make the layers plugin a hard dependency of the photo plugin.

Conceptually:

```text
dependency
    required for operation

service
    callable functionality

capability
    functionality currently available

contribution
    optional extension of another subsystem
```

The concrete registries and APIs for these concepts will be designed later.

---

## 10. Optional Plugins Must Be Truly Optional

An optional plugin is not considered optional merely because its UI can be disabled.

If a plugin is not enabled, its private implementation dependencies should not be required by the application module graph.

The target property is:

> **An application that does not enable an optional plugin must not need to resolve that plugin's private dependencies.**

For example:

```text
GPX-only application
```

must not require an EXIF parser simply because photo support exists somewhere in Tilia.

This requirement applies to built-in plugins as well as external plugins.

Therefore, built-in plugin registration must not accidentally make all built-in implementation modules eager application dependencies.

The exact lazy-loading or module-resolution mechanism will be designed separately.

---

## 11. Built-in and External Plugins

Built-in and external plugins should participate in the same fundamental lifecycle and extension model.

Built-in plugins may receive conveniences such as:

- reserved naming,
- built-in resolution,
- bundled documentation,
- standard integration points.

They should not require a fundamentally separate plugin architecture.

The existing convention in which `tilia-*` is reserved for built-in plugins is expected to remain unless later investigation identifies a reason to change it.

External plugins should be able to use supported public extension mechanisms without depending on private core implementation details.

---

## 12. Input Support as a Capability

Input support should be extensible.

An input handler should conceptually be able to declare both:

- how it recognizes and handles an input,
- metadata describing the input capability it provides.

For example, a future handler may provide information equivalent to:

```text
extensions: .jpg, .jpeg
MIME types: image/jpeg
```

Input UI plugins should be able to derive their behavior from registered capabilities rather than hard-coding every supported format.

This allows components such as:

```text
file picker
dropzone
other input transports
```

to remain independent of specific domain plugins.

The concrete input registry API remains open.

---

## 13. Selection and Interaction

Selection and interaction require application-wide consistency and therefore need generic core primitives.

However, the architecture must avoid replacing domain-specific APIs with an unstructured global event bus.

Core should understand enough structure to guarantee concepts such as:

- selection identity,
- ownership,
- replacement,
- invalidation,
- popup lifecycle where applicable,
- cleanup when an entry disappears,
- subscription lifecycle.

Core should not need to understand the domain meaning of a selected photo, track point, route point, or future plugin-defined object.

The concrete selection and interaction model remains an open design question.

---

## 14. UI Extension Points

Optional domain functionality should not require unrelated UI plugins to contain domain-specific branches.

For example, the long-term direction should avoid structures equivalent to:

```text
layers UI
  if photo:
      photo-specific behavior
```

when that behavior can instead be provided by the photo feature itself.

The intended direction is conceptually:

```text
domain plugin
      |
      v
UI contribution / extension point
      |
      v
UI plugin
```

Potential extension points may include:

- layer controls,
- settings,
- toolbars,
- actions,
- contextual controls.

Only extension points justified by real Tilia use cases should be introduced.

A generic UI framework is not a goal.

---

## 15. Resource Ownership

Resource ownership must be explicit.

The component that creates or acquires a resource should have a clear responsibility for describing how that resource is released.

The architecture should allow the runtime/core to guarantee that cleanup occurs at the appropriate lifecycle boundary without needing to understand the resource's domain semantics.

Relevant boundaries may include:

```text
entry removal
entry replacement
application clear
plugin uninstall
application destruction
```

A plugin must not leave active resources behind after its ownership ends.

---

## 16. Plugin Uninstall Semantics

Uninstall is part of the plugin contract.

Removing a plugin may require cleanup of:

- input handlers,
- event subscriptions,
- services,
- capabilities,
- UI contributions,
- stylesheets,
- plugin-owned entries,
- plugin-owned resources.

The behavior when another installed plugin depends on the plugin being removed must be explicitly defined.

Possible policies include rejecting the uninstall or removing dependents in a controlled manner.

This document intentionally does not select the final policy.

The policy will be determined during the detailed plugin-runtime design.

---

## 17. Compatibility Policy

This redesign targets a major version.

Architectural consistency, extensibility, and long-term maintainability take precedence over preserving existing internal APIs.

Backward compatibility should not cause obsolete responsibility boundaries to survive inside the new architecture.

In particular, compatibility facades should not be added merely to preserve APIs that place domain-specific behavior in core.

However, breaking changes must still have a clear architectural reason.

The goal is not to maximize API churn.

Where practical, user-visible behavior of standard Tilia configurations should remain consistent even if their internal plugin composition changes.

Breaking configuration or API changes should be documented as part of the major-version migration.

---

## 18. Avoiding False Generalization

A major risk during this redesign is creating abstractions that are generic only in name.

For example, replacing a photo-specific API with:

```text
genericEntryOperation(photo-shaped-object)
```

does not create a meaningful generic core primitive.

Before adding a core abstraction, its responsibility should be evaluated against multiple use cases.

At minimum, major extension primitives should be considered against different types of functionality such as:

- existing GPX functionality,
- photo support,
- `x-track-editor`,
- existing input plugins,
- existing UI plugins.

An abstraction does not need to serve every possible plugin.

It should, however, represent a genuine application-level mechanism rather than a disguised implementation detail of its first consumer.

---

## 19. Target Architecture

The long-term architecture is conceptually:

```text
+---------------------------------------------------+
|                    Tilia App                      |
+---------------------------------------------------+
                         |
                         v
+---------------------------------------------------+
|                 Plugin Runtime                    |
|                                                   |
|  registry                                         |
|  resolution                                       |
|  dependency management                            |
|  lifecycle                                        |
|  built-in loading                                 |
|  services / capabilities / contributions          |
+---------------------------------------------------+
                         |
                         v
+---------------------------------------------------+
|                     Core                          |
|                                                   |
|  application state                                |
|  entry lifecycle                                  |
|  input dispatch                                   |
|  selection                                        |
|  interaction                                      |
|  visibility                                       |
|  resource lifecycle                               |
|  generic map mechanisms                           |
+---------------------------------------------------+
             ^                 ^                 ^
             |                 |                 |
     +-------+-------+ +-------+-------+ +-------+-------+
     | Built-in      | | Built-in      | | External      |
     | domain/input/ | | UI plugins    | | plugins       |
     | feature       | |               | |               |
     | plugins       | |               | |               |
     +---------------+ +---------------+ +---------------+
```

Dependencies should normally point downward toward stable mechanisms.

Domain knowledge should not flow upward into core.

---

## 20. Validation Cases

The architecture must be validated against real Tilia functionality rather than hypothetical plugin examples alone.

### 20.1 Photo support / Issue #74

Photo support is a primary validation case because it exercises:

- optional dependencies,
- input registration,
- domain processing,
- map presentation,
- selection,
- interaction,
- resource cleanup,
- UI integration,
- service APIs,
- plugin uninstall.

A successful architecture should allow photo support to be removed completely without leaving EXIF or photo-specific dependencies in a GPX-only application.

### 20.2 `x-track-editor`

`x-track-editor` is a primary validation case for a complex external plugin.

The architecture should support its legitimate needs without requiring access to unstable private core internals.

It provides a useful counterexample to photo support because its behavior and lifecycle are substantially different.

### 20.3 Existing input plugins

File import, dropzone, URL import, and query import should be evaluated to ensure that transport/UI plugins can remain independent of the domain-specific handlers that process their inputs.

### 20.4 Existing UI plugins

Layers, settings, panels, and other UI plugins should be evaluated to ensure that optional domain functionality can integrate without forcing domain-specific knowledge into otherwise generic UI components.

---

## 21. Non-goals

This redesign is not intended to create a general-purpose JavaScript plugin framework.

Specifically, the project does not aim to:

- anticipate every possible future extension,
- abstract functionality without a demonstrated Tilia use case,
- make every Tilia component a plugin,
- move GPX support into a plugin merely for architectural symmetry,
- introduce a general dependency-injection framework,
- replace structured APIs with a global event bus,
- support arbitrary runtime module ecosystems,
- preserve every existing internal API,
- create permanent compatibility layers for obsolete architecture,
- make plugins independent of all core concepts.

The plugin system exists to support Tilia.

Complexity must be justified by concrete application requirements.

---

## 22. Open Design Questions

The following questions are intentionally deferred to later design phases.

### Plugin runtime

- What is the exact plugin descriptor/manifest shape?
- How are built-in plugins resolved lazily?
- How are external plugins resolved?
- Should dependency installation always be automatic?
- How are circular dependencies detected and reported?
- What happens when dependency setup fails?
- What are the uninstall semantics for required dependencies?
- Is reference counting useful or unnecessary?

### Services and capabilities

- How should services be registered and discovered?
- Is the existing `app.services` model sufficient?
- Does Tilia need a formal capability registry?
- How should capability lifetime follow plugin lifetime?

### Entry lifecycle

- What exactly constitutes an entry?
- Which state belongs to core versus domain plugins?
- What are the contracts for create, replace, remove, and dispose?
- How are plugin-owned entries identified?
- What should happen to plugin-owned entries when the plugin is removed?

### Input system

- What is the registration API?
- What metadata should an input capability expose?
- How should conflicts between multiple matching handlers be resolved?
- Is explicit priority necessary?
- How should input capability changes propagate to UI plugins?

### Selection and interaction

- What is the generic selection identity model?
- Which popup responsibilities belong to core?
- How are plugin-defined selection targets represented?
- What interaction/event primitives are actually necessary?
- How should entry replacement invalidate selection?

### UI contributions

- Which real extension points are required?
- Who owns contribution ordering?
- How are contributions removed?
- How should a contribution behave when its target UI plugin is absent?
- Should contributions be declarative, imperative, or a limited combination?

### GPX

- Which GPX responsibilities are fundamental to Tilia and which are domain-specific?
- Should GPX eventually become a built-in plugin?
- Can the new architecture leave that decision open without introducing GPX-specific assumptions into generic core APIs?

These questions should be answered from investigation of the existing code and real plugin requirements, not from framework design in isolation.

---

## 23. Design Process

The redesign should proceed incrementally.

The intended sequence is:

```text
Phase 0
  Establish architectural principles.

Phase 1
  Inventory and analyze the complete existing plugin architecture.

Phase 2
  Design the concrete plugin runtime and contracts.

Phase 3+
  Implement infrastructure incrementally.

Migration
  Move existing plugins onto the new architecture.

Validation
  Validate against complex real-world plugins.

Issue #74
  Resume photo extraction using the new architecture.
```

Each implementation phase should preserve a working test baseline whenever practical.

Large rewrites should be avoided when the same architectural result can be achieved through controlled, independently testable changes.

---

## 24. Decision Criteria

When evaluating a proposed API or architectural change, use the following questions.

1. Is this mechanism genuinely domain-agnostic?
2. Does it belong in core, runtime, or a plugin?
3. Does it introduce an unnecessary dependency direction?
4. Can an optional feature truly disappear from the module graph?
5. Is ownership and cleanup clear?
6. Can the lifecycle be reversed safely?
7. Is a hard dependency actually required, or is this an optional integration?
8. Does the proposal work for more than its first consumer?
9. Does it work for both built-in and external plugins where appropriate?
10. Does it expose private core implementation details?
11. Is the abstraction justified by an existing Tilia requirement?
12. Is there a simpler design that preserves the same architectural boundary?

These criteria should be preferred over preserving historical implementation structure.

---

## 25. Status

This document represents the Phase 0 architectural direction.

It establishes principles and constraints, not final APIs.

Concrete runtime APIs, dependency semantics, extension points, lifecycle contracts, and migration details remain subject to Phase 1 investigation and Phase 2 design.

Issue #74 remains deferred until the plugin architecture provides the mechanisms necessary to implement photo support as a genuinely optional feature.