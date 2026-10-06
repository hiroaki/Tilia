import { pluginError, pluginErrorCodes } from "./errors.js";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function assertPluginId(id, { builtinIds = new Set(), field = "id" } = {}) {
  if (typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw pluginError(pluginErrorCodes.idInvalid, `Plugin ${field} must be lower-kebab-case`, { pluginId: id });
  }
  if (id.startsWith("tilia-") && !builtinIds.has(id)) {
    throw pluginError(pluginErrorCodes.idInvalid, `The "tilia-" namespace is reserved for catalogued built-ins`, { pluginId: id });
  }
  if (!id.startsWith("tilia-") && !id.includes("-")) {
    throw pluginError(pluginErrorCodes.idInvalid, `External plugin IDs must include a vendor or experimental prefix`, { pluginId: id });
  }
  return id;
}

function normalizeRequires(value, details) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) {
    throw pluginError(pluginErrorCodes.descriptorInvalid, "Plugin requires must be an array", details);
  }
  const seen = new Set();
  const result = value.map((id) => {
    if (typeof id !== "string" || !ID_PATTERN.test(id)) {
      throw pluginError(pluginErrorCodes.descriptorInvalid, "Plugin dependencies must be lower-kebab IDs", { ...details, dependencyId: id });
    }
    if (seen.has(id)) {
      throw pluginError(pluginErrorCodes.descriptorInvalid, `Plugin dependency "${id}" is duplicated`, { ...details, dependencyId: id });
    }
    seen.add(id);
    return id;
  });
  if (seen.has(details.pluginId)) {
    throw pluginError(pluginErrorCodes.descriptorInvalid, "A plugin cannot require itself", details);
  }
  return Object.freeze(result);
}

function rejectRemovedFields(value, details) {
  for (const field of ["optionalRequires", "stylesheets", "destroy", "dispose"]) {
    if (field in value) {
      throw pluginError(pluginErrorCodes.descriptorInvalid, `Plugin descriptor field "${field}" is not supported`, { ...details, field });
    }
  }
}

export function normalizeCatalog(entries = []) {
  if (!Array.isArray(entries)) {
    throw pluginError(pluginErrorCodes.descriptorInvalid, "Plugin catalog must be an array");
  }
  const builtinIds = new Set(entries.map((entry) => entry?.id).filter((id) => typeof id === "string" && id.startsWith("tilia-")));
  const catalog = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw pluginError(pluginErrorCodes.descriptorInvalid, "Plugin catalog entries must be objects");
    }
    const id = assertPluginId(entry.id, { builtinIds });
    if (catalog.has(id)) {
      throw pluginError(pluginErrorCodes.descriptorConflict, `Duplicate plugin catalog ID "${id}"`, { pluginId: id });
    }
    if (typeof entry.load !== "function") {
      throw pluginError(pluginErrorCodes.descriptorInvalid, `Plugin catalog entry "${id}" must define load()`, { pluginId: id });
    }
    rejectRemovedFields(entry, { pluginId: id });
    catalog.set(id, Object.freeze({ id, requires: normalizeRequires(entry.requires, { pluginId: id }), load: entry.load }));
  }
  return catalog;
}

export function normalizeDirectDefinition(definition, builtinIds = new Set()) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw pluginError(pluginErrorCodes.descriptorInvalid, "Plugins must be an ID or a plugin definition");
  }
  const id = assertPluginId(definition.id, { builtinIds });
  rejectRemovedFields(definition, { pluginId: id });
  if (typeof definition.setup !== "function") {
    throw pluginError(pluginErrorCodes.descriptorInvalid, `Plugin "${id}" must define setup()`, { pluginId: id });
  }
  const requires = normalizeRequires(definition.requires, { pluginId: id });
  return Object.freeze({
    id,
    requires,
    load: () => definition,
    directDefinition: definition,
  });
}

export function validateImplementation(value, metadata) {
  const implementation = value?.default ?? value;
  if (!implementation || typeof implementation !== "object" || Array.isArray(implementation)
      || implementation.id !== metadata.id || typeof implementation.setup !== "function") {
    throw pluginError(pluginErrorCodes.implementationInvalid, `Resolved implementation for "${metadata.id}" is invalid`, { pluginId: metadata.id });
  }
  return Object.freeze({ id: implementation.id, setup: implementation.setup });
}

export function sameMetadata(left, right) {
  return left.id === right.id
    && left.requires.length === right.requires.length
    && left.requires.every((id, index) => id === right.requires[index])
    && (!left.directDefinition || !right.directDefinition || left.directDefinition === right.directDefinition);
}
