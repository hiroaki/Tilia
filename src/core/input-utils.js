export const DEFAULT_URL_IMPORT_TIMEOUT_MS = 15000;
export const DEFAULT_URL_IMPORT_MAX_BYTES = 10 * 1024 * 1024;

function fileNameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.split("/").filter(Boolean);
    return path[path.length - 1] || "remote.gpx";
  } catch {
    return "remote.gpx";
  }
}

export function parseHttpUrl(value) {
  try {
    const baseUrl = typeof window !== "undefined" && window.location?.href
      ? window.location.href
      : "https://example.invalid/";
    const parsed = new URL(value, baseUrl);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function resolveRemoteFileName(url, response) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
  const candidate = match ? decodeURIComponent(match[1].replace(/"/g, "")) : fileNameFromUrl(url);
  const contentType = (response.headers.get("content-type") || "").toLowerCase();

  if (/\.gpx$/i.test(candidate)) {
    return candidate;
  }

  if (contentType.includes("gpx") || contentType.includes("xml")) {
    return `${candidate || "remote"}.gpx`;
  }

  return candidate || "remote.gpx";
}

export function getContentLength(response) {
  const rawValue = response.headers.get("content-length");
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function isSupportedRemoteGpxContent(fileName, contentType) {
  const normalizedFileName = String(fileName || "").toLowerCase();
  const normalizedContentType = String(contentType || "").toLowerCase();

  if (normalizedFileName.endsWith(".gpx")) {
    return true;
  }

  return normalizedContentType.includes("gpx")
    || normalizedContentType.includes("xml")
    || normalizedContentType.includes("octet-stream");
}