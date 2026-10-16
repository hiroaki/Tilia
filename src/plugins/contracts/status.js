import { defineServiceKey } from "../../extensions/services.js";

export const statusServiceKey = defineServiceKey({
  id: "tilia-status",
  validate(value) { return !!value && typeof value.set === "function"; },
  createFacade({ implementation, assertAvailable }) {
    return {
      set(text) {
        assertAvailable();
        return implementation.set(String(text));
      },
    };
  },
});
