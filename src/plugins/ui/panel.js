import { panelServiceKey } from "../contracts/panel.js";
import { listen, node, reportError } from "../../ui/scoped-dom.js";
export default Object.freeze({
  id: "tilia-panel",
  setup(context) {
    context.styles.use({ id: "tilia-panel-ui", href: new URL("./panel.css", import.meta.url).href });
    let active = null, root, body, title;
    let requestVersion = 0;
    const cancelledHandle = Object.freeze({ dispose: () => Promise.resolve() });
    const report = (error) => reportError(context, error);
    const closeRecord = (record) => {
      if (!record) return Promise.resolve();
      const current = active === record;
      const version = requestVersion;
      if (current) {
        active = null;
        root.classList.add("tilia-side-panel-hidden");
        delete root.dataset.tiliaPanelLayout;
      }
      // Revoke this captured scope before cleanup; stale failures/handles must
      // never change a reentrant replacement, even when its ID is identical.
      const closing = record.scope.dispose();
      // Observe even fire-and-forget supersession; the scope retains failures
      // for the ordinary panel-owner residual/retry path.
      void closing.catch(report);
      record.container.remove();
      if (current && active === null && version === requestVersion) {
        try { (record.focus?.isConnected ? record.focus : root.ownerDocument.querySelector?.(".tilia-toolbar-item button:not(:disabled)") ?? root.parentNode)?.focus?.(); } catch (error) { report(error); }
      }
      return closing;
    };
    const close = (id) => {
      if (id !== undefined && active?.id !== id) return Promise.resolve();
      ++requestVersion;
      return closeRecord(active);
    };
    context.ui.mountSurface({ id: "panel", surface: "panel", ariaLabel: "Tilia panel",
      mount({ container, scope }) {
        Object.assign(container.style, { position: "absolute", inset: "0", pointerEvents: "none" });
        root = node(container, "aside", "tilia-side-panel tilia-side-panel-layout-side tilia-side-panel-hidden");
        root.style.pointerEvents = "auto";
        root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "Tilia panel");
        container.tabIndex = -1;
        const header = node(root, "div", "tilia-side-panel-header");
        title = node(header, "h2", "tilia-side-panel-title", "Panel");
        const button = node(header, "button", "tilia-control-close tilia-side-panel-close", "Close");
        button.type = "button";
        body = node(root, "div", "tilia-side-panel-body");
        listen(scope, button, "click", () => close(), report);
        listen(scope, root, "keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); return close(); } }, report);
        for (const event of ["click", "dblclick", "mousedown", "pointerdown", "wheel"])
          listen(scope, root, event, (e) => e.stopPropagation());
        scope.defer(() => close(), { retry: "safe" });
      },
    });
    function validate(spec) {
      if (!spec || typeof spec !== "object" || Array.isArray(spec) || typeof spec.id !== "string" || !spec.id.trim()
          || typeof spec.title !== "string" || !spec.title.trim() || typeof spec.mount !== "function"
          || !["side", "bottom"].includes(spec.layout === undefined ? "side" : spec.layout)) throw new TypeError("Invalid panel specification");
    }
    function open(spec) {
      validate(spec);
      const { id, title: label, mount, layout = "side" } = spec;
      context.scope.assertAlive();
      // Last admitted request wins. Abort/focus callbacks may synchronously
      // admit a newer request while the captured old record is closing.
      const request = ++requestVersion;
      void closeRecord(active);
      if (request !== requestVersion) return cancelledHandle;
      const scope = context.scope.child({ label: `panel:${id}` });
      const container = node(body, "div", "tilia-panel-content");
      const record = { id, scope, container, focus: container.ownerDocument.activeElement };
      active = record;
      title.textContent = label; root.setAttribute("aria-label", label);
      root.classList.toggle("tilia-side-panel-layout-side", layout === "side");
      root.classList.toggle("tilia-side-panel-layout-bottom", layout === "bottom");
      root.dataset.tiliaPanelLayout = layout;
      root.classList.remove("tilia-side-panel-hidden");
      scope.defer(() => container.remove(), { retry: "safe" });
      try { mount({ container, scope }); } catch (error) { void closeRecord(record); throw error; }
      return Object.freeze({ dispose() {
        if (active === record) ++requestVersion;
        return closeRecord(record);
      } });
    }
    context.services.provide(panelServiceKey, {
      open, close, isOpen: (id) => active?.id === id,
      toggle(spec) { validate(spec); return active?.id === spec.id ? close(spec.id) : open(spec); },
    });
  },
});
