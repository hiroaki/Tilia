import { InputDispatchError } from "../../extensions/errors.js";
import { forwardAbort } from "../../ownership/abort.js";
import { statusServiceKey } from "../contracts/status.js";
import { reportError } from "../../ui/scoped-dom.js";
import { parseHttpUrl, resolveRemoteFileName, getContentLength } from "../../core/input-utils.js";
export const DEFAULT_TIMEOUT_MS = 15000, DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
export function remoteOptions(options = {}) {
  const timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
  const maxBytes = options.maxBytes === undefined ? DEFAULT_MAX_BYTES : options.maxBytes;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647 || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new TypeError("Invalid remote import limits");
  return { timeoutMs, maxBytes };
}
export function status(context, scope, text) {
  if (!context.scope.alive || !scope.alive || scope.signal.aborted) return;
  try { context.services.optional(statusServiceKey)?.set(text); } catch (error) { reportError(context, error); }
}
export async function importFiles(context, { files, scope, signal = scope.signal, source = "file" }) {
  const snapshot = Object.freeze([...files]); let loaded = 0; const details = [];
  for (const file of snapshot) {
    if (!scope.alive || signal.aborted || !context.scope.alive) break;
    try {
      const result = await context.inputs.dispatch(file, { signal });
      if (!scope.alive || signal.aborted || !context.scope.alive) break;
      loaded++; details.push(`${result?.name ?? file.name}${result?.locationSource ? ` (${result.locationSource})` : ""}`);
    } catch (error) {
      if (!scope.alive || signal.aborted || !context.scope.alive) break;
      reportError(context, error); details.push(`${file.name}: ${error instanceof InputDispatchError && error.details.handlerOutcome === "rejected" ? error.details.handlerError?.message ?? String(error.details.handlerError) : error?.message ?? String(error)}`);
      if (error instanceof InputDispatchError && error.details.cancelled) {
        await scope.dispose();
        return loaded;
      }
    }
  }
  if (!signal.aborted) status(context, scope, `Loaded ${loaded} file(s) from ${source}. ${details.join("; ")}`);
  return loaded;
}
export async function importRemote(context, { url, scope, signal = scope.signal, timeoutMs, maxBytes, source = "url" }) {
  const parsed = String(url ?? "").trim() && parseHttpUrl(String(url).trim());
  if (!parsed) throw new TypeError("Only HTTP and HTTPS URLs are supported");
  const operation = scope.child({ label: "remote-import" }), timeout = new AbortController();
  let forwarding, timer, reader, bodyStream, readerDone = false, readerClosed = false, bodyCancelled = false, failure, failed = false, result;
  operation.defer(async () => {
    clearTimeout(timer);
    if (reader && !readerClosed) {
      try { if (!readerDone) { await reader.cancel(); bodyCancelled = true; } }
      finally { reader.releaseLock(); readerClosed = true; }
    } else if (bodyStream && !readerDone && !bodyCancelled) { await bodyStream.cancel(); bodyCancelled = true; }
  }, { label: "remote-body-and-timer", retry: "safe" });
  try {
    forwarding = forwardAbort([signal, operation.signal, timeout.signal], { scope: operation });
    timer = setTimeout(() => timeout.abort(new DOMException(`Request timed out after ${timeoutMs} ms`, "TimeoutError")), timeoutMs);
    const announce = () => { if (forwarding.signal.reason?.name === "TimeoutError") status(context, scope, "URL import timed out; committed entries remain"); };
    operation.defer(() => forwarding.signal.removeEventListener("abort", announce), { retry: "safe" });
    forwarding.signal.addEventListener("abort", announce, { once: true });
    const check = () => { operation.assertAlive(); forwarding.signal.throwIfAborted(); context.scope.assertAlive(); };
    check();
    const response = await fetch(parsed.href, { mode: "cors", signal: forwarding.signal });
    bodyStream = response.body;
    if (!operation.alive || forwarding.signal.aborted) { await bodyStream?.cancel(); bodyCancelled = true; }
    check();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declared = getContentLength(response);
    if (declared !== null && declared > maxBytes) throw new Error(`Remote file is too large (${declared} bytes > ${maxBytes} bytes)`);
    let body;
    if (response.body?.getReader) {
      reader = response.body.getReader(); check(); const chunks = []; let bytes = 0;
      for (;;) {
        const part = await reader.read(); check(); if (part.done) { readerDone = true; break; }
        bytes += part.value.byteLength;
        if (bytes > maxBytes) throw new Error(`Remote file is too large (${bytes} bytes > ${maxBytes} bytes)`);
        chunks.push(part.value);
      }
      reader.releaseLock(); readerClosed = true;
      body = new Blob(chunks, { type: response.headers.get("content-type") ?? "" });
    } else { body = await response.blob(); readerDone = true; check(); if (body.size > maxBytes) throw new Error(`Remote file is too large (${body.size} bytes > ${maxBytes} bytes)`); }
    check();
    const file = new File([body], resolveRemoteFileName(parsed.href, response), { type: body.type || response.headers.get("content-type") || "" });
    result = await importFiles(context, { files: [file], scope: operation, signal: forwarding.signal, source });
  } catch (error) { failed = true; failure = error; }
  finally {
    let detachError;
    try { forwarding?.dispose(); } catch (error) { detachError = error; }
    try { await operation.dispose(); } catch (cleanup) { throw failed ? new AggregateError([failure, cleanup], "Remote import and cleanup failed", { cause: cleanup }) : cleanup; }
    if (detachError) throw failed ? new AggregateError([failure, detachError], "Remote import and listener cleanup failed", { cause: detachError }) : detachError;
  }
  if (failed) throw failure;
  return result;
}
