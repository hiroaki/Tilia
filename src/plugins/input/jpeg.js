import { photoDomainKey } from "../../domains/keys.js";

export default Object.freeze({
  id: "tilia-jpeg-input",
  requires: ["tilia-photo-domain"],
  setup(context) {
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
          preferences: { requestedTimeMode: "auto" }, blob: input,
        }, { signal });
        return Object.freeze({ entry, name: parsed.name ?? "photo", locationSource: !signal.aborted && context.scope.alive && context.entries.get(entry.id) ? photo.get(entry.id).snapshot.derived.locationSource : null });
      },
    });
  },
});
