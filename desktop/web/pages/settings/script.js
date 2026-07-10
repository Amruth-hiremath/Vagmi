import { getUser, saveUser } from "../../services/auth.js";
import { uploadMyProfileImage, fetchMyProfileImageBlob } from "../../services/users.js";
import { bumpAvatarCache } from "../../services/avatar.js";

const navButtons = Array.from(document.querySelectorAll("[data-nav]"));
const themeButtons = Array.from(document.querySelectorAll("[data-theme-option]"));
const activeThemePill = document.getElementById("active-theme-pill");
const avatarImage = document.getElementById("profile-avatar-image");
const avatarFallback = document.getElementById("profile-avatar-fallback");
const avatarUploadBtn = document.getElementById("profile-avatar-upload-btn");
const avatarInput = document.getElementById("profile-avatar-input");
const currentUser = getUser();
let currentAvatarUrl = null;

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

async function loadProfileImage() {
  if (!avatarImage || !avatarFallback) return;

  const initials = (currentUser?.username || "U")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "U";

  avatarFallback.textContent = initials;
  avatarFallback.classList.remove("hidden");
  avatarImage.classList.add("hidden");

  try {
    const { blob } = await fetchMyProfileImageBlob();
    if (currentAvatarUrl) {
      URL.revokeObjectURL(currentAvatarUrl);
      currentAvatarUrl = null;
    }
    const objectUrl = URL.createObjectURL(blob);
    currentAvatarUrl = objectUrl;
    avatarImage.src = objectUrl;
    avatarImage.classList.remove("hidden");
    avatarFallback.classList.add("hidden");
  } catch {
    // No image yet; keep initials visible.
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

avatarUploadBtn?.addEventListener("click", () => avatarInput?.click());

avatarInput?.addEventListener("change", async () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  try {
    const updated = await uploadMyProfileImage(file);
    if (updated) {
      const previous = getUser() || {};
      saveUser({ ...previous, ...updated });
    }
    // Bust the cache so every other surface (sidebar, chat) reloads.
    bumpAvatarCache();
    await loadProfileImage();
    // Notify the parent shell in case the custom event can't cross the iframe.
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "avatar-updated" }, "*");
    }
  } catch (error) {
    alert(error?.message || "Failed to upload profile image.");
  } finally {
    avatarInput.value = "";
  }
});

window.addEventListener("vagmi-theme-change", syncThemeUI);
document.addEventListener("DOMContentLoaded", syncThemeUI);
syncThemeUI();
loadProfileImage();
