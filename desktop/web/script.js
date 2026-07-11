// desktop/web/script.js
import {
  isAuthenticated,
  getUser,
  saveUser,
  getAuthPageUrl,
  clearSession
} from "./services/auth.js";

import { apiRequest } from "./services/api.js";
import {
  initialsFor,
  loadMyAvatarObjectUrl
} from "./services/avatar.js";

import {
    startNotificationService,
    stopNotificationService,
    subscribeUnread
} from "./services/notifications.js";

const PAGE_MAP = {
  home: "/pages/home/index.html",
  intelligence: "/pages/intelligence/index.html",
  chat: "/pages/chat/index.html",
  settings: "/pages/settings/index.html",
  admin: "/pages/admin/index.html"
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
const sidebarAvatarImage = document.getElementById("sidebar-user-avatar-image");
const sidebarAvatarInitials = document.getElementById("sidebar-user-initials");
const chatNavDot = document.getElementById("chat-nav-dot");

const chatUnreadCacheKey = "vagmi-chat-unread-count";
let chatUnreadRefreshTimer = null;

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle("sidebar-collapsed", collapsed);
  localStorage.setItem(sidebarStateKey, collapsed ? "1" : "0");
}

function setActivePage(page) {
  if (!PAGE_MAP[page]) page = DEFAULT_PAGE;

  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });

  pageFrame.src = PAGE_MAP[page];
  localStorage.setItem(activePageKey, page);
}

function setChatNotificationDot(count) {
  const unreadCount = Number(count) || 0;

  if (chatNavDot) {
    chatNavDot.classList.toggle("hidden", unreadCount <= 0);
    chatNavDot.title = unreadCount > 0 ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}` : "Chat";
    chatNavDot.setAttribute("aria-label", unreadCount > 0 ? `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}` : "No unread chat messages");
  }

  localStorage.setItem(chatUnreadCacheKey, String(Math.max(0, unreadCount)));
}

async function refreshChatNotificationDot({ useCacheFallback = true } = {}) {
  try {
    const response = await apiRequest("/notifications/chat-unread", { skipAuthRedirect: true });
    const payload = await response.json();
    const unreadCount = Number(payload?.count) || 0;

    setChatNotificationDot(unreadCount);
    return unreadCount;
  } catch (error) {
    if (!useCacheFallback) {
      throw error;
    }

    const cached = Number(localStorage.getItem(chatUnreadCacheKey) || 0) || 0;
    setChatNotificationDot(cached);
    return cached;
  }
}

function updateUserBadge(user) {
  if (!user) return;

  if (userDisplay) {
    userDisplay.textContent = user.username || "User";
  }

  if (sidebarAvatarInitials) {
    sidebarAvatarInitials.textContent = initialsFor(user.username || "U");
  }

  // Load the profile image, falling back to initials when absent.
  loadMyAvatarObjectUrl().then((url) => {
    if (!url || !sidebarAvatarImage) return;
    sidebarAvatarImage.src = url;
    sidebarAvatarImage.classList.remove("hidden");
    if (sidebarAvatarInitials) sidebarAvatarInitials.classList.add("hidden");
  });
}

async function refreshSidebarAvatar() {
  if (!sidebarAvatarImage) return;
  const url = await loadMyAvatarObjectUrl();
  if (url) {
    sidebarAvatarImage.src = url;
    sidebarAvatarImage.classList.remove("hidden");
    if (sidebarAvatarInitials) sidebarAvatarInitials.classList.add("hidden");
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

  // Refresh the sidebar avatar when a profile image upload happens in a
  // nested page (e.g. settings). The page bumps the shared cache token.
  window.addEventListener("vagmi-avatar-updated", refreshSidebarAvatar);
  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.type === "avatar-updated") {
      refreshSidebarAvatar();
    }

    if (data.type === "chat-unread-count") {
      setChatNotificationDot(data.count);
    }
  });
}


async function bootstrap() {
  const me = await validateSession();
  if (!me) return;

  const savedCollapsed = localStorage.getItem(sidebarStateKey) === "1";

  setSidebarCollapsed(savedCollapsed);
  wireNavigation();
  updateUserBadge(me);

  const adminNavItem = document.getElementById("admin-nav-item");
  if (adminNavItem) {
    if (me?.is_admin || me?.role === "owner" || me?.role === "admin") {
      adminNavItem.classList.remove("hidden");
    } else {
      adminNavItem.classList.add("hidden");
    }
  }

  const savedPage = localStorage.getItem(activePageKey);
  const isAdminUser = me?.role === "owner" || me?.role === "admin" || me?.is_admin;
  const pageToLoad = (savedPage === "admin" && !isAdminUser)
    ? DEFAULT_PAGE
    : (PAGE_MAP[savedPage] ? savedPage : DEFAULT_PAGE);

  setActivePage(pageToLoad);

  setChatNotificationDot(Number(localStorage.getItem(chatUnreadCacheKey) || 0) || 0);
  await refreshChatNotificationDot({ useCacheFallback: true });

  if (chatUnreadRefreshTimer) {
    clearInterval(chatUnreadRefreshTimer);
  }
  chatUnreadRefreshTimer = window.setInterval(() => {
    refreshChatNotificationDot({ useCacheFallback: true }).catch(() => {});
  }, 30000);

  window.addEventListener("focus", () => {
    refreshChatNotificationDot({ useCacheFallback: true }).catch(() => {});
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshChatNotificationDot({ useCacheFallback: true }).catch(() => {});
    }
  });

  window.addEventListener("beforeunload", () => {
    if (chatUnreadRefreshTimer) {
      clearInterval(chatUnreadRefreshTimer);
      chatUnreadRefreshTimer = null;
    }
    stopNotificationService();
  });

  requestAnimationFrame(() => {
    document.body.style.willChange = "transform";
    document.body.style.transform = "translateZ(0)";

    requestAnimationFrame(() => {
      document.body.style.transform = "";
      document.body.style.willChange = "auto";
    });
  });
  startNotificationService();

  subscribeUnread((count) => {
      setChatNotificationDot(count);
  });
}

document.addEventListener("DOMContentLoaded", bootstrap);
