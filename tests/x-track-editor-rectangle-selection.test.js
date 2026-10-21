import { createScopeController } from "../src/ownership/index.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRectangleSelection,
  selectPointIdsInContainerBounds,
} from "../plugins/x-track-editor/rectangle-selection.js";

describe("x-track-editor rectangle selection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hit-tests current domain coordinates inclusively and preserves segment order", () => {
    const map = {
      latLngToContainerPoint: ([lat, lon]) => ({ x: lon, y: lat }),
    };
    const domain = {
      points: [
        { id: "first", lat: 10, lon: 10 },
        { id: "second", lat: 15, lon: 15 },
        { id: "boundary", lat: 20, lon: 20 },
        { id: "outside", lat: 21, lon: 21 },
      ],
    };

    expect(selectPointIdsInContainerBounds(map, domain, {
      min: { x: 10, y: 10 },
      max: { x: 20, y: 20 },
    })).toEqual(["first", "second", "boundary"]);
    expect(selectPointIdsInContainerBounds(map, null, null)).toEqual([]);
  });

  it("restores map dragging only when it was enabled before activation", async () => {
    class FakeElement extends EventTarget {
      constructor() {
        super();
        this.children = [];
        this.className = "";
      }
      appendChild(child) { this.children.push(child); child.parent = this; }
      remove() {
        if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
      }
      getBoundingClientRect() { return { left: 0, top: 0 }; }
    }
    const fakeDocument = new EventTarget();
    fakeDocument.createElement = () => new FakeElement();
    vi.stubGlobal("document", fakeDocument);

    for (const initiallyEnabled of [true, false]) {
      let enabled = initiallyEnabled;
      const container = new FakeElement();
      const map = {
        getContainer: () => container,
        dragging: {
          enabled: () => enabled,
          disable: vi.fn(() => { enabled = false; }),
          enable: vi.fn(() => { enabled = true; }),
        },
      };
      const controller = createScopeController(); await controller.commit();
      const scope = controller.scope.child();
      const rectangleSelection = createRectangleSelection({ map, scope, parent: container });
      rectangleSelection.activate();
      expect(enabled).toBe(false);
      expect(rectangleSelection.isActive()).toBe(true);
      rectangleSelection.cancel();
      expect(enabled).toBe(initiallyEnabled);
      expect(map.dragging.enable).toHaveBeenCalledTimes(initiallyEnabled ? 1 : 0);
      expect(container.children).toEqual([]);
      rectangleSelection.destroy();
      await controller.close();
    }
  });

  it.each([false, true])("keeps a new drag intact while old cleanup finishes (release failure: %s)", async failFirstRelease => {
    let failRelease = false;
    class FakeElement extends EventTarget {
      constructor() {
        super();
        this.children = [];
        this.style = {};
        this.capturedPointers = new Set();
      }
      appendChild(child) { this.children.push(child); child.parent = this; }
      remove() {
        if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
        this.parent = null;
      }
      getBoundingClientRect() { return { left: 0, top: 0 }; }
      setPointerCapture(id) { this.capturedPointers.add(id); }
      hasPointerCapture(id) { return this.capturedPointers.has(id); }
      releasePointerCapture(id) {
        if (failRelease) { failRelease = false; throw new Error("pointer release failed"); }
        this.capturedPointers.delete(id);
      }
    }
    const fakeDocument = new EventTarget();
    fakeDocument.createElement = () => new FakeElement();
    vi.stubGlobal("document", fakeDocument);
    const container = new FakeElement();
    let enabled = true;
    const map = {
      getContainer: () => container,
      dragging: {
        enabled: () => enabled,
        disable() { enabled = false; },
        enable() { enabled = true; },
      },
    };
    const dispatch = (type, x, y) => {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, { button: 0, pointerId: 1, clientX: x, clientY: y });
      container.dispatchEvent(event);
    };
    const completed = vi.fn(() => "success");
    const report = vi.fn();
    const controller = createScopeController();
    await controller.commit();
    const rectangleScope = controller.scope.child();
    const gestures = [];
    const selection = createRectangleSelection({
      map, parent: container, onComplete: completed, report,
      scope: { ...rectangleScope, child(options) {
        const child = rectangleScope.child(options);
        gestures.push(child);
        return child;
      } },
    });
    try {
      selection.activate();
      dispatch("pointerdown", 1, 2);
      failRelease = failFirstRelease;
      selection.cancel();
      // Reuse the same pointer before the previous Scope's asynchronous cleanup.
      selection.activate();
      dispatch("pointerdown", 10, 20);
      const rectangle = container.children[0].children[0];
      await gestures[0].dispose();
      expect(report).toHaveBeenCalledTimes(failFirstRelease ? 1 : 0);
      expect(selection.isActive()).toBe(true);
      expect(selection.isDragging()).toBe(true);
      expect(container.hasPointerCapture(1)).toBe(true);
      expect(enabled).toBe(false);
      expect(container.children[0].children).toEqual([rectangle]);
      dispatch("pointermove", 30, 40);
      expect(rectangle.style).toMatchObject({ width: "20px", height: "20px" });
      dispatch("pointerup", 30, 40);
      expect(completed).toHaveBeenCalledExactlyOnceWith({
        min: { x: 10, y: 20 }, max: { x: 30, y: 40 },
      });
      expect(selection.isActive()).toBe(false);
      expect(selection.isDragging()).toBe(false);
      expect(container.hasPointerCapture(1)).toBe(false);
      expect(enabled).toBe(true);
      expect(container.children).toEqual([]);
    } finally {
      await controller.close();
    }
  });
});
