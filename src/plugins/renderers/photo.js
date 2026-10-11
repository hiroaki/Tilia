import { photoDomainKey } from "../../domains/keys.js";
import { createPhotoRenderer } from "../../photo/renderer.js";
export default Object.freeze({
  id: "tilia-photo-renderer", requires: ["tilia-photo-domain"],
  setup(context) {
    context.domains.require(photoDomainKey);
    context.renderers.register(photoDomainKey, createPhotoRenderer());
  },
});
