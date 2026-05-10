import exifr from "exifr";

export async function parsePhotoFile(file) {
  const exif = await exifr.parse(file, {
    tiff: true,
    exif: true,
    gps: true,
  });

  if (!exif) {
    throw new Error(`No EXIF found: ${file.name}`);
  }

  const hasGps = Number.isFinite(exif.latitude) && Number.isFinite(exif.longitude);
  const dateTimeOriginal = exif.DateTimeOriginal || exif.CreateDate || null;
  if (!hasGps && !dateTimeOriginal) {
    throw new Error(`No GPS and no photo timestamp in EXIF: ${file.name}`);
  }

  return {
    type: "photo",
    file,
    name: file.name,
    hasGps,
    lat: hasGps ? exif.latitude : null,
    lon: hasGps ? exif.longitude : null,
    dateTimeOriginal,
    make: exif.Make || "",
    model: exif.Model || "",
    previewUrl: URL.createObjectURL(file),
  };
}
