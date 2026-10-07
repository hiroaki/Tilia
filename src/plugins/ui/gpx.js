import { gpxDomainKey } from "../../domains/keys.js";
import { mountGpxRow, mountGpxPopup } from "../../gpx/ui.js";
import { reportError } from "../../ui/scoped-dom.js";
export default Object.freeze({
  id: "tilia-gpx-ui", requires: ["tilia-gpx-domain"],
  setup(context) {
    const gpx = context.domains.require(gpxDomainKey);
    const report = (error) => reportError(context, error);
    context.styles.use({ id: "tilia-gpx", href: new URL("../../gpx/styles.css", import.meta.url).href });
    const mount = (build) => (input) => {
      // Host owns its container/mount; contributor owns subtree effects in a
      // shorter consumer child, paired to the host mount by a close obligation.
      const scope = context.scope.child({ label: "gpx-ui-mount" });
      const close = () => { void scope.dispose().catch(report); };
      input.scope.signal.addEventListener("abort", close, { once: true });
      input.scope.defer(() => scope.dispose(), { retry: "safe" });
      scope.defer(() => { input.scope.signal.removeEventListener("abort", close); input.container.replaceChildren(); }, { retry: "safe" });
      if (!input.scope.alive) { close(); return; }
      build({ ...input, scope, gpx, selection: input.selection ?? context.selection, report });
    };
    context.contributions.layers.register(gpxDomainKey, { mount: mount(mountGpxRow) });
    context.contributions.popup.register(gpxDomainKey, { mount: mount(mountGpxPopup) });
  },
});
