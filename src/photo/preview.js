import { forwardAbort } from "../ownership/abort.js";

// Provider-private canonical resource; consumer release never revokes the URL.
export function createPreviewResource(blob, createUrl, revokeUrl) {
  const controller = new AbortController();
  const url = createUrl(blob);
  let disposed = false;
  return Object.freeze({
    url,
    dispose() {
      if (disposed) return;
      controller.abort(); // consumers clear image sources before physical revoke
      revokeUrl(url);
      disposed = true;
    },
    query(scope, isEntryCurrent) {
      if (controller.signal.aborted) return null;
      const released = new AbortController();
      const forwarding = forwardAbort([controller.signal, scope.signal, released.signal]);
      const isCurrent = () => !forwarding.signal.aborted && scope.alive && isEntryCurrent();
      const handle = Object.freeze({
        signal: forwarding.signal,
        isCurrent,
        readUrl() {
          if (!isCurrent()) throw new Error("Photo preview is no longer current");
          return url;
        },
        release() { released.abort(); forwarding.dispose(); },
      });
      if (!isCurrent()) { handle.release(); return null; }
      return handle;
    },
  });
}
