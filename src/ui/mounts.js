import { createLayoutHost } from "./layout.js";
import { createDropTarget } from "./drop-target.js";
import { extensionError, extensionErrorCodes } from "../extensions/errors.js";

const SURFACES = new Set(["panel", "floating"]);

export function createUiMountManager({ map, scope: hostScope, onError = () => {} }) {
  const container = map?.getContainer?.();
  const ownerDocument = container?.ownerDocument;
  const layout = createLayoutHost({ container, scope: hostScope, onError });
  const roots = new Map();
  const mounts = new Map();
  const bindDrop = createDropTarget({ container, hostScope, onError });

  function rootFor(surface) {
    let root = roots.get(surface);
    if (!root) {
      if (!container || !ownerDocument) throw extensionError(extensionErrorCodes.uiSurfaceUnavailable, `UI surface "${surface}" is unavailable`);
      root = ownerDocument.createElement("div");
      root.className = `tilia-ui-surface-root tilia-ui-surface-root-${surface}`;
      root.dataset.tiliaSurfaceRoot = surface;
      hostScope.defer(() => { root.remove(); roots.delete(surface); }, { label: `ui-root:${surface}`, retry: "safe" });
      container.appendChild(root);
      roots.set(surface, root);
    }
    return root;
  }

  function reorder(surface) {
    const root = roots.get(surface);
    if (!root) return;
    const ordered = [...mounts.values()].filter((item) => item.surface === surface)
      .sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
    for (const item of ordered) root.appendChild(item.wrapper);
  }

  function createFacade(input) {
    const { pluginId, scope } = input;
    return Object.freeze({
      bindDropTarget: bindDrop(input),
      mountSurface({ id, surface = "floating", rank = 0, ariaLabel, mount }) {
        scope.assertAlive();
        hostScope.assertAlive();
        if (typeof id !== "string" || !id || !SURFACES.has(surface) || !Number.isFinite(rank) || typeof mount !== "function") {
          throw extensionError(extensionErrorCodes.uiMountInvalid, "Invalid UI mount");
        }
        const key = `${pluginId}:${id}`;
        if (mounts.has(key)) throw extensionError(extensionErrorCodes.uiMountInvalid, `Duplicate UI mount "${key}"`);
        const mountScope = scope.child({ label: `ui:${id}` });
        const wrapper = ownerDocument.createElement("div");
        wrapper.dataset.tiliaSurface = surface;
        wrapper.dataset.tiliaMount = key;
        if (ariaLabel) wrapper.setAttribute("aria-label", ariaLabel);
        const record = { key, surface, rank, wrapper, mountScope };
        let cleanupPromise = null;
        const unmount = () => {
          if (cleanupPromise) return cleanupPromise;
          mounts.delete(key);
          // dispose() revokes the complete child tree synchronously before its
          // asynchronous cleanup begins. The wrapper is removed after that
          // cleanup settles, including when cleanup reports a failure.
          cleanupPromise = mountScope.dispose().finally(() => { wrapper.remove(); layout(); });
          // The parent disposer awaits this same promise. This observer only
          // prevents an early mount failure from becoming unhandled meanwhile.
          cleanupPromise.catch(() => {});
          return cleanupPromise;
        };
        scope.defer(unmount, { label: `ui-mount:${id}`, retry: "safe" });
        try {
          rootFor(surface).appendChild(wrapper);
          hostScope.assertAlive();
          scope.assertAlive();
          mounts.set(key, record);
          reorder(surface);
          mount({ container: wrapper, scope: mountScope });
          layout();
        } catch (error) {
          unmount();
          throw error;
        }
        return Object.freeze({ element: wrapper, unmount });
      },
    });
  }

  return Object.freeze({ createFacade });
}
