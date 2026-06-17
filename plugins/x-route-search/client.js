import { createPhloemHeaders, createPhloemRequestBody, normalizeRouteResponse } from "./helpers.js";

function createTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timerId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    dispose() {
      globalThis.clearTimeout(timerId);
    },
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function requestPhloemRoutes({
  endpoint,
  apiKey = "",
  profile,
  points,
  options = {},
  timeoutMs = 5000,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is not available");
  }

  const timeoutController = createTimeoutController(timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: createPhloemHeaders({ apiKey }),
      body: JSON.stringify(createPhloemRequestBody({ profile, points, options })),
      signal: timeoutController.signal,
    });
    const payload = await parseJsonResponse(response);

    if (response.ok && payload == null) {
      const error = new Error("Route response was empty or not valid JSON");
      error.code = "invalid_response";
      error.status = response.status;
      throw error;
    }

    if (!response.ok) {
      const message = payload?.error?.message || `HTTP ${response.status}`;
      const error = new Error(message);
      error.code = payload?.error?.code || "request_failed";
      error.details = payload?.error?.details || {};
      error.status = response.status;
      throw error;
    }

    const routes = normalizeRouteResponse(payload);
    if (routes.length === 0) {
      throw new Error("Route response did not include any importable geometry");
    }

    return {
      payload,
      routes,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Route request timed out after ${timeoutMs} ms`);
    }
    throw error;
  } finally {
    timeoutController.dispose();
  }
}