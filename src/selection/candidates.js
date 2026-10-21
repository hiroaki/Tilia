// One broker per application. Handles convey no public locator or resource.
export function createCandidateBroker() {
  const candidates = new WeakMap();
  return Object.freeze({
    issue(metadata) {
      const candidate = Object.freeze(Object.create(null));
      candidates.set(candidate, Object.freeze(metadata));
      return candidate;
    },
    read(candidate) {
      return candidate && typeof candidate === "object" ? candidates.get(candidate) : undefined;
    },
  });
}
