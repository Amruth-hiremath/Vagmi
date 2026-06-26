(() => {
  const STORAGE_KEY = "vagmi-theme";
  const DEFAULT_THEME = "enterprise-dark";

  const THEME_LABELS = {
    "enterprise-dark": "Dark",
    "claude-light": "Light",
    "midnight-slate": "Graphite"
  };

  const LOGO_MAP = {
    "enterprise-dark": {
      full: "logo_dark_full.png",
      mark: "logo_dark.png"
    },
    "claude-light": {
      full: "logo_light_full.png",
      mark: "logo_light.png"
    },
    "midnight-slate": {
      full: "logo_dark_full.png",
      mark: "logo_dark.png"
    }
  };

  const LOGO_BG_MAP = {
    "enterprise-dark": "#0f1117",
    "claude-light": "#fbf7f1",
    "midnight-slate": "#111827"
  };

  function normalizeTheme(theme) {
    return Object.prototype.hasOwnProperty.call(THEME_LABELS, theme)
      ? theme
      : DEFAULT_THEME;
  }

  function getTheme() {
    try {
      return normalizeTheme(localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME);
    } catch {
      return DEFAULT_THEME;
    }
  }

  function getBasePath() {
    const path = (window.location.pathname || "").replace(/\\/g, "/");
    return path.includes("/pages/") || path.includes("/core/") ? "../../" : "./";
  }

  function getLogoPath(kind, theme = getTheme()) {
    const base = getBasePath();
    const entry = LOGO_MAP[normalizeTheme(theme)] || LOGO_MAP[DEFAULT_THEME];
    const filename = entry[kind] || entry.mark;
    return `${base}assets/${filename}`;
  }

  function applyLogoSources(doc = document, theme = getTheme()) {
    doc.querySelectorAll("[data-theme-logo]").forEach((img) => {
      const kind = (img.getAttribute("data-theme-logo") || "mark").toLowerCase();
      img.src = getLogoPath(kind === "full" ? "full" : "mark", theme);
    });
  }

  function applyTheme(theme = getTheme(), doc = document) {
    const normalized = normalizeTheme(theme);
    const root = doc.documentElement;

    root.setAttribute("data-theme", normalized);
    if (doc.body) {
      doc.body.setAttribute("data-theme", normalized);
    }

    root.style.colorScheme = normalized === "claude-light" ? "light" : "dark";
    root.style.setProperty("--logo-shell-bg", LOGO_BG_MAP[normalized] || LOGO_BG_MAP[DEFAULT_THEME]);
    applyLogoSources(doc, normalized);
  }

  function setTheme(theme, { broadcast = true } = {}) {
    const normalized = normalizeTheme(theme);

    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // ignore storage failures in restricted environments
    }

    applyTheme(normalized);

    if (broadcast && window.parent && window.parent !== window) {
      try {
        window.parent.postMessage({ type: "theme-change", theme: normalized }, "*");
      } catch {
        // ignore cross-window issues
      }
    }

    window.dispatchEvent(
      new CustomEvent("vagmi-theme-change", {
        detail: { theme: normalized }
      })
    );

    return normalized;
  }

  function getThemeLabel(theme = getTheme()) {
    return THEME_LABELS[normalizeTheme(theme)] || THEME_LABELS[DEFAULT_THEME];
  }

  function initTheme() {
    applyTheme(getTheme());

    document.addEventListener("DOMContentLoaded", () => {
      applyTheme(getTheme());
    });

    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY) {
        applyTheme(event.newValue || DEFAULT_THEME);
      }
    });

    window.addEventListener("message", (event) => {
      const data = event.data || {};
      if (data.type === "theme-change") {
        setTheme(data.theme, { broadcast: false });
      }
    });
  }

  window.VagmiTheme = {
    key: STORAGE_KEY,
    defaultTheme: DEFAULT_THEME,
    getTheme,
    setTheme,
    applyTheme,
    applyLogoSources,
    getThemeLabel,
    getLogoPath,
    normalizeTheme
  };

  initTheme();
})();
