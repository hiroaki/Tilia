// A domain mount rereads current authority at admission and after settlement.
// No UI scheduler crosses mounts; EntryStore owns semantic serialization.
export function domainMount({ scope, entry, entries, domain, report, withdraw }) {
  const controls = new Set(); let pending = false;
  const current = () => {
    if (!scope.alive) return null;
    if (entries && !entries.get(entry.id)) { withdraw?.(); return null; }
    return domain.get(entry.id);
  };
  const update = (render) => {
    if (!scope.alive) return;
    try { const view = current(); if (view) render(view); } catch (error) { report(error); }
  };
  const subscribe = (render, onEvent = () => {}) => {
    if (!entries) return;
    const subscription = entries.subscribe((event) => {
      onEvent(event);
      if (event.entry?.id === entry.id || event.current?.entry?.id === entry.id || event.current?.id === entry.id
          || event.previous?.id === entry.id || event.type === "cleared") update(render);
    }, { emitCurrent: false });
    scope.defer(() => subscription.unsubscribe(), { retry: "safe" });
  };
  const command = async (admit, render) => {
    if (!scope.alive) return;
    if (pending) { update(render); return; }
    const view = current(); if (!view) return;
    // Disabling the active native control blurs it. Keep it focusable while
    // the pending guard rejects repeated commands and restores its projection.
    pending = true; for (const control of controls) {
      if (control.ownerDocument.activeElement !== control) control.disabled = true;
    }
    try { await admit(view); } finally { pending = false; if (scope.alive) { for (const control of controls) control.disabled = false; update(render); } }
  };
  return { current, update, subscribe, command, controls };
}
