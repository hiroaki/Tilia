import { photoDomainKey } from "../../domains/index.js";
import { createPhotoProvider } from "./photo-provider.js";

export default Object.freeze({
  id: "tilia-photo-domain",
  setup(context, options) {
    context.domains.provide(photoDomainKey, createPhotoProvider(options));
  },
});
