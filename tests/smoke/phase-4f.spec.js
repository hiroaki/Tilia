import { expect, test } from "@playwright/test";
test("Phase 4F normal composition contains stale display, failure, retry and lifetime races on real Leaflet", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/samples/phase-4f/");
  await expect(page.locator("body")).toHaveAttribute(
    "data-phase4f-ready",
    "true",
  );
  const result = await page.evaluate(async () => {
    const f = window.phase4f,
      { app, map } = f;
    const settle = async () => {
      for (let i = 0; i < 35; i++) await Promise.resolve();
    };
    const e = await app.domains.gpx.create({
      tracks: [{ segments: [{ points: [{ lat: 35, lon: 135 }] }] }],
      routes: [],
      waypoints: [],
    });
    await settle();
    const headless = app.rendering.getStatus(e.id).state;
    await app.use(f.renderer);
    await settle();
    const old = f.layers[0],
      handle = f.presentation(e.id);
    old.fire("click");
    await settle();
    const selected = app.selection.getCurrent();
    f.defer();
    await app.domains.gpx.setStylePreset(e.id, "next", { expectedRevision: 1 });
    await settle();
    const reconciled = app.selection.getCurrent();
    const preparing = {
      status: app.rendering.getStatus(e.id),
      displayed: map.hasLayer(old),
      oldHandle: handle.isCurrent(),
      presentation: f.presentation(e.id),
    };
    await f.inputs[0].selection.select(f.target).then(
      () => {
        throw Error("stale selection accepted");
      },
      () => {},
    );
    f.waits[0].reject(Error("injected current failure"));
    await settle();
    const failed = {
      status: app.rendering.getStatus(e.id),
      oldDisplayed: map.hasLayer(old),
      partialDisplayed: map.hasLayer(f.layers[1]),
      revision: app.domains.gpx.get(e.id).revision,
      selection:
        app.selection.getCurrent() === reconciled &&
        reconciled?.entryId === selected?.entryId &&
        reconciled?.ref.revision === 2,
      visible: app.entries.get(e.id).visible,
    };
    app.rendering.retry(e.id);
    await settle();
    const recovered = app.rendering.getStatus(e.id);
    await app.entries.setVisible(e.id, false);
    const hidden = !map.hasLayer(f.layers[2]) && f.presentation(e.id) === null;
    await app.entries.setVisible(e.id, true);
    const shown = map.hasLayer(f.layers[2]);
    f.defer();
    app.rendering.retry(e.id);
    await settle();
    const stale = f.waits[1];
    await app.unuse(f.renderer.id);
    const withdrawn = app.rendering.getStatus(e.id).state;
    await app.use(f.renderer);
    await settle();
    const reinstalled = app.rendering.getStatus(e.id);
    stale.resolve();
    await settle();
    const unchanged =
      app.rendering.getStatus(e.id).currentToken === reinstalled.currentToken;
    await app.entries.remove(e.id);
    const deleted = !f.layers.some((layer) => map.hasLayer(layer));
    const other = await app.domains.gpx.create({
      tracks: [],
      routes: [],
      waypoints: [],
    });
    await settle();
    const aliveHandle = f.presentation(other.id);
    await f.composition.foundations.rendering.close();
    let terminal;
    try {
      app.rendering.getStatus(other.id);
    } catch (error) {
      terminal = error.code;
    }
    return {
      headless,
      preparing,
      failed,
      recovered,
      hidden,
      shown,
      withdrawn,
      reinstalled,
      unchanged,
      deleted,
      terminal,
      handleDead: !aliveHandle.isCurrent(),
      semanticAlive: !!app.entries.get(other.id),
      paths: document.querySelectorAll(
        ".leaflet-overlay-pane path, [data-tilia-map-band] path",
      ).length,
    };
  });
  expect(result.headless).toBe("unavailable");
  expect(result.preparing).toMatchObject({
    displayed: true,
    oldHandle: false,
    presentation: null,
    status: { state: "building", currentToken: null, fallbackRevision: 1 },
  });
  expect(result.failed).toMatchObject({
    oldDisplayed: false,
    partialDisplayed: false,
    revision: 2,
    selection: true,
    visible: true,
    status: { state: "failed" },
  });
  expect(result.recovered).toMatchObject({
    state: "active",
    currentRevision: 2,
  });
  expect(result.hidden).toBe(true);
  expect(result.shown).toBe(true);
  expect(result.withdrawn).toBe("unavailable");
  expect(result.reinstalled.state).toBe("active");
  expect(result.unchanged).toBe(true);
  expect(result.deleted).toBe(true);
  expect(result.terminal).toBe("RENDERING_TERMINATED");
  expect(result.handleDead).toBe(true);
  expect(result.semanticAlive).toBe(true);
  expect(result.paths).toBe(0);
  expect(errors).toEqual([]);
});

test("Phase 4F reentrant highlight retry and private pane reacquisition work on installed Leaflet", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/samples/phase-4f/");
  await expect(page.locator("body")).toHaveAttribute(
    "data-phase4f-ready",
    "true",
  );
  const result = await page.evaluate(async () => {
    const { CircleMarker } = await import("leaflet");
    const { gpxDomainKey } = await import("/src/domains/keys.js");
    const { app, map, composition, target } = window.phase4f;
    const primary = [],
      leases = [];
    let context,
      fail = false,
      triggered = false,
      retryToken;
    const settle = async () => {
      for (let i = 0; i < 60; i++) await Promise.resolve();
    };
    const highlight = new CircleMarker([35, 135], { radius: 14 });
    const originalRemove = highlight.remove;
    highlight.remove = function (...args) {
      if (!triggered) {
        triggered = true;
        retryToken = app.rendering.retry(entry.id).pendingToken;
      }
      return originalRemove.apply(this, args);
    };
    const plugin = {
      id: "review-regression-renderer",
      setup(ctx) {
        context = ctx;
        ctx.renderers.register(gpxDomainKey, {
          build(input) {
            const lease = input.map.createPane({
              name: "dots",
              band: "markers",
            });
            leases.push(lease);
            const marker = new CircleMarker([35, 135], { radius: 8 });
            primary.push(marker);
            input.resources.own(marker, () => {});
            input.map.attachLayer(marker, { pane: lease });
            const surface = input.interactions.createSurface({
              id: "point",
              target: marker,
            });
            input.interactions.bind({
              id: "select",
              surface,
              event: "click",
              resolve: () => target,
            });
            input.resources.stageEffect({
              label: "injected-preflight",
              preflight() {
                if (fail) throw Error("preflight");
              },
              mount() {},
              withdraw() {},
              dispose() {},
            });
            return {
              presentation: {
                anchor: () => ({ lat: 35, lng: 135 }),
                highlight(ref, ctx) {
                  ctx.map.attachLayer(highlight);
                },
              },
            };
          },
        });
      },
    };
    await app.use(plugin);
    const entry = await app.domains.gpx.create({
      tracks: [{ segments: [{ points: [{ lat: 35, lon: 135 }] }] }],
      routes: [],
      waypoints: [],
    });
    await settle();
    const oldHandle = context.presentation.resolve(entry.id, target);
    await oldHandle.highlight({ scope: context.scope });
    app.rendering.retry(entry.id);
    await settle();
    const validHandle = context.presentation.resolve(entry.id, target);
    primary[1].fire("click");
    await settle();
    const cancelledIgnored = app.selection.getCurrent() === null;
    primary[2].fire("click");
    await settle();
    const switchResult = {
      token: app.rendering.getStatus(entry.id).currentToken,
      retryToken,
      attached: primary.map((layer) => map.hasLayer(layer)),
      status: app.rendering.getStatus(entry.id).state,
      oldHandle: oldHandle.isCurrent(),
      newHandle: validHandle.isCurrent() && validHandle.token === retryToken,
      highlight: map.hasLayer(highlight),
      selected: app.selection.getCurrent()?.entryId === entry.id,
      cancelledIgnored,
      pending: app.rendering.getStatus(entry.id).pendingToken,
      paneAttached: map.getPane(leases[2].name).isConnected,
      pathAttached: primary[2].getElement().isConnected,
      overlappingPane: leases[0].name === leases[2].name,
    };
    const paneName = leases[2].name,
      oldPane = map.getPane(paneName);
    await app.unuse(plugin.id);
    const finalRelease =
      !oldPane.isConnected && map.getPane(paneName) === oldPane;
    await app.use(plugin);
    await settle();
    const newPane = map.getPane(leases.at(-1).name);
    const reinstall =
      newPane.isConnected &&
      newPane !== oldPane &&
      map.hasLayer(primary.at(-1)) &&
      primary.at(-1).getElement().isConnected;
    // New headless entry's first build fails and must later reacquire its exact pane name.
    fail = true;
    const second = await app.domains.gpx.create({
      tracks: [{ segments: [{ points: [{ lat: 35, lon: 135 }] }] }],
      routes: [],
      waypoints: [],
    });
    await settle();
    const failedName = leases.at(-1).name,
      failedPane = map.getPane(failedName);
    const failed =
      app.rendering.getStatus(second.id).state === "failed" &&
      !failedPane.isConnected;
    fail = false;
    app.rendering.retry(second.id);
    await settle();
    const retryPane = map.getPane(failedName);
    const recovered =
      retryPane === failedPane &&
      retryPane.isConnected &&
      map.hasLayer(primary.at(-1)) &&
      app.rendering.getStatus(second.id).state === "active" &&
      primary.at(-1).getElement().isConnected;
    // Deliberately replace one released pane with caller-owned state; adapter must preserve it.
    await app.entries.remove(second.id);
    const leaseScope = context.scope.child();
    const probe = composition.foundations.rendering.panes.acquire(
      "caller-test",
      { name: "probe", band: "markers" },
      leaseScope,
    );
    const probePane = map.getPane(probe.name);
    const probeMarker = new CircleMarker([35, 135], { pane: probe.name }).addTo(
      map,
    );
    probeMarker.remove();
    await probe.dispose();
    const reacquired = composition.foundations.rendering.panes.acquire(
      "caller-test",
      { name: "probe", band: "markers" },
      leaseScope,
    );
    const reacquiredMarker = new CircleMarker([35, 135], {
      pane: reacquired.name,
    }).addTo(map);
    const cachedRendererAttached =
      map.getPane(reacquired.name) === probePane &&
      reacquiredMarker.getElement().isConnected;
    reacquiredMarker.remove();
    await reacquired.dispose();
    const callerPane = map.createPane(probe.name);
    let rejected = false;
    try {
      composition.foundations.rendering.panes.acquire(
        "caller-test",
        { name: "probe", band: "markers" },
        leaseScope,
      );
    } catch {
      rejected = true;
    }
    await leaseScope.dispose();
    const callerPreserved =
      rejected &&
      callerPane.isConnected &&
      map.getPane(probe.name) === callerPane;
    await app.entries.remove(entry.id);
    const allRemoved =
      primary.every((layer) => !map.hasLayer(layer)) &&
      !map.hasLayer(highlight) &&
      !newPane.isConnected &&
      !retryPane.isConnected;
    return {
      switchResult,
      finalRelease,
      reinstall,
      failed,
      recovered,
      callerPreserved,
      cachedRendererAttached,
      allRemoved,
    };
  });
  expect(result.switchResult).toMatchObject({
    token: "3",
    retryToken: "3",
    attached: [false, false, true],
    status: "active",
    oldHandle: false,
    newHandle: true,
    highlight: false,
    selected: true,
    cancelledIgnored: true,
    pending: null,
    paneAttached: true,
    pathAttached: true,
    overlappingPane: true,
  });
  for (const property of [
    "finalRelease",
    "reinstall",
    "failed",
    "recovered",
    "callerPreserved",
    "cachedRendererAttached",
    "allRemoved",
  ])
    expect(result[property], property).toBe(true);
  expect(errors).toEqual([]);
});
