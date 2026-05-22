import { TILIA_UI_STYLESHEET_ID } from "./protocol.js";

function resolveDocument(map) {
  const mapContainer = map && typeof map.getContainer === "function"
    ? map.getContainer()
    : null;
  if (mapContainer?.ownerDocument) {
    return mapContainer.ownerDocument;
  }
  if (typeof document !== "undefined") {
    return document;
  }
  return null;
}

export function registerStylesheet({ map = null, document: ownerDocument = null, href, id = href } = {}) {
  if (!href) {
    return null;
  }

  const resolvedDocument = ownerDocument || resolveDocument(map);
  if (!resolvedDocument?.head) {
    return null;
  }

  const existingLinks = Array.from(
    resolvedDocument.head.querySelectorAll?.("link[data-tilia-stylesheet]") || [],
  );
  const existing = existingLinks.find((link) => link?.dataset?.tiliaStylesheet === id) || null;
  if (existing) {
    return existing;
  }

  const link = resolvedDocument.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.tiliaStylesheet = id;
  resolvedDocument.head.appendChild(link);
  return link;
}

export function ensureBuiltinUiStyles({ map = null, document: ownerDocument = null } = {}) {
  return registerStylesheet({
    map,
    document: ownerDocument,
    href: new URL("./styles.css", import.meta.url).href,
    id: TILIA_UI_STYLESHEET_ID,
  });
}