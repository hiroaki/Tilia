import { expect, test } from "@playwright/test";

test("viewer sample accepts a GPX file via the dropzone plugin", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto("/samples/viewer/");

  const becameActive = await page.evaluate(async () => {
    const target = document.querySelector("#map");
    if (!(target instanceof HTMLElement)) {
      throw new Error("Map container not found");
    }

    const response = await fetch("/tests/fixtures/sample-track.gpx");
    const blob = await response.blob();
    const file = new File([blob], "sample-track.gpx", { type: blob.type || "application/gpx+xml" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    target.dispatchEvent(new DragEvent("dragover", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));
    const activeAfterDragover = target.classList.contains("drop-active");

    target.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      dataTransfer,
    }));

    return activeAfterDragover;
  });

  expect(becameActive).toBe(true);
  await expect(page.locator("#map")).not.toHaveClass(/drop-active/);
  await expect(page.locator(".tilia-status-text")).toContainText("Loaded 1 file(s) from drop.");
  await expect(page.locator(".tilia-status-text")).toContainText("sample-track.gpx");

  expect(pageErrors).toEqual([]);
});