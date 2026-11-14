// Observe native listeners on elements, document and window. Leaflet beta uses
// pointer capture on the drag target instead of document drag listeners.
export async function instrumentPointerListeners(page) {
  await page.addInitScript(() => {
    const records = new Map(), identities = new WeakMap();
    let nextId = 0;
    const identify = value => {
      if (!identities.has(value)) identities.set(value, ++nextId);
      return identities.get(value);
    };
    const prototype = EventTarget.prototype;
    const add = prototype.addEventListener, remove = prototype.removeEventListener;
    const capture = options => typeof options === "boolean" ? options : Boolean(options?.capture);
    const observed = type => /^pointer(?:move|up|cancel)$|^lostpointercapture$/.test(type);
    const key = (target, type, callback, options) => `${identify(target)}:${type}:${identify(callback)}:${capture(options)}`;
    prototype.addEventListener = function(type, callback, options) {
      const result = add.call(this, type, callback, options);
      if (observed(type) && callback) records.set(key(this, type, callback, options), { type, capture: capture(options) });
      return result;
    };
    prototype.removeEventListener = function(type, callback, options) {
      const result = remove.call(this, type, callback, options);
      if (observed(type) && callback) records.delete(key(this, type, callback, options));
      return result;
    };
    window.nativePointerSummary = () => [...records].map(([key, value]) => ({ key, ...value }));
    window.nativePointerCount = () => records.size;
  });
}

// Initialize Playwright's own hit-target listeners before recording a baseline.
export async function pointerBaseline(page) {
  await page.locator("body").evaluate(() => {});
  return page.evaluate(() => window.nativePointerCount());
}
