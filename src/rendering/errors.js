export const renderingErrorCodes = Object.freeze({
  terminated: "RENDERING_TERMINATED",
  duplicate: "RENDERER_DUPLICATE",
  invalid: "RENDERER_INVALID",
  stale: "RENDERING_STALE",
  sealed: "RENDER_PUBLICATION_SEALED",
  updateForbidden: "RENDER_UPDATE_OPERATION_FORBIDDEN",
});
export class RenderingError extends Error {
  constructor(message, { code = renderingErrorCodes.invalid, cause } = {}) {
    super(message, { cause });
    this.name = "RenderingError";
    this.code = code;
  }
}
export const renderingError = (code, message, cause) =>
  new RenderingError(message, { code, cause });
export function synchronous(callback, ...args) {
  const result = callback(...args);
  if (result && typeof result.then === "function") {
    Promise.resolve(result).catch(() => {});
    throw new TypeError("Rendering hook must be synchronous");
  }
  return result;
}
