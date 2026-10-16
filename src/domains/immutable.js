import { semanticError, semanticErrorCodes } from "./errors.js";

function isPlainRecord(value) {
  if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function cloneAndFreezePlainData(value, path = "snapshot") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item, index) => cloneAndFreezePlainData(item, `${path}[${index}]`)));
  }
  if (isPlainRecord(value)) {
    const copy = {};
    for (const [key, item] of Object.entries(value)) {
      copy[key] = cloneAndFreezePlainData(item, `${path}.${key}`);
    }
    return Object.freeze(copy);
  }
  throw semanticError(
    semanticErrorCodes.providerResultInvalid,
    `Domain snapshot contains non-portable data at ${path}`,
    { path },
  );
}

export function assertDeepImmutablePlainData(value, path = "snapshot") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (value === undefined) return;
  if (!Object.isFrozen(value)) {
    throw semanticError(semanticErrorCodes.providerResultInvalid, `Domain snapshot is mutable at ${path}`, { path });
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertDeepImmutablePlainData(item, `${path}[${index}]`));
    return;
  }
  if (isPlainRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertDeepImmutablePlainData(item, `${path}.${key}`);
    }
    return;
  }
  throw semanticError(semanticErrorCodes.providerResultInvalid, `Domain snapshot contains non-portable data at ${path}`, { path });
}
