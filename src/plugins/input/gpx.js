import { gpxDomainKey } from "../../domains/keys.js";
export default Object.freeze({ id: "tilia-gpx-input", requires: ["tilia-gpx-domain"], setup(context) {
  const gpx = context.domains.require(gpxDomainKey);
  context.inputs.register({ id: "tilia-gpx", priority: 0,
    discovery: { extensions: [".gpx"], mimeTypes: ["application/gpx+xml"] },
    recognize(input) { return input instanceof Blob && (input.type === "application/gpx+xml" || /\.gpx$/i.test(input.name ?? "")); },
    async handle({ input, signal }) {
      signal.throwIfAborted();
      const { parseGpxFile } = await import("../../gpx/parse.js");
      signal.throwIfAborted();
      const data = await parseGpxFile(input);
      signal.throwIfAborted(); context.scope.assertAlive();
      const entry = await gpx.create(data, { signal });
      // Creation owns the entry after publication; subsequent cancellation does
      // not roll it back. Fit only a still-live committed entry, once per import.
      if (context.scope.alive && context.entries.get(entry.id)) {
        const bounds = gpx.getExtent(entry.id).bounds;
        if (bounds) context.map.fitBounds([[bounds.southWest.lat, bounds.southWest.lon], [bounds.northEast.lat, bounds.northEast.lon]], { padding: [20, 20] });
      }
      return Object.freeze({ entry, name: data.name });
    },
  });
} });
