import { semanticError, semanticErrorCodes } from "./errors.js";

const domainKeys = new WeakSet();
const DOMAIN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function defineDomainKey({ id } = {}) {
  if (typeof id !== "string" || !DOMAIN_ID.test(id)) {
    throw semanticError(semanticErrorCodes.domainKeyInvalid, "Invalid domain key", { domainId: id });
  }
  const key = Object.freeze({ id });
  domainKeys.add(key);
  return key;
}

export function assertDomainKey(key) {
  if (!key || !domainKeys.has(key)) {
    throw semanticError(semanticErrorCodes.domainKeyInvalid, "A typed domain key is required");
  }
  return key;
}
