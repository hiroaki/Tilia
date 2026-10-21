import { LatLngBounds } from "leaflet";
import { statusServiceKey } from "../contracts/status.js";

const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function parse(value) {
  if (value === null) return null;
  const parts = value.split(",").map((part) => part.trim());
  const locate = parts[0] === "locate";
  if (locate ? parts.length > 2 : parts.length < 2 || parts.length > 3) return null;
  const values = parts.slice(locate ? 1 : 0);
  if (values.some((part) => !number.test(part) || !Number.isFinite(Number(part)))) return null;
  return locate
    ? { locate, zoom: values.length ? Number(values[0]) : undefined }
    : { locate, lat: Number(values[0]), lng: Number(values[1]), zoom: values.length === 3 ? Number(values[2]) : undefined };
}

function validZoom(map, zoom) {
  return Number.isFinite(zoom) && zoom >= map.getMinZoom() && zoom <= map.getMaxZoom();
}

function validPoint(map, lat, lng) {
  const latitudeLimit = Math.min(90, map.options.crs?.projection?.MAX_LATITUDE ?? 90);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > latitudeLimit || Math.abs(lng) > 180) return false;
  const bounds = map.options.maxBounds;
  return !bounds || new LatLngBounds(bounds).contains([lat, lng]);
}

export default Object.freeze({
  id: "tilia-initial-view",
  setup(context) {
    const request = parse(new URLSearchParams(globalThis.window?.location?.search ?? "").get("tilia.c"));
    if (!request) return;
    context.lifecycle.afterCommit(() => {
      const map = context.map.advancedLeafletMap();
      if (request.zoom !== undefined && !validZoom(map, request.zoom)) return;
      const apply = (lat, lng) => {
        const zoom = request.zoom ?? map.getZoom();
        if (!validPoint(map, lat, lng) || !validZoom(map, zoom)) return false;
        context.map.setView([lat, lng], zoom, { animate: false });
        return true;
      };
      if (!request.locate) { apply(request.lat, request.lng); return; }

      const report = (text) => {
        try { context.services.optional(statusServiceKey)?.set(text); }
        catch (error) { context.diagnostics.report(error); }
      };
      let pending = true;
      const handles = [];
      const container = map.getContainer();
      const events = ["pointerdown", "mousedown", "touchstart", "wheel", "keydown"];
      const detach = () => {
        for (const handle of handles) handle.dispose();
        for (const event of events) container.removeEventListener(event, cancel, true);
      };
      const finish = (text) => { pending = false; detach(); report(text); };
      const active = () => {
        if (!pending || !context.scope.alive || context.scope.signal.aborted) return false;
        try { context.scope.assertAlive(); return true; } catch { return false; }
      };
      // Conservatively yield to every subsequent map move, including GPX auto-fit.
      const cancel = () => { if (active()) finish("Applying current location was canceled."); };
      context.scope.defer(() => { pending = false; detach(); }, { label: "initial-view-geolocation", retry: "safe" });
      for (const event of ["movestart", "zoomstart", "dragstart"]) handles.push(context.map.listen(event, cancel));
      for (const event of events) container.addEventListener(event, cancel, true);
      report("Obtaining current location…");
      const failure = () => { if (active()) finish("Could not obtain current location."); };
      try {
        const geolocation = globalThis.navigator?.geolocation;
        if (!geolocation) { failure(); return; }
        geolocation.getCurrentPosition((position) => {
          if (!active()) return;
          // Detach before setView: our own move must not cancel this operation.
          pending = false; detach();
          try {
            report(apply(position?.coords?.latitude, position?.coords?.longitude)
              ? "Current location obtained." : "Could not obtain current location.");
          } catch { report("Could not obtain current location."); }
        }, failure, { timeout: 15000 });
      } catch { failure(); }
    });
  },
});
