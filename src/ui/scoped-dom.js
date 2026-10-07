// DOM effects belong to the mount scope; async action failures are observed.
export function listen(scope, node, type, callback, report = () => {}) {
  const guarded = scope.guard((event) => {
    let settle;
    const observed = new Promise((resolve) => { settle = resolve; });
    scope.track(observed, { label: `dom-action:${type}`, await: false });
    try { void Promise.resolve(callback(event)).catch(report).finally(settle).catch(() => {}); }
    catch (error) { settle(); report(error); }
  });
  scope.defer(() => node.removeEventListener(type, guarded), { retry: "safe" });
  node.addEventListener(type, guarded);
}
export function node(container, tag, className, text) {
  const value = container.ownerDocument.createElement(tag);
  value.className = className;
  if (text !== undefined) value.textContent = text;
  container.appendChild(value);
  return value;
}
export function reportError(context, error) { context.diagnostics?.report?.(error); }
