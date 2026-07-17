import { importRemoteUrl } from "./url-import.js";
import {
  DEFAULT_URL_IMPORT_MAX_BYTES,
  DEFAULT_URL_IMPORT_TIMEOUT_MS,
} from "../../core/input-utils.js";

export async function installQueryImportPlugin({
  registry,
  context,
  onStatus,
  onError,
  onItemLoaded,
  parameterName = "gpx",
  timeoutMs = DEFAULT_URL_IMPORT_TIMEOUT_MS,
  maxBytes = DEFAULT_URL_IMPORT_MAX_BYTES,
}) {
  const params = new URLSearchParams(window.location.search);

  const url = params.get(parameterName);

  if (!url) {
    return;
  }

  await importRemoteUrl({
    url,
    registry,
    context,
    onStatus,
    onError,
    onItemLoaded,
    timeoutMs,
    maxBytes,
  });
}
