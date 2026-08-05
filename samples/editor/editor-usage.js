function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

function fillResetCountdown(resetAtIso) {
  if (!resetAtIso) {
    setText("ratelimit-reset_hours", "-");
    setText("ratelimit-reset_mins", "-");
    return;
  }

  const resetAt = new Date(resetAtIso);
  if (Number.isNaN(resetAt.getTime())) {
    setText("ratelimit-reset_hours", "-");
    setText("ratelimit-reset_mins", "-");
    return;
  }

  const diffMs = Math.max(resetAt.getTime() - Date.now(), 0);
  const totalMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;

  setText("ratelimit-reset_hours", hours);
  setText("ratelimit-reset_mins", mins);
}

async function loadProviderUsage(phloemUrlBase) {
  const response = await fetch(`${phloemUrlBase}/provider_usage`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  const usage = data?.provider_usage;

  if (!usage) {
    setText("ratelimit-limit", "-");
    setText("ratelimit-used", "-");
    fillResetCountdown(null);
    return;
  }

  setText("ratelimit-captured_at", usage.captured_at ?? "-");
  setText("ratelimit-limit", usage.limit ?? "-");
  setText("ratelimit-used", usage.remaining ? usage.limit - usage.remaining : "-");
  fillResetCountdown(usage.reset_at);
}

export function setupEditorUsage(phloemUrlBase) {
  loadProviderUsage(phloemUrlBase).catch((err) => {
    console.error(err);
    setText("ratelimit-limit", "-");
    setText("ratelimit-used", "-");
    setText("ratelimit-reset_hours", "-");
    setText("ratelimit-reset_mins", "-");
  });
}
