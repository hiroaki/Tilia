import { onScopeClosed, retryScopeCleanup } from "../ownership/scope.js";

export function createOwnedPanelOpener(owner, panel, report) {
  const mounts = new Set();
  owner.defer(async () => {
    for (const record of mounts) {
      const closing = record.attempted
        ? retryScopeCleanup(record.scope)
        : record.handle?.dispose() ?? record.scope.dispose();
      record.attempted = true;
      await closing;
    }
  }, { retry: "safe" });

  return (spec) => {
    let record;
    const handle = panel.open({ ...spec, mount(input) {
      const { scope } = input;
      record = { scope, handle: null, attempted: false };
      const captured = record;
      const close = () => { void (captured.handle?.dispose() ?? scope.dispose()).catch(report); };
      onScopeClosed(scope, () => mounts.delete(captured));
      if (!owner.alive) { close(); return; }

      owner.signal.addEventListener("abort", close, { once: true });
      scope.signal.addEventListener("abort", () => owner.signal.removeEventListener("abort", close), { once: true });
      spec.mount(input);
    } });
    if (record) {
      record.handle = handle;
      mounts.add(record);
      if (!owner.alive) void handle.dispose().catch(report);
    }
    return handle;
  };
}
