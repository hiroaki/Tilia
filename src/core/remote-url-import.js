import { processInputItems } from "./input-processing.js";
import {
  DEFAULT_URL_IMPORT_MAX_BYTES,
  DEFAULT_URL_IMPORT_TIMEOUT_MS,
  getContentLength,
  isSupportedRemoteGpxContent,
  parseHttpUrl,
  resolveRemoteFileName,
} from "./input-utils.js";

function createTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs} ms`));
  }, timeoutMs);

  return {
    signal: controller.signal,
    dispose() {
      window.clearTimeout(timerId);
    },
  };
}

export async function importRemoteUrl({
  url,
  registry,
  context,
  onStatus,
  onError,
  onItemLoaded,
  timeoutMs = DEFAULT_URL_IMPORT_TIMEOUT_MS,
  maxBytes = DEFAULT_URL_IMPORT_MAX_BYTES,
}) {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) {
    onStatus("URL is empty");
    return;
  }

  const parsedUrl = parseHttpUrl(rawUrl);
  if (!parsedUrl) {
    onStatus("URL import failed: only http:// and https:// URLs are supported");
    return;
  }

  try {
    const timeoutController = createTimeoutController(timeoutMs);

    try {
      const response = await fetch(parsedUrl.toString(), {
        mode: "cors",
        signal: timeoutController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const declaredLength = getContentLength(response);
      if (declaredLength !== null && declaredLength > maxBytes) {
        throw new Error(`Remote file is too large (${declaredLength} bytes > ${maxBytes} bytes)`);
      }

      const body = await response.blob();
      if (body.size > maxBytes) {
        throw new Error(`Remote file is too large (${body.size} bytes > ${maxBytes} bytes)`);
      }

      const fileName = resolveRemoteFileName(parsedUrl.toString(), response);
      const type = body.type || response.headers.get("content-type") || "application/gpx+xml";
      if (!isSupportedRemoteGpxContent(fileName, type)) {
        throw new Error(`Unsupported remote content type: ${type || "unknown"}`);
      }

      const file = new File([body], fileName, { type });
      await processInputItems({
        items: [file],
        registry,
        context,
        onStatus,
        onError,
        sourceLabel: "url",
        onItemLoaded,
      });
    } finally {
      timeoutController.dispose();
    }
  } catch (error) {
    onError(error);
    const detail = error instanceof TypeError ? "network error or CORS blocked the request" : error.message;
    onStatus(`URL import failed: ${detail}`);
  }
}
