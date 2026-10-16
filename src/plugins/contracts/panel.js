import { defineServiceKey } from "../../extensions/services.js";
export const panelServiceKey = defineServiceKey({
  id: "tilia-panel",
  validate: (value) => ["open", "toggle", "close", "isOpen"].every((key) => typeof value?.[key] === "function"),
  createFacade({ implementation, assertAvailable }) {
    return Object.fromEntries(["open", "toggle", "close", "isOpen"].map((name) => [name, (...args) => {
      assertAvailable(); return implementation[name](...args);
    }]));
  },
});
