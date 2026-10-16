// Native accessors validate signals, including those from another realm.
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted").get;
const reason = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "reason").get;
export function signalAborted(signal) { return aborted.call(signal); }
export function signalReason(signal) { return reason.call(signal); }
export function forwardAbort(signals, { scope } = {}) {
  const controller = new AbortController(), registered = new Set();
  const dispose = () => {
    const failures = [];
    for (const source of registered) {
      try { source.removeEventListener("abort", abort); registered.delete(source); }
      catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Abort forwarding cleanup failed");
  };
  const abort = () => {
    const source = signals.find(signalAborted);
    // A failed listener detach must never prevent cancellation or throw out of
    // the native abort event. Reserved Scope cleanup retains/retries residuals.
    try { dispose(); } catch { /* residual registrations remain in the set */ }
    controller.abort(source ? signalReason(source) : undefined);
  };
  scope?.defer(dispose, { label: "abort-forwarding-listeners", retry: "safe" });
  try {
    for (const source of new Set(signals)) {
      if (signalAborted(source)) { abort(); break; }
      if (controller.signal.aborted) break;
      registered.add(source);
      source.addEventListener("abort", abort, { once: true });
      if (controller.signal.aborted || signalAborted(source)) { abort(); break; }
    }
  } catch (error) {
    try { dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], "Abort forwarding acquisition and cleanup failed", { cause: error }); }
    throw error;
  }
  return Object.freeze({ signal: controller.signal, dispose });
}
