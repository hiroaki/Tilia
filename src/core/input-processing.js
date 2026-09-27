export async function processInputItems({
  items,
  registry,
  context,
  onStatus,
  onError,
  sourceLabel = "input",
  onItemLoaded,
}) {
  const queue = Array.from(items || []);
  if (queue.length === 0) {
    return;
  }

  try {
    let loadedCount = 0;
    let failedCount = 0;
    let lastResult = null;
    const failedDetails = [];

    for (const item of queue) {
      try {
        const result = await registry.dispatch(context, item);
        lastResult = result;
        loadedCount += 1;
        if (onItemLoaded) {
          onItemLoaded(result);
        }
      } catch (error) {
        failedCount += 1;
        failedDetails.push(`${item.name}: ${error.message}`);
        onError(error);
      }
    }

    if (loadedCount > 0 && lastResult) {
      const detailText = lastResult.summary ? ` (${lastResult.summary})` : "";
      const baseText = `Loaded ${loadedCount} file(s) from ${sourceLabel}. Total layers: ${context.state.layers.length}. Last: ${lastResult.name}${detailText}`;
      if (failedCount > 0) {
        onStatus(`${baseText}. Failed: ${failedCount}. ${failedDetails[0]}`);
      } else {
        onStatus(baseText);
      }
    } else {
      onStatus(`Failed: ${failedCount} file(s). ${failedDetails[0] || "Unknown error"}`);
    }
  } catch (error) {
    onError(error);
    onStatus(`Failed: ${error.message}`);
  }
}
