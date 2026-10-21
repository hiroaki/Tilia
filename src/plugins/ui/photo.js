import { photoDomainKey } from "../../domains/keys.js";
import { mountPhotoRow, mountPhotoPopup, mountPhotoSettings } from "../../photo/ui.js";
import { reportError } from "../../ui/scoped-dom.js";
export default Object.freeze({
  id: "tilia-photo-ui", requires: ["tilia-photo-domain"],
  setup(context) {
    const photo = context.domains.require(photoDomainKey);
    const report = (error) => reportError(context, error);
    context.styles.use({ id: "tilia-photo-ui", href: new URL("../../photo/styles.css", import.meta.url).href });
    const mount = (build) => (input) => {
      // Host owns its container/mount; contributor owns subtree effects in a
      // shorter consumer child, paired to the host mount by a close obligation.
      const scope = context.scope.child({ label: "photo-ui-mount" });
      const close = () => { void scope.dispose().catch(report); };
      input.scope.signal.addEventListener("abort", close, { once: true });
      input.scope.defer(() => scope.dispose(), { retry: "safe" });
      scope.defer(() => { input.scope.signal.removeEventListener("abort", close); input.container.replaceChildren(); }, { retry: "safe" });
      if (!input.scope.alive) { close(); return; }
      build({ ...input, scope, photo, entries: context.entries, map: context.map, selection: input.selection ?? context.selection, report });
    };
    context.contributions.layers.register(photoDomainKey, { mount: mount(mountPhotoRow) });
    context.contributions.popup.register(photoDomainKey, { mount: mount(mountPhotoPopup) });
    context.contributions.settings.register({ id: "photo-time-mode", descriptor: {
      supports: (entry) => entry.domain === photoDomainKey,
      mount: mount(mountPhotoSettings),
    } });
  },
});
