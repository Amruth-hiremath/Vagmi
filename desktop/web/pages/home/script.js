const navButtons = Array.from(document.querySelectorAll("[data-nav]"));
const homeTitle = document.getElementById("home-title");
const homeUserLabel = document.getElementById("home-user-label");
const homeThemeLabel = document.getElementById("home-theme-label");
const homeClock = document.getElementById("home-clock");
const homeModelLabel = document.getElementById("home-model-label");

function navigate(page) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "navigate", page }, "*");
  } else {
    window.location.href = `../${page}/index.html`;
  }
}

function getStoredUser() {
  try {
    const raw = localStorage.getItem("vagmi_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getDisplayName() {
  const user = getStoredUser();
  return user?.display_name || user?.name || user?.full_name || user?.username || "Workspace user";
}

function getThemeLabel() {
  return (
    window.VagmiTheme?.getThemeLabel?.() ||
    window.VagmiTheme?.getTheme?.() ||
    "Dark"
  );
}

function syncClock() {
  if (!homeClock) return;
  const now = new Date();
  homeClock.textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function syncHomeCopy() {
  const displayName = getDisplayName();

  if (homeTitle) {
    homeTitle.textContent = `Welcome back, ${displayName}`;
  }

  if (homeUserLabel) {
    homeUserLabel.textContent = displayName;
  }

  if (homeThemeLabel) {
    homeThemeLabel.textContent = getThemeLabel();
  }

  if (homeModelLabel) {
    homeModelLabel.textContent = "Local LLM";
  }

  syncClock();
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.nav));
});

window.addEventListener("vagmi-theme-change", syncHomeCopy);
window.addEventListener("storage", (event) => {
  if (event.key === "vagmi_user" || event.key === "vagmi-theme") {
    syncHomeCopy();
  }
});

document.addEventListener("DOMContentLoaded", syncHomeCopy);
syncHomeCopy();
setInterval(syncClock, 30000);
