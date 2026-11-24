import { expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import { createGpxLayerColors } from "../src/gpx/layer-colors.js";

it("keeps only logical colors across generations and releases them with the entry", async () => {
  const owner = createScopeController();
  const target = { kind: "track", trackIndex: 0 };
  const base = "#0099cc";
  let activeToken = "one", live = true, notify;
  const colors = createGpxLayerColors({
    scope: owner.scope,
    entries: { get: () => live ? { id: 1 } : null, subscribe: (handler) => { notify = handler; } },
    rendering: { getStatus: () => ({
      state: "active", visible: true, currentToken: activeToken, semanticRevision: 1, currentRevision: 1,
    }) },
  });
  const generation = (token) => {
    const child = owner.scope.child();
    const drawable = colors.begin({
      entryId: 1, scope: child, currency: { token, isCurrent: () => child.alive },
      visibility: { isVisible: () => true },
    })(target, base);
    const paint = vi.fn();
    drawable.paint.push(paint);
    return { child, paint };
  };
  const old = generation("one");
  expect(colors.set(1, target, "one", "#334455")).toBe(true);
  expect(old.paint).toHaveBeenCalledExactlyOnceWith("#334455");
  const fresh = generation("two");
  activeToken = "two";
  await old.child.dispose();
  expect(colors.get(1, target)).toEqual({ color: "#334455", override: "#334455", token: "two" });
  expect(colors.set(1, target, "one", "#abcdef")).toBe(false);
  expect(fresh.paint).not.toHaveBeenCalled();
  expect(colors.set(1, target, "two", "#abcdef")).toBe(true);
  expect(fresh.paint).toHaveBeenCalledExactlyOnceWith("#abcdef");

  live = false;
  notify({ type: "removed", previous: { id: 1 } });
  await fresh.child.dispose();
  expect(colors.get(1, target)).toEqual({ color: undefined, override: undefined, token: undefined });
  await owner.close();
  expect(owner.snapshot().counts.children).toBe(0);
});
