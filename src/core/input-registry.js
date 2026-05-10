export function createInputRegistry() {
  const handlers = [];

  return {
    register(matcher, handler) {
      handlers.push({ matcher, handler });
    },

    async dispatch(context, input) {
      for (const entry of handlers) {
        if (entry.matcher(input)) {
          return entry.handler(context, input);
        }
      }
      throw new Error(`Unsupported input: ${input?.name || "unknown"}`);
    },
  };
}
