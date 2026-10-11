import { importRemote, remoteOptions, status } from "./transport.js";
import { reportError } from "../../ui/scoped-dom.js";
export default Object.freeze({ id: "tilia-query-import", setup(context, options = {}) {
  const limits = remoteOptions(options), parameterName = options.parameterName ?? "gpx";
  if (typeof parameterName !== "string" || !parameterName) throw new TypeError("Invalid query parameter name");
  const url = new URLSearchParams(globalThis.window?.location?.search ?? "").get(parameterName);
  let activated = false, started = false, subscription;
  const start = () => {
    if (!activated || started || !url || !context.scope.alive || !context.inputs.getSnapshot().length) return;
    started = true; subscription?.unsubscribe();
    const scope = context.scope.child({ label: "query-import" });
    const work = importRemote(context, { url, scope, ...limits, source: "query" }).catch((error) => {
      if (!scope.alive) return; reportError(context, error); status(context, scope, `URL import failed: ${error.message}`);
    }).finally(() => scope.dispose());
    context.scope.track(work, { label: "query-import-observer", await: false });
  };
  context.lifecycle.afterCommit(() => { activated = true; subscription = context.inputs.subscribe(start, { emitCurrent: false }); start(); });
} });
