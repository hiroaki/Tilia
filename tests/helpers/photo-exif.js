import { readFileSync } from "node:fs";

// File names remain distinct to exercise GPS and timestamp-only metadata paths.
// The same tiny valid image supplies browser previews; its EXIF is ignored here.
const buffer = readFileSync(new URL("../fixtures/photo-exif.jpg", import.meta.url));
export const gpsPhoto = { name: "IMG_2889.JPG", mimeType: "image/jpeg", buffer };
export const timestampPhoto = { name: "IMG_2892.JPG", mimeType: "image/jpeg", buffer };

export async function mockPhotoExif(page) {
  // Intercept only the external dependency. Tilia's lazy loader, transformation,
  // validation, domain publication, inference, UI and resource ownership stay real.
  await page.route("https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.js", route => route.fulfill({
    contentType: "text/javascript",
    body: `export default { async parse(file, options) {
      if (!options.tiff || !options.exif || !options.gps) throw new Error("Missing EXIF parse options");
      const gps = file.name === "IMG_2889.JPG";
      return {
        Make: "Apple", Model: "iPhone 5",
        DateTimeOriginal: new Date(2013, 10, 24, 15, gps ? 17 : 22, gps ? 17 : 39),
        ...(gps ? { latitude: 34.99678055555556, longitude: 135.81951944444444 } : {}),
      };
    } };`,
  }));
}
