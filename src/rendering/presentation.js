import { forwardAbort } from "../ownership/abort.js";
import { copyPoint } from "./generation.js";
import {
  assertDeepImmutablePlainData,
  cloneAndFreezePlainData,
} from "../domains/immutable.js";
import {
  synchronous,
  renderingError,
  renderingErrorCodes as codes,
} from "./errors.js";
import { isScopeWithin } from "../ownership/scope.js";

export function validatePresentation(value) {
  if (value === undefined) return undefined;
  if (
    !value ||
    typeof value !== "object" ||
    ["anchor", "bounds", "highlightDescriptor", "highlight"].some(
      (key) => value[key] !== undefined && typeof value[key] !== "function",
    )
  )
    throw new TypeError("Invalid presentation hooks");
  return Object.freeze(
    Object.fromEntries(
      ["anchor", "bounds", "highlightDescriptor", "highlight"]
        .filter((key) => value[key])
        .map((key) => [key, value[key].bind(value)]),
    ),
  );
}
export function createPresentationFacade({
  scope,
  getGeneration,
  map,
  panes,
  report,
  assertAlive,
}) {
  return Object.freeze({
    resolve(entryId, ref) {
      assertAlive();
      scope.assertAlive();
      const generation = getGeneration(entryId);
      if (
        !generation?.current() ||
        !generation.exposure?.alive ||
        !generation.descriptor?.presentation
      )
        return null;
      if (generation.isTargetVisible?.(ref) === false) return null;
      const exposure = generation.exposure,
        revision = generation.revision;
      let invalidation = null;
      const current = () =>
        !invalidation?.signal.aborted &&
        scope.alive &&
        exposure.alive &&
        generation.exposure === exposure &&
        generation.revision === revision &&
        generation.current();
      const hooks = generation.descriptor.presentation;
      let anchor, bounds, descriptor;
      try {
        anchor = copyPoint(
          hooks.anchor ? synchronous(hooks.anchor, ref) : null,
        );
        if (!current()) return null;
        const rawBounds = hooks.bounds ? synchronous(hooks.bounds, ref) : null;
        if (!current()) return null;
        bounds = rawBounds
          ? Object.freeze({
              southWest: copyPoint(rawBounds.southWest),
              northEast: copyPoint(rawBounds.northEast),
            })
          : null;
        descriptor = hooks.highlightDescriptor
          ? synchronous(hooks.highlightDescriptor, ref)
          : null;
        if (descriptor !== null) {
          assertDeepImmutablePlainData(descriptor);
          descriptor = cloneAndFreezePlainData(descriptor);
        }
      } catch (error) {
        report(error);
        return null;
      }
      if (!current()) return null;
      invalidation = forwardAbort([exposure.signal, scope.signal]);
      if (!current()) { invalidation.dispose(); return null; }
      return Object.freeze({
        signal: invalidation.signal,
        token: generation.token,
        revision,
        anchor,
        bounds,
        highlightDescriptor: descriptor,
        isCurrent: current,
        async highlight({ scope: presenterScope } = {}) {
          assertAlive();
          if (!presenterScope || !isScopeWithin(presenterScope, scope))
            throw new TypeError(
              "Highlight scope must belong to the presentation consumer",
            );
          presenterScope.assertAlive();
          if (!current())
            throw renderingError(codes.stale, "Presentation handle is stale");
          const child = presenterScope.child({ label: "render-highlight" });
          const withdrawals = new Set();
          const close = () => {
            for (const withdraw of withdrawals) {
              try {
                withdraw();
              } catch (error) {
                report(error);
              }
            }
            void child.dispose().catch(report);
          };
          exposure.signal.addEventListener("abort", close, { once: true });
          scope.signal.addEventListener("abort", close, { once: true });
          child.defer(
            () => {
              exposure.signal.removeEventListener("abort", close);
              scope.signal.removeEventListener("abort", close);
            },
            { label: "highlight-authority", retry: "safe" },
          );
          const assert = () => {
            if (!current() || !child.alive)
              throw renderingError(codes.stale, "Highlight authority lost");
          };
          const context = Object.freeze({
            scope: child,
            signal: child.signal,
            isCurrent: () => current() && child.alive,
            map: Object.freeze({
              getPaneName(band) {
                assert();
                if (band !== "selection")
                  throw new TypeError("Highlights use selection band");
                return panes.getPaneName(band);
              },
              attachLayer(layer) {
                assert();
                if (
                  typeof layer?.addTo !== "function" ||
                  typeof layer?.remove !== "function"
                )
                  throw new TypeError("Invalid highlight layer");
                let attempted = false;
                const withdraw = () => {
                  if (attempted) {
                    layer.remove();
                    attempted = false;
                  }
                };
                const handle = child.defer(withdraw, {
                  label: "highlight-layer",
                  retry: "safe",
                });
                withdrawals.add(withdraw);
                if (layer.options)
                  layer.options.pane = panes.getPaneName("selection");
                try {
                  attempted = true;
                  layer.addTo(map);
                  assert();
                } catch (error) {
                  void handle.dispose().catch(report);
                  throw error;
                }
                return Object.freeze({
                  id: `${generation.token}:highlight`,
                  dispose: () => handle.dispose(),
                });
              },
            }),
          });
          try {
            assert();
            if (hooks.highlight) await hooks.highlight(ref, context);
            assert();
          } catch (error) {
            try {
              await child.dispose();
            } catch (cleanupError) {
              report(cleanupError);
            }
            throw error;
          }
          return Object.freeze({ dispose: () => child.dispose() });
        },
      });
    },
  });
}
