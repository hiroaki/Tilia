// DOM effects belong to the mount scope; async action failures are observed.
export function listen(scope, node, type, callback, report = () => {}) {
  const guarded = scope.guard((event) => {
    try { Promise.resolve(callback(event)).catch(report); } catch (error) { report(error); }
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
