import { describe, expect, it, vi } from "vitest";

import {
  OwnershipCleanupError,
  OwnershipError,
  createScopeController,
} from "../src/ownership/index.js";

function fakeRegistration(publications, id, overrides = {}) {
  return {
    label: id,
    preflight: vi.fn(overrides.preflight),
    commit: vi.fn(() => {
      publications.push(id);
      overrides.commit?.();
    }),
    dispose: vi.fn(({ committed }) => {
      if (committed) {
        const index = publications.indexOf(id);
        if (index >= 0) {
          publications.splice(index, 1);
        }
      }
      return overrides.dispose?.({ committed });
    }),
    retry: overrides.retry,
  };
}

describe("staged ownership records", () => {
  it("preflights every record before synchronous publication", async () => {
    const controller = createScopeController();
    const publications = [];
    const events = [];
    controller.stage({
      ...fakeRegistration(publications, "first"),
      preflight: () => events.push("preflight-1"),
      commit: () => events.push("commit-1"),
    });
    controller.stage({
      ...fakeRegistration(publications, "second"),
      preflight: () => events.push("preflight-2"),
      commit: () => events.push("commit-2"),
    });

    const committing = controller.commit();
    expect(events).toEqual(["preflight-1", "preflight-2", "commit-1", "commit-2"]);
    await committing;
  });

  it("discards uncommitted staged records on abort", async () => {
    const controller = createScopeController();
    const definition = fakeRegistration([], "item");
    controller.stage(definition);

    await controller.abort();

    expect(definition.commit).not.toHaveBeenCalled();
    expect(definition.dispose).toHaveBeenCalledWith({ committed: false });
  });

  it("disposes committed staged records on close", async () => {
    const controller = createScopeController();
    const publications = [];
    const definition = fakeRegistration(publications, "item");
    controller.stage(definition);

    await controller.commit();
    expect(publications).toEqual(["item"]);
    await controller.close();

    expect(publications).toEqual([]);
    expect(definition.dispose).toHaveBeenCalledWith({ committed: true });
  });

  it("publishes nothing when any preflight fails and rolls back every staged record", async () => {
    const controller = createScopeController();
    const publications = [];
    const first = fakeRegistration(publications, "first");
    const second = fakeRegistration(publications, "second", {
      preflight: () => {
        throw new Error("conflict");
      },
    });
    controller.stage(first);
    controller.stage(second);

    await expect(controller.commit()).rejects.toBeInstanceOf(OwnershipError);

    expect(publications).toEqual([]);
    expect(first.commit).not.toHaveBeenCalled();
    expect(second.commit).not.toHaveBeenCalled();
    expect(first.dispose).toHaveBeenCalledWith({ committed: false });
    expect(second.dispose).toHaveBeenCalledWith({ committed: false });
    expect(controller.snapshot().state).toBe("closed");
  });

  it("defensively reverses partial publication after an unexpected commit failure", async () => {
    const controller = createScopeController();
    const publications = [];
    const first = fakeRegistration(publications, "first");
    const second = fakeRegistration(publications, "second", {
      commit: () => {
        throw new Error("unexpected");
      },
    });
    controller.stage(first);
    controller.stage(second);

    await expect(controller.commit()).rejects.toBeInstanceOf(OwnershipError);

    expect(publications).toEqual([]);
    expect(first.dispose).toHaveBeenCalledWith({ committed: true });
    expect(second.dispose).toHaveBeenCalledWith({ committed: true });
    expect(controller.snapshot().state).toBe("closed");
  });

  it("reports incomplete defensive rollback with complete residual diagnostics", async () => {
    const controller = createScopeController();
    const publications = [];
    controller.stage(fakeRegistration(publications, "first", {
      dispose: () => {
        throw new Error("unregister failed");
      },
    }));
    controller.stage(fakeRegistration(publications, "second", {
      commit: () => {
        throw new Error("commit failed");
      },
    }));

    await expect(controller.commit()).rejects.toBeInstanceOf(OwnershipCleanupError);
    expect(controller.snapshot()).toMatchObject({
      state: "cleanup-failed",
      residuals: [{ label: "first", phase: "staged-dispose" }],
    });
  });

  it("supports early staged disposal and rejects invalid definitions", async () => {
    const controller = createScopeController();
    const publications = [];
    const definition = fakeRegistration(publications, "item");
    const handle = controller.stage(definition);
    await handle.dispose();
    await handle.dispose();
    await controller.commit();
    await controller.close();

    expect(definition.dispose).toHaveBeenCalledTimes(1);
    expect(definition.commit).not.toHaveBeenCalled();
    expect(() => controller.stage({})).toThrowError(expect.objectContaining({
      code: "SCOPE_NOT_ACTIVE",
    }));
  });

  it("rejects asynchronous preflight and commit contracts", async () => {
    const preflightController = createScopeController();
    preflightController.stage({
      preflight: async () => {},
      commit: () => {},
      dispose: () => {},
    });
    await expect(preflightController.commit()).rejects.toMatchObject({
      code: "OWNERSHIP_STAGE_INVALID",
    });
    expect(preflightController.snapshot().state).toBe("closed");

    const commitController = createScopeController();
    commitController.stage({
      preflight: () => {},
      commit: async () => {},
      dispose: () => {},
    });
    await expect(commitController.commit()).rejects.toMatchObject({
      code: "OWNERSHIP_STAGE_INVALID",
    });
    expect(commitController.snapshot().state).toBe("closed");
  });

  it.each(["preflight", "commit"])(
    "rejects recursive commit during staged %s and rolls back",
    async (phase) => {
      const controller = createScopeController();
      const publications = [];
      let recursiveError;
      controller.stage({
        ...fakeRegistration(publications, "item"),
        [phase]: () => {
          if (phase === "commit") {
            publications.push("item");
          }
          try {
            controller.commit();
          } catch (error) {
            recursiveError = error;
          }
        },
      });

      await expect(controller.commit()).rejects.toMatchObject({
        code: "SCOPE_COMMIT_INVALID",
      });

      expect(recursiveError).toMatchObject({ code: "SCOPE_COMMIT_INVALID" });
      expect(publications).toEqual([]);
      expect(controller.snapshot().state).toBe("closed");
    },
  );

  it.each([
    ["preflight", "close"],
    ["preflight", "abort"],
    ["commit", "close"],
    ["commit", "abort"],
  ])("rejects authority loss from %s callback via %s", async (phase, closeMethod) => {
    const controller = createScopeController();
    const publications = [];
    const disposal = [];
    const stage = (id, callback) => controller.stage({
      label: id,
      preflight: phase === "preflight" && callback ? callback : () => {},
      commit: () => {
        publications.push(id);
        if (phase === "commit" && callback) {
          callback();
        }
      },
      dispose: ({ committed }) => {
        disposal.push(`${id}:${committed}`);
        const index = publications.indexOf(id);
        if (index >= 0) {
          publications.splice(index, 1);
        }
      },
    });
    stage("first");
    stage("trigger", () => {
      controller[closeMethod]().catch(() => {});
    });
    stage("later");

    await expect(controller.commit()).rejects.toMatchObject({
      code: "SCOPE_COMMIT_INVALID",
    });

    expect(publications).toEqual([]);
    if (phase === "preflight") {
      expect(disposal).toEqual(["later:false", "trigger:false", "first:false"]);
    } else {
      expect(disposal).toEqual(["later:false", "trigger:true", "first:true"]);
    }
    expect(controller.snapshot().state).toBe("closed");
  });

  it("integrates rollback failure after commit authority loss into residual diagnostics", async () => {
    const controller = createScopeController();
    controller.stage({
      label: "published",
      preflight: () => {},
      commit: () => {},
      dispose: () => {
        throw new Error("rollback failed");
      },
    });
    controller.stage({
      label: "trigger",
      preflight: () => {},
      commit: () => {
        controller.close().catch(() => {});
      },
      dispose: () => {},
    });

    await expect(controller.commit()).rejects.toBeInstanceOf(OwnershipCleanupError);
    expect(controller.snapshot()).toMatchObject({
      state: "cleanup-failed",
      residuals: [{
        label: "published",
        phase: "staged-dispose",
        cause: { message: "rollback failed" },
      }],
    });
  });

  it.each(["preflight", "commit"])(
    "locks controller ownership mutations throughout staged %s",
    async (phase) => {
      for (const mutation of ["stage", "setSetupCleanup"]) {
        const controller = createScopeController();
        const publications = [];
        const disposal = [];
        let innerError;
        const callback = () => {
          try {
            if (mutation === "stage") {
              controller.stage(fakeRegistration(publications, "late"));
            } else {
              controller.setSetupCleanup(() => {});
            }
          } catch (error) {
            innerError = error;
          }
        };
        const stage = (id, callbackForRecord) => controller.stage({
          label: id,
          preflight: phase === "preflight" && callbackForRecord ? callbackForRecord : () => {},
          commit: () => {
            publications.push(id);
            if (phase === "commit" && callbackForRecord) {
              callbackForRecord();
            }
          },
          dispose: ({ committed }) => {
            disposal.push(`${id}:${committed}`);
            publications.splice(publications.indexOf(id), publications.includes(id) ? 1 : 0);
          },
        });
        stage("first");
        stage("trigger", callback);
        stage("later");

        await expect(controller.commit()).rejects.toMatchObject({
          code: "SCOPE_COMMIT_INVALID",
        });

        expect(innerError).toMatchObject({ code: "SCOPE_COMMIT_INVALID" });
        expect(publications).toEqual([]);
        expect(disposal).toEqual(phase === "preflight"
          ? ["later:false", "trigger:false", "first:false"]
          : ["later:false", "trigger:true", "first:true"]);
        expect(controller.snapshot()).toMatchObject({
          state: "closed",
          counts: { staged: 0, disposing: 0 },
        });
      }
    },
  );

  it.each(["preflight", "commit"])(
    "locks root and descendant Scope mutations throughout staged %s",
    async (phase) => {
      const mutationCases = [
        ["root-child", ({ scope }) => scope.child()],
        ["root-defer", ({ scope, cleanup }) => scope.defer(cleanup)],
        ["root-track", ({ scope, cancel }) => scope.track(new Promise(() => {}), { cancel })],
        ["child-child", ({ child }) => child.child()],
        ["child-defer", ({ child, cleanup }) => child.defer(cleanup)],
        ["child-track", ({ child, cancel }) => child.track(new Promise(() => {}), { cancel })],
        ["child-dispose", ({ child }) => child.dispose()],
      ];

      for (const [, mutate] of mutationCases) {
        const controller = createScopeController();
        const child = controller.scope.child({ label: "existing" });
        const cleanup = vi.fn();
        const cancel = vi.fn();
        let innerError;
        const callback = () => {
          try {
            mutate({ scope: controller.scope, child, cleanup, cancel });
          } catch (error) {
            innerError = error;
          }
        };
        controller.stage({
          label: "trigger",
          preflight: phase === "preflight" ? callback : () => {},
          commit: phase === "commit" ? callback : () => {},
          dispose: () => {},
        });
        const laterCommit = vi.fn();
        controller.stage({
          label: "later",
          preflight: () => {},
          commit: laterCommit,
          dispose: () => {},
        });

        await expect(controller.commit()).rejects.toMatchObject({
          code: "SCOPE_COMMIT_INVALID",
        });

        expect(innerError).toMatchObject({ code: "SCOPE_COMMIT_INVALID" });
        expect(laterCommit).not.toHaveBeenCalled();
        expect(cleanup).not.toHaveBeenCalled();
        expect(cancel).not.toHaveBeenCalled();
        expect(controller.snapshot()).toMatchObject({
          state: "closed",
          counts: {
            children: 1,
            tasks: 0,
            staged: 0,
            disposing: 0,
          },
        });
      }
    },
  );

  it.each(["preflight", "commit"])(
    "prevents staged and disposable handles from transitioning during %s",
    async (phase) => {
      for (const recordKind of ["staged", "disposable"]) {
        const controller = createScopeController();
        const ownedCleanup = vi.fn();
        const handle = recordKind === "staged"
          ? controller.stage({
            label: "owned-staged",
            preflight: () => {},
            commit: () => {},
            dispose: ownedCleanup,
          })
          : controller.scope.defer(ownedCleanup, { label: "owned-disposable" });
        let innerError;
        const callback = () => {
          try {
            handle.dispose();
          } catch (error) {
            innerError = error;
          }
        };
        controller.stage({
          label: "trigger",
          preflight: phase === "preflight" ? callback : () => {},
          commit: phase === "commit" ? callback : () => {},
          dispose: () => {},
        });
        const laterCommit = vi.fn();
        controller.stage({
          label: "later",
          preflight: () => {},
          commit: laterCommit,
          dispose: () => {},
        });

        await expect(controller.commit()).rejects.toMatchObject({
          code: "SCOPE_COMMIT_INVALID",
        });

        expect(innerError).toMatchObject({ code: "SCOPE_COMMIT_INVALID" });
        expect(laterCommit).not.toHaveBeenCalled();
        expect(ownedCleanup).toHaveBeenCalledOnce();
        expect(handle.state).toBe("disposed");
        expect(controller.snapshot()).toMatchObject({
          state: "closed",
          counts: { staged: 0, disposing: 0 },
        });
      }
    },
  );

  it("leaves no incomplete transaction record after successful commit", async () => {
    const controller = createScopeController();
    const first = fakeRegistration([], "first");
    const second = fakeRegistration([], "second");
    const firstHandle = controller.stage(first);
    const secondHandle = controller.stage(second);

    await controller.commit();

    expect(first.preflight).toHaveBeenCalledOnce();
    expect(second.preflight).toHaveBeenCalledOnce();
    expect(first.commit).toHaveBeenCalledOnce();
    expect(second.commit).toHaveBeenCalledOnce();
    expect(firstHandle.state).toBe("active");
    expect(secondHandle.state).toBe("active");
    expect(controller.snapshot()).toMatchObject({
      state: "active",
      counts: { staged: 0, disposing: 0 },
    });

    await controller.close();
  });

  it("preserves residual diagnostics when a locked mutation triggers failing rollback", async () => {
    const controller = createScopeController();
    controller.stage({
      label: "broken",
      preflight: () => {},
      commit: () => {},
      dispose: () => {
        throw new Error("locked rollback failed");
      },
    });
    controller.stage({
      label: "trigger",
      preflight: () => {},
      commit: () => {
        try {
          controller.scope.defer(() => {});
        } catch {
          // The outer operation must remain poisoned even if this is caught.
        }
      },
      dispose: () => {},
    });

    await expect(controller.commit()).rejects.toBeInstanceOf(OwnershipCleanupError);
    expect(controller.snapshot()).toMatchObject({
      state: "cleanup-failed",
      counts: { staged: 0, disposing: 0 },
      residuals: [{
        label: "broken",
        cause: { message: "locked rollback failed" },
      }],
    });
  });
});
