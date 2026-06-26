const navButtons = Array.from(document.querySelectorAll("[data-nav]"));
const themeButtons = Array.from(document.querySelectorAll("[data-theme-option]"));
const activeThemePill = document.getElementById("active-theme-pill");

const THEME_LABELS = {
  "enterprise-dark": "Dark",
  "claude-light": "Light",
  "midnight-slate": "Graphite"
};

function navigate(page) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "navigate", page }, "*");
  } else {
    window.location.href = `../${page}/index.html`;
  }
}

function getActiveTheme() {
  return window.VagmiTheme?.getTheme?.() || localStorage.getItem("vagmi-theme") || "enterprise-dark";
}

function syncThemeUI() {
  const active = getActiveTheme();

  themeButtons.forEach((button) => {
    const isActive = button.dataset.theme === active;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (activeThemePill) {
    activeThemePill.textContent = THEME_LABELS[active] || "Dark";
  }
}

themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const theme = button.dataset.theme || "enterprise-dark";
    if (window.VagmiTheme?.setTheme) {
      window.VagmiTheme.setTheme(theme);
    } else {
      localStorage.setItem("vagmi-theme", theme);
      document.documentElement.dataset.theme = theme;
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "theme-change", theme }, "*");
    }
    syncThemeUI();
  });
});

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.nav));
});

window.addEventListener("vagmi-theme-change", syncThemeUI);
document.addEventListener("DOMContentLoaded", syncThemeUI);
syncThemeUI();
