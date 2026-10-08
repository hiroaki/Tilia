import { createPhloemHeaders, createPhloemRequestBody, normalizeRouteResponse } from "./helpers.js";

import { forwardAbort, signalAborted, signalReason } from "../../src/ownership/abort.js";

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
  signal,
  scope,
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch API is not available");
  }

  scope?.assertAlive();
  if (signal !== undefined) signalAborted(signal);
  const body = JSON.stringify(createPhloemRequestBody({ profile, points, options }));
  const timeout = new AbortController();
  const forwarding = forwardAbort(signal === undefined ? [timeout.signal] : [signal, timeout.signal], { scope });
  const check = () => {
    if (!forwarding.signal.aborted) return;
    const timedOut = timeout.signal.aborted && !(signal && signalAborted(signal));
    const error = new Error(timedOut ? `Route request timed out after ${timeoutMs} ms` : "Route request cancelled",
      { cause: signalReason(forwarding.signal) });
    error.code = timedOut ? "route_timeout" : "route_cancelled";
    throw error;
  };
  let timer;
  const clear = () => { if (timer !== undefined) globalThis.clearTimeout(timer); };
  scope?.defer(clear, { label: "route-timeout", retry: "safe" });

  try {
    check();
    timer = globalThis.setTimeout(() => timeout.abort(), timeoutMs);
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: createPhloemHeaders({ apiKey }),
      body,
      signal: forwarding.signal,
    });
    check();
    const payload = await parseJsonResponse(response);
    check();

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
    check();
    throw error;
  } finally {
    clear();
    forwarding.dispose();
  }
}