export const applicationErrorCodes = Object.freeze({ destroyed: "APP_DESTROYED", cleanupFailed: "APP_CLEANUP_FAILED" });

export function applicationError(code, message, { failures = [] } = {}) {
  const error = new AggregateError(failures.map(item => item.cause), message);
  error.name = "ApplicationError";
  error.code = code;
  error.details = Object.freeze({ failures: Object.freeze(failures.map(item => Object.freeze({
    resource: item.resource,
    cause: Object.freeze({ name: item.cause?.name ?? "Error", message: item.cause?.message ?? String(item.cause), ...(item.cause?.code ? { code: item.cause.code } : {}) }),
    ...(item.blocked ? { blocked: item.blocked } : {}),
    ...(item.residuals ? { residuals: item.residuals } : {}),
  }))) });
  return error;
}
