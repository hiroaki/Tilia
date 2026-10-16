import { listen, node, reportError } from "../../ui/scoped-dom.js";
import { registerLauncher } from "../../ui/toolbar-launcher.js";
import { importRemote, remoteOptions, status } from "./transport.js";
export default Object.freeze({ id: "tilia-url-import", requires: ["tilia-toolbar"], setup(context, options = {}) {
  context.styles.use({ id: "tilia-url-input-ui", href: new URL("./url.css", import.meta.url).href });
  const limits = remoteOptions(options), report = (e) => reportError(context, e);
  let form, input, load, progress, visible = false, pending;
  const update = () => {
    if (!context.scope.alive || !form) return;
    form.classList.toggle("tilia-url-floating-panel-hidden", !visible);
    input.disabled = load.disabled = !!pending;
    progress.textContent = pending ? pending.controller.signal.aborted ? "Cancelling…" : "Loading…" : "";
  };
  const close = () => { visible = false; pending?.controller.abort(); update(); };
  const run = async () => {
    if (pending || !visible) return;
    const scope = context.scope.child({ label: "url-request" }), controller = new AbortController(), record = { scope, controller };
    pending = record; update();
    try { await importRemote(context, { url: input.value, scope, signal: controller.signal, ...limits }); }
    catch (error) { if (scope.alive && !controller.signal.aborted) { report(error); status(context, scope, `URL import failed: ${error.message}`); } }
    finally {
      try { await scope.dispose(); }
      finally { if (context.scope.alive && pending === record) { pending = null; update(); } }
    }
  };
  context.ui.mountSurface({ id: "url", surface: "floating", ariaLabel: "Load URL", mount({ container, scope }) {
    form = node(container, "div", "tilia-control-panel tilia-url-floating-panel tilia-url-floating-panel-hidden"); form.setAttribute("role", "dialog"); form.setAttribute("aria-label", "Load URL");
    const box = node(form, "div", "tilia-url-box");
    input = node(box, "input", "tilia-url-input"); input.type = "url"; input.placeholder = "https://example.com/track.gpx"; input.setAttribute("aria-label", "Remote file URL");
    load = node(box, "button", "tilia-control-button tilia-url-load-button", "Load"); load.type = "button";
    const cancel = node(box, "button", "tilia-control-button tilia-url-close-button", "Close"); cancel.type = "button";
    progress = node(form, "span", "tilia-url-progress"); progress.setAttribute("role", "status");
    listen(scope, load, "click", run, report); listen(scope, cancel, "click", close, report);
    listen(scope, input, "keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); return run(); } }, report);
    listen(scope, form, "keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); close(); } }, report);
    for (const type of ["click", "dblclick", "mousedown", "pointerdown", "wheel"]) listen(scope, form, type, (e) => e.stopPropagation());
  } });
  registerLauncher(context, options, { kind: "action", label: "Load URL", iconText: "U", className: "tilia-url-import-control", activate() {
    if (visible) close(); else { visible = true; update(); input.focus(); }
  } });
} });
