// Internal signal utilities. Native accessors preserve the brand check and keep
// callback-bearing lookalikes/getters out of publication guards.
const aborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted").get;
const reason = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "reason").get;

export function signalAborted(signal) {
  return aborted.call(signal);
}

export function signalReason(signal) {
  return reason.call(signal);
}

export function forwardAbort(signals) {
  const controller = new AbortController();
  const registered = new Set();
  const dispose = () => {
    for (const source of registered) source.removeEventListener("abort", abort);
    registered.clear();
  };
  const abort = () => {
    const source = signals.find(signalAborted);
    dispose();
    controller.abort(source ? signalReason(source) : undefined);
  };
  try {
    for (const source of new Set(signals)) {
      if (signalAborted(source)) { abort(); break; }
      if (controller.signal.aborted) break;
      registered.add(source);
      source.addEventListener("abort", abort, { once: true });
      // Registration can reenter teardown before the listener is attached.
      if (controller.signal.aborted || signalAborted(source)) {
        source.removeEventListener("abort", abort);
        abort();
        break;
      }
    }
  } catch (error) {
    dispose();
    throw error;
  }
  return Object.freeze({ signal: controller.signal, dispose });
}
