export type Lang = "zh" | "en";

const LANG_KEY = "newliveweb:lang";

const dict: Record<Lang, Record<string, string>> = {
  zh: {
    "app.controls": "控制面板",
    "app.uiOpacity": "界面透明度",
    "app.collapse": "收起",
    "app.expand": "展开",
    "app.language.toggleTitle": "切换语言（将刷新页面）",
    "app.language.toEnglish": "EN",
    "app.language.toChinese": "中文",
    "inspector.reset": "重置",
    "inspector.recommended": "推荐",
    "inspector.expanded": "展开",
    "inspector.collapsed": "收起",
  },
  en: {
    "app.controls": "Controls",
    "app.uiOpacity": "UI Opacity",
    "app.collapse": "Collapse",
    "app.expand": "Expand",
    "app.language.toggleTitle": "Toggle language (reloads page)",
    "app.language.toEnglish": "EN",
    "app.language.toChinese": "中文",
    "inspector.reset": "reset",
    "inspector.recommended": "Recommended",
    "inspector.expanded": "Expanded",
    "inspector.collapsed": "Collapsed",
  },
};

export function getLang(): Lang {
  try {
    const raw = String(localStorage.getItem(LANG_KEY) ?? "").trim();
    if (raw === "en") return "en";
    return "zh";
  } catch {
    return "zh";
  }
}

export function setLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // ignore
  }
}

export function toggleLang(): Lang {
  const next: Lang = getLang() === "zh" ? "en" : "zh";
  setLang(next);
  return next;
}

export function t(key: string): string {
  const lang = getLang();
  return dict[lang]?.[key] ?? dict.zh[key] ?? key;
}

