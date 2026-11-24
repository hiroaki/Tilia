import { expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/index.js";
import { createOwnedPanelOpener } from "../src/ui/panel-mount.js";

it("releases normally closed handles and preserves cleanup retry for a failed mount", async () => {
  const host = createScopeController(), owner = createScopeController();
  await host.commit();
  await owner.commit();
  const panel = { open(spec) {
    const scope = host.scope.child();
    spec.mount({ scope });
    return { dispose: vi.fn(() => scope.dispose()) };
  } };
  const report = vi.fn();
  const open = createOwnedPanelOpener(owner.scope, panel, report);

  const closed = [];
  for (let i = 0; i < 50; i++) {
    const handle = open({ mount() {} });
    await handle.dispose();
    closed.push(handle);
  }
  expect(host.snapshot().counts.children).toBe(0);

  let fails = true;
  const cleanup = vi.fn(() => { if (fails) throw new Error("held"); });
  open({ mount({ scope }) { scope.defer(cleanup, { retry: "safe" }); } });
  await expect(owner.close()).rejects.toMatchObject({ code: "SCOPE_DISPOSAL_FAILED" });
  expect(host.snapshot().counts.children).toBe(1);
  expect(cleanup).toHaveBeenCalledTimes(1);
  fails = false;
  await owner.retryCleanup();
  expect(cleanup).toHaveBeenCalledTimes(2);
  expect(host.snapshot().counts.children).toBe(0);
  for (const handle of closed) expect(handle.dispose).toHaveBeenCalledTimes(1);
  await host.close();
});
