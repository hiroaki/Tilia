import { retryScopeCleanup } from "../ownership/scope.js";

export function guardedMount(owner, mount, onError) {
  return (input) => {
    owner.assertAlive();
    const scope = input.scope;
    scope.assertAlive();
    const observed = new WeakSet();
    const observe = (operation) => {
      if (!observed.has(operation)) {
        observed.add(operation);
        void operation.catch(onError);
      }
      return operation;
    };
    const close = () => { observe(scope.dispose()); };
    const detach = () => {
      owner.signal.removeEventListener("abort", close);
      scope.signal.removeEventListener("abort", detach);
    };
    // The host remains the resource owner. The contributor owns only the
    // obligation to join closure and, on explicit retry, retry failed records.
    let attempted = false;
    owner.defer(() => {
      const operation = attempted ? retryScopeCleanup(scope) : scope.dispose();
      attempted = true;
      return observe(operation);
    }, { label: "contribution-mount-close", retry: "safe" });
    scope.defer(detach, { label: "contribution-mount-listeners", retry: "safe" });
    scope.signal.addEventListener("abort", detach, { once: true });
    owner.signal.addEventListener("abort", close, { once: true });
    if (!owner.alive || !scope.alive) { detach(); close(); return; }
    try { mount(input); }
    catch (error) { close(); throw error; }
  };
}
