import { describe, expect, it, vi } from "vitest";

import { requestPhloemRoutes } from "../plugins/x-route-search/client.js";

function createJsonResponse(payload, { status = 200 } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("x-route-search client", () => {
  it("returns normalized routes from a successful response", async () => {
    const fetchImpl = vi.fn(async () => createJsonResponse({
      route: {
        geometry: {
          type: "LineString",
          coordinates: [[139.76, 35.68], [139.77, 35.69]],
        },
        distance_meters: 1234,
        duration_seconds: 567,
        provider: "graphhopper",
        warnings: [],
      },
    }));

    const result = await requestPhloemRoutes({
      endpoint: "http://127.0.0.1:3000/route",
      profile: "car",
      points: [{ lat: 35.68, lon: 139.76 }, { lat: 35.69, lon: 139.77 }],
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]).toMatchObject({
      provider: "graphhopper",
      distanceMeters: 1234,
      durationSeconds: 567,
    });
  });

  it("maps upstream error envelopes to thrown errors", async () => {
    const fetchImpl = vi.fn(async () => createJsonResponse({
      error: {
        code: "upstream_error",
        message: "Cannot find point 0",
        details: { provider: "graphhopper" },
      },
    }, { status: 502 }));

    await expect(requestPhloemRoutes({
      endpoint: "http://127.0.0.1:3000/route",
      profile: "car",
      points: [{ lat: 35.68, lon: 139.76 }, { lat: 35.69, lon: 139.77 }],
      fetchImpl,
    })).rejects.toMatchObject({
      message: "Cannot find point 0",
      code: "upstream_error",
      status: 502,
      details: { provider: "graphhopper" },
    });
  });

  it("throws a timeout error for aborted requests", async () => {
    const fetchImpl = vi.fn(async (_url, options) => {
      options.signal.dispatchEvent(new Event("abort"));
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });

    await expect(requestPhloemRoutes({
      endpoint: "http://127.0.0.1:3000/route",
      profile: "car",
      points: [{ lat: 35.68, lon: 139.76 }, { lat: 35.69, lon: 139.77 }],
      timeoutMs: 1,
      fetchImpl,
    })).rejects.toThrow(/timed out/i);
  });

  it("throws a clear error for successful but non-JSON responses", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", {
      status: 200,
      headers: {
        "content-type": "text/plain",
      },
    }));

    await expect(requestPhloemRoutes({
      endpoint: "http://127.0.0.1:3000/route",
      profile: "car",
      points: [{ lat: 35.68, lon: 139.76 }, { lat: 35.69, lon: 139.77 }],
      fetchImpl,
    })).rejects.toMatchObject({
      code: "invalid_response",
      status: 200,
    });
  });
});