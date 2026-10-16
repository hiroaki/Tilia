import { photoDomainKey } from "../../domains/keys.js";
import { assertPhotoTimeMode } from "../../core/photo-time-utils.js";

export default Object.freeze({
  id: "tilia-jpeg-input",
  requires: ["tilia-photo-domain"],
  setup(context, options = {}) {
    const defaultPhotoTimeMode = assertPhotoTimeMode(options.defaultPhotoTimeMode === undefined ? "auto" : options.defaultPhotoTimeMode);
    const photo = context.domains.require(photoDomainKey);
    context.inputs.register({
      id: "tilia-jpeg", priority: 0,
      discovery: { extensions: [".jpg", ".jpeg"], mimeTypes: ["image/jpeg"] },
      recognize(input) {
        return input instanceof Blob && (input.type === "image/jpeg" || /\.jpe?g$/i.test(input.name ?? ""));
      },
      async handle({ input, signal }) {
        signal.throwIfAborted();
        const { parsePhotoFile } = await import("../../photo/exif.js");
        signal.throwIfAborted();
        const parsed = await parsePhotoFile(input);
        signal.throwIfAborted();
        context.scope.assertAlive();
        const capturedAt = parsed.dateTimeOriginal == null ? null : new Date(parsed.dateTimeOriginal).getTime();
        const entry = await photo.create({
          data: { name: input.name ?? "photo", coordinate: parsed.hasGps ? { lat: parsed.lat, lon: parsed.lon } : null,
            capturedAt, make: parsed.make, model: parsed.model,
            source: { mediaType: input.type || "image/jpeg", size: input.size } },
          preferences: { requestedTimeMode: defaultPhotoTimeMode }, blob: input,
        }, { signal });
        // Publication commits the entry even if cancellation follows. Navigate
        // only while the import and plugin still own a live committed entry.
        let locationSource = null;
        if (!signal.aborted && context.scope.alive && context.entries.get(entry.id)) {
          const { data, derived } = photo.get(entry.id).snapshot;
          locationSource = derived.locationSource;
          const point = data.coordinate ?? derived.inferredLocation;
          if (point && !signal.aborted && context.scope.alive && context.entries.get(entry.id)) {
            context.map.fitBounds([[point.lat, point.lon], [point.lat, point.lon]], { padding: [20, 20] });
          }
        }
        return Object.freeze({ entry, name: parsed.name ?? "photo", locationSource });
      },
    });
  },
});
