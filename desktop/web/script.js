import {
  isAuthenticated,
  getUser,
  saveUser,
  getAuthPageUrl,
  clearSession
} from "./services/auth.js";

import { apiRequest } from "./services/api.js";

const PAGE_MAP = {
  home: "./pages/home/index.html",
  intelligence: "./pages/intelligence/index.html",
  chat: "./pages/chat/index.html",
  settings: "./pages/settings/index.html"
};

const DEFAULT_PAGE = "home";
const sidebarStateKey = "vagmi-sidebar-collapsed";
const activePageKey = "vagmi-active-shell-page";

const pageFrame = document.getElementById("page-frame");
const navItems = Array.from(document.querySelectorAll(".nav-item"));
const sidebarToggle = document.getElementById("sidebar-toggle");
const userDisplay = document.getElementById("username-display");
const logoutBtn = document.getElementById("logout-btn");
const userAvatar = document.querySelector(".user-avatar");

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  localStorage.setItem(sidebarStateKey, collapsed ? "1" : "0");
}

function setActivePage(page) {
  if (!PAGE_MAP[page]) page = DEFAULT_PAGE;

  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });

  const targetUrl = new URL(PAGE_MAP[page], window.location.href).href;
  if (pageFrame.src !== targetUrl) {
    pageFrame.src = targetUrl;
  }

  localStorage.setItem(activePageKey, page);
}

function updateUserBadge(user) {
  if (!user) return;

  if (userDisplay) {
    userDisplay.textContent = user.username || "User";
  }

  if (userAvatar) {
    const initials = (user.username || "U")
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "U";
    userAvatar.textContent = initials;
  }
}

async function validateSession() {
  if (!isAuthenticated()) {
    window.location.replace(getAuthPageUrl());
    return null;
  }

  try {
    const response = await apiRequest("/auth/me");
    const me = await response.json();
    saveUser(me);
    return me;
  } catch (error) {
    if (
      String(error?.message || "")
        .includes("Unable to reach the backend")
    ) {

      console.warn(
        "Backend offline"
      );

      return null;

    }

    clearSession();
    window.location.replace(getAuthPageUrl());
    return null;
  }
}

function wireNavigation() {
  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.page) {
        setActivePage(btn.dataset.page);
      }
    });
  });

  if (sidebarToggle) {
    sidebarToggle.addEventListener("click", () => {
      const isCollapsed = document.body.classList.contains("sidebar-collapsed");
      setSidebarCollapsed(!isCollapsed);
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      clearSession();
      window.location.replace(getAuthPageUrl());
    });
  }

  window.addEventListener("message", (event) => {
    const data = event.data || {};

    if (data.type === "navigate" && data.page) {
      setActivePage(data.page);
    }

    if (data.type === "set-sidebar-collapsed") {
      setSidebarCollapsed(Boolean(data.collapsed));
    }

    if (data.type === "logout") {
      clearSession();
      window.location.replace(getAuthPageUrl());
    }
  });
}

async function bootstrap() {
  try {
    const me = await validateSession();
    if (!me) {
      if (!isAuthenticated()) {
        window.location.replace(getAuthPageUrl());
      }
      return;
    }

    const savedCollapsed =
      localStorage.getItem(
        sidebarStateKey
      ) === "1";

    setSidebarCollapsed(savedCollapsed);
    wireNavigation();
    updateUserBadge(getUser() || me);

    const savedPage = localStorage.getItem(activePageKey);

    setActivePage(
      PAGE_MAP[savedPage]
        ? savedPage
        : DEFAULT_PAGE
    );

    // Reveal app only after everything is ready
    document.body.classList.remove("booting");
  }

  catch (error) {
    console.error(error);
  }
}

document.addEventListener("DOMContentLoaded", bootstrap);