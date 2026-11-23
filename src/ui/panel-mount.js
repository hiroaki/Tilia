// A panel's Scope belongs to the host. Revoke it as soon as the consumer
// starts closing, while its existing cleanup still joins the panel handle.
export function closePanelMountOnAbort(owner, mount, report) {
  const close = () => { void mount.dispose().catch(report); };
  if (!owner.alive) { close(); return; }
  owner.signal.addEventListener("abort", close, { once: true });
  mount.signal.addEventListener("abort", () => owner.signal.removeEventListener("abort", close), { once: true });
}
