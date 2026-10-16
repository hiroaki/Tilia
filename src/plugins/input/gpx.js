import { gpxDomainKey } from "../../domains/keys.js";
export default Object.freeze({ id: "tilia-gpx-input", requires: ["tilia-gpx-domain"], setup(context) {
  const gpx = context.domains.require(gpxDomainKey);
  context.inputs.register({ id: "tilia-gpx", priority: 0,
    discovery: { extensions: [".gpx"], mimeTypes: ["application/gpx+xml"] },
    recognize(input) { return input instanceof Blob && (input.type === "application/gpx+xml" || /\.gpx$/i.test(input.name ?? "")); },
    async handle({ input, signal, scope }) {
      signal.throwIfAborted();
      const { parseGpxFile } = await import("../../gpx/parse.js");
      signal.throwIfAborted();
      const readScope = scope.child({ label: "gpx-read" });
      let data, readError, failed = false;
      try { data = await parseGpxFile(input, { signal, scope: readScope }); }
      catch (error) { failed = true; readError = error; }
      try { await readScope.dispose(); }
      catch (error) {
        if (failed) throw new AggregateError([readError, error], "GPX read and cleanup failed", { cause: error });
        throw error;
      }
      if (failed) throw readError;
      signal.throwIfAborted(); context.scope.assertAlive();
      const entry = await gpx.create(data, { signal });
      // Creation owns the entry after publication; subsequent cancellation does
      // not roll it back. Fit only a still-live committed entry, once per import.
      if (!signal.aborted && context.scope.alive && context.entries.get(entry.id)) {
        const bounds = gpx.getExtent(entry.id).bounds;
        if (bounds && !signal.aborted && context.scope.alive && context.entries.get(entry.id)) context.map.fitBounds([[bounds.southWest.lat, bounds.southWest.lon], [bounds.northEast.lat, bounds.northEast.lon]], { padding: [20, 20] });
      }
      return Object.freeze({ entry, name: data.name });
    },
  });
} });
