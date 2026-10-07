import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
test("viewer settings exposes per-entry Photo modes and owns side layout/focus", async ({ page }) => {
 const errors=[];page.on("pageerror",e=>errors.push(e.message));await page.goto("/samples/viewer/");
 await page.locator('input[type="file"]').setInputFiles(resolve(import.meta.dirname,"../../samples/embed/IMG_2892.JPG"));await expect(page.locator(".tilia-status-text")).toContainText("IMG_2892.JPG");
 await page.getByRole("button",{name:"Settings",exact:true}).click();await expect(page.getByRole("dialog",{name:"Settings",exact:true})).toBeVisible();
 const select=page.locator(".tilia-photo-time-mode-select");await expect(select).toHaveValue("auto");await select.selectOption("utc");await expect(select).toHaveValue("utc");
 expect(await select.locator("option").evaluateAll(nodes=>nodes.map(n=>n.value))).toEqual(["auto","local","utc"]);
 const panel=await page.locator(".tilia-side-panel").boundingBox(),control=await page.locator(".tilia-base-map-control").boundingBox();expect(control.x+control.width).toBeLessThanOrEqual(panel.x);
 await select.press("Escape");await expect(page.locator(".tilia-side-panel")).toBeHidden();await expect(page.getByRole("button",{name:"Settings",exact:true})).toBeFocused();expect(errors).toEqual([]);
});
