import { extensionError, extensionErrorCodes } from "../extensions/errors.js";
import { retryScopeCleanup } from "../ownership/scope.js";

// The target is private. Contributors receive only files and their invocation.
export function createDropTarget({ container, hostScope, onError = () => {} }) {
  let current = null;
  return ({ scope: contributor, stage, enqueuePostCommit, isInstalling = () => false, isActive = () => true }) => (definition) => {
    contributor.assertAlive();
    if (!definition || typeof definition !== "object" || Array.isArray(definition)
        || Reflect.ownKeys(definition).some((key) => !["id", "onDrop"].includes(key))
        || typeof definition.id !== "string" || !definition.id.trim() || definition.id !== definition.id.trim()
        || typeof definition.onDrop !== "function") throw extensionError(extensionErrorCodes.uiMountInvalid, "Invalid Drop binding");
    if (!container || !hostScope?.alive) throw extensionError(extensionErrorCodes.uiSurfaceUnavailable, "Drop target unavailable");
    if (current) throw extensionError(extensionErrorCodes.resourceConflict, "Drop target is exclusively bound");
    const onDrop = definition.onDrop;
    const initialHighlight = container.classList.contains("tilia-drop-active");
    const binding = hostScope.child({ label: `drop:${definition.id}` });
    const record = { active: false, depth: 0 }; current = record;
    let attempt = null, attempted = false;
    const highlight = (shown) => {
      if (current !== record && shown) return;
      container.classList[shown || initialHighlight ? "add" : "remove"]("tilia-drop-active");
    };
    const revoke = () => {
      record.active = false; record.depth = 0;
      if (current === record) { highlight(false); current = null; }
    };
    const dispose = () => {
      revoke();
      if (attempt) return attempt;
      const work = attempted ? retryScopeCleanup(binding) : binding.dispose(); attempted = true;
      attempt = work;
      void work.finally(() => { if (attempt === work) attempt = null; }).catch(() => {});
      return work;
    };
    const close = () => { void dispose().catch(onError); };
    binding.signal.addEventListener("abort", revoke, { once: true });
    contributor.signal.addEventListener("abort", close, { once: true });
    binding.defer(() => {
      contributor.signal.removeEventListener("abort", close);
      binding.signal.removeEventListener("abort", revoke);
    }, { retry: "safe" });
    contributor.defer(dispose, { label: "drop-binding-close", retry: "safe" });
    const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const deliver = (files) => {
      if (!files.length || !record.active || !binding.alive || !contributor.alive || current !== record) return;
      const invocation = binding.child({ label: "drop-invocation" });
      let settled; const observed = new Promise((resolve) => { settled = resolve; });
      invocation.track(observed, { label: "drop-callback", await: false });
      let result;
      try { result = onDrop(Object.freeze({ files: Object.freeze(files), scope: invocation })); }
      catch (error) { result = Promise.reject(error); }
      void Promise.resolve(result).then(() => {}, onError).finally(() => {
        settled(); return invocation.dispose().catch(onError);
      }).catch(onError);
    };
    const handlers = {
      dragenter(event) { if (hasFiles(event)) { record.depth++; highlight(true); } },
      dragover(event) { if (hasFiles(event)) { record.depth = Math.max(1, record.depth); highlight(true); event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } },
      dragleave(event) {
        if (!hasFiles(event)) return;
        if (event.relatedTarget && !container.contains?.(event.relatedTarget)) record.depth = 0;
        else record.depth = Math.max(0, record.depth - 1);
        if (!record.depth) highlight(false);
      },
      dragend() { record.depth = 0; highlight(false); },
      drop(event) {
        record.depth = 0; highlight(false);
        if (!hasFiles(event)) return;
        event.preventDefault();
        deliver(Array.from(event.dataTransfer.files ?? []));
      },
    };
    const activate = () => {
      if (!binding.alive || !contributor.alive || current !== record || !isActive()) return;
      for (const [type, handler] of Object.entries(handlers)) {
        const listener = (event) => { if (record.active && binding.alive && contributor.alive && current === record) handler(event); };
        binding.defer(() => container.removeEventListener(type, listener, true), { label: `drop:${type}`, retry: "safe" });
        container.addEventListener(type, listener, true);
      }
      record.active = true;
    };
    if (isInstalling()) stage({ label: "drop-target", retry: "safe", preflight() {
      if (!binding.alive) return;
      if (current !== record || !hostScope.alive) throw extensionError(extensionErrorCodes.resourceConflict, "Drop target reservation lost");
    }, commit() { enqueuePostCommit(() => { try { activate(); } catch (error) { close(); throw error; } }); }, dispose() { return dispose(); } });
    else { try { activate(); } catch (error) { close(); throw error; } }
    return Object.freeze({ dispose });
  };
}
