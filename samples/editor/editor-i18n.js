const DICTIONARY = {
  en: {
    page_title: "Tilia Editor",
    editor_title: "Editor Sample",
    editor_lead: "Route search, track editing, and export in one workflow.",
    workflow_label: "Workflow",
    workflow_r: "Create a track via route search",
    workflow_l: "Review the result in layers",
    workflow_t: "Edit the track geometry",
    workflow_g: "Export as GPX",
    usage_limits_title: "Usage Limits",
    usage_limits_lead: "Reference information for the route provider.",
    plan_limits_title: "Plan Limits",
    max_daily_credits: "Max Daily Credits",
    max_locations: "Max Locations",
    max_vehicles: "Max Vehicles",
    last_usage_title: "Last Recorded Usage",
    as_of: "As of",
    credits_used_today: "Credits Used Today",
    reset_in: "Reset In"
  },
  ja: {
    page_title: "Tilia Editor",
    editor_title: "Editor サンプル",
    editor_lead: "ルート検索、トラック編集、エクスポートを一つのワークフローで行えます。",
    workflow_label: "ワークフロー",
    workflow_r: "ルート検索でトラックを作成",
    workflow_l: "レイヤーで結果を確認",
    workflow_t: "トラックのジオメトリを編集",
    workflow_g: "GPXとしてエクスポート",
    usage_limits_title: "使用制限",
    usage_limits_lead: "ルートプロバイダーの参考情報",
    plan_limits_title: "プランの制限",
    max_daily_credits: "1日あたりの最大クレジット",
    max_locations: "最大ロケーション数",
    max_vehicles: "最大車両数",
    last_usage_title: "記録された最新値",
    as_of: "時点",
    credits_used_today: "本日使用したクレジット",
    reset_in: "リセットまで"
  }
};

function detectInitialLanguage() {
  const language = (navigator.language || "").toLowerCase();
  return language.startsWith("ja") ? "ja" : "en";
}

function applyLanguage(lang) {
  const selected = lang === "ja" ? "ja" : "en";
  const messages = DICTIONARY[selected];

  document.documentElement.lang = selected;
  document.title = messages.page_title;

  for (const node of document.querySelectorAll("[data-i18n]")) {
    const key = node.dataset.i18n;
    if (messages[key]) {
      node.textContent = messages[key];
    }
  }

  for (const button of document.querySelectorAll(".lang-switch-button")) {
    const active = button.dataset.lang === selected;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

export function setupEditorI18n() {
  applyLanguage(detectInitialLanguage());

  for (const button of document.querySelectorAll(".lang-switch-button")) {
    button.addEventListener("click", () => {
      applyLanguage(button.dataset.lang || "en");
    });
  }
}
