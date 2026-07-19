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
import { getDesktopBridge } from "./services/desktop.js";

import {
    startNotificationService,
    stopNotificationService,
    subscribeUnread
} from "./services/notifications.js";

const PAGE_MAP = {
  home: "/pages/home/index.html",
  intelligence: "/pages/intelligence/index.html",
  diagram: "/pages/diagram/index.html",
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
const workspaceMiniBtn = document.getElementById("workspace-mini-btn");
const miniDock = document.getElementById("mini-dock");
const miniDockTitle = document.getElementById("mini-dock-title");
const miniDockPage = document.getElementById("mini-dock-page");
const miniDockAlert = document.getElementById("mini-dock-alert");
const miniDockRestore = document.getElementById("mini-dock-restore");
const miniDockActions = Array.from(document.querySelectorAll("[data-mini-page]"));

const chatUnreadCacheKey = "vagmi-chat-unread-count";
const miniModeCacheKey = "vagmi-mini-mode";
const miniUnreadSharedKey = "vagmi-mini-unread";
let chatUnreadRefreshTimer = null;
let lastUnreadCount = Number(localStorage.getItem(chatUnreadCacheKey) || 0) || 0;

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
  updateMiniDockPage(page);
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

function pageLabelFor(page) {
  const labels = {
    home: "Home",
    intelligence: "Intelligence",
    diagram: "Diagram Studio",
    chat: "Chat",
    settings: "Settings",
    admin: "Admin"
  };

  return labels[page] || "Home";
}

function updateMiniDockPage(_page) {
  // No-op: the mini-dock now lives in its own OS window. The page label is
  // derived from localStorage by the floating window itself.
}

function updateMiniDockUnread(count, _changed = false) {
  // Push the latest unread count into localStorage so the floating
  // mini-dock window can pick it up via the `storage` event.
  const unreadCount = Number(count) || 0;
  try {
    localStorage.setItem(miniUnreadSharedKey, String(unreadCount));
  } catch {}
}

function clearMiniDockPulse() {
  // No-op: pulse state is owned by the floating mini-dock window now.
}

async function setMiniMode(enabled, { persist = true, skipBridge = false } = {}) {
  const next = Boolean(enabled);

  if (!skipBridge) {
    const bridge = getDesktopBridge();

    if (!bridge) {
      console.error(
        "[Vāgmi] No desktop bridge (window.pywebview.api) found. " +
        "The Minimize button only works inside the pywebview desktop app."
      );
      return;
    }

    // Detect missing Python-side methods (e.g. user is running an old
    // main.py). Without this check the call would be a silent no-op via
    // optional chaining, which is exactly the bug we're fixing.
    const methodName = next ? "enter_compact_mode" : "exit_compact_mode";
    if (typeof bridge[methodName] !== "function") {
      console.error(
        `[Vāgmi] bridge.${methodName} is not a function. ` +
        `The Python backend (main.py) is out of date — please restart with the updated main.py. ` +
        `Available bridge methods: ${Object.keys(bridge).join(", ")}`
      );
      return;
    }

    try {
      console.log(`[Vāgmi] calling bridge.${methodName}()...`);
      const result = await bridge[methodName]();
      console.log(`[Vāgmi] bridge.${methodName}() returned:`, result);
      if (result === false) {
        console.warn(`[Vāgmi] bridge.${methodName}() returned false — see Python console for details.`);
        return;
      }
    } catch (error) {
      console.error(`[Vāgmi] bridge.${methodName}() threw:`, error);
      return;
    }
  }

  // The mini-dock now lives in a separate OS window, so there is no in-DOM
  // dock to toggle. We only keep the persisted state so the next launch
  // can re-enter floating mode automatically, and reflect the button state.
  if (workspaceMiniBtn) {
    workspaceMiniBtn.setAttribute("aria-pressed", String(next));
    workspaceMiniBtn.title = next ? "Restore workspace" : "Minimize to floating dock";
  }

  if (persist) {
    localStorage.setItem(miniModeCacheKey, next ? "1" : "0");
  }

  if (!next) {
    clearMiniDockPulse();
  } else {
    updateMiniDockUnread(lastUnreadCount, false);
  }
}

async function toggleMiniMode() {
  // The decision is driven by the persisted flag rather than a body class,
  // because the floating dock now lives in a separate OS window.
  const isMini = localStorage.getItem(miniModeCacheKey) === "1";
  console.log("[Vāgmi] toggleMiniMode() — current mini mode:", isMini);
  await setMiniMode(!isMini);
}

// Debug helper — call `window.vagmiDebug()` from the devtools console to
// verify the bridge is reachable and which methods are exposed.
window.vagmiDebug = async function () {
  const bridge = getDesktopBridge();
  console.log("[Vāgmi] bridge object:", bridge);
  if (!bridge) {
    console.error("[Vāgmi] No bridge found. window.pywebview =", window.pywebview);
    return;
  }
  console.log("[Vāgmi] bridge keys:", Object.keys(bridge));
  try {
    const pong = await bridge.ping?.();
    console.log("[Vāgmi] bridge.ping() ->", pong);
  } catch (e) {
    console.error("[Vāgmi] bridge.ping() failed:", e);
  }
  try {
    const status = await bridge.bridge_status?.();
    console.log("[Vāgmi] bridge.bridge_status() ->", status);
  } catch (e) {
    console.error("[Vāgmi] bridge.bridge_status() failed:", e);
  }
  console.log(
    "[Vāgmi] enter_compact_mode type:",
    typeof bridge.enter_compact_mode,
    "| exit_compact_mode type:",
    typeof bridge.exit_compact_mode
  );
};

// Called from the Python bridge (see main.py -> restore_with_page) when the
// user clicks a quick-action button inside the floating mini-dock window.
// `page` is the target nav page (chat / intelligence / diagram / settings).
window.vagmiMiniRestore = function (page) {
  // Clear the persisted "mini-mode" flag because we are leaving floating mode.
  try { localStorage.setItem(miniModeCacheKey, "0"); } catch {}
  if (workspaceMiniBtn) {
    workspaceMiniBtn.setAttribute("aria-pressed", "false");
    workspaceMiniBtn.title = "Minimize to floating dock";
  }
  if (page) {
    setActivePage(page);
  }
};

// Persisted-state safety net: if the OS-level hide of the main window
// happened but the user then re-opened the main window via the taskbar
// (without going through the dock's restore button), make sure the
// button reflects the persisted flag so the next toggle does the right thing.
window.addEventListener("focus", () => {
  if (workspaceMiniBtn) {
    const isMini = localStorage.getItem(miniModeCacheKey) === "1";
    workspaceMiniBtn.setAttribute("aria-pressed", String(isMini));
  }
});

async function refreshChatNotificationDot({ useCacheFallback = true } = {}) {
  try {
    const response = await apiRequest("/notifications/chat-unread", { skipAuthRedirect: true });
    const payload = await response.json();
    const unreadCount = Number(payload?.count) || 0;

    setChatNotificationDot(unreadCount);
    lastUnreadCount = unreadCount;
    updateMiniDockUnread(unreadCount, false);
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

  if (workspaceMiniBtn) {
    workspaceMiniBtn.addEventListener("click", () => {
      toggleMiniMode();
    });
  }

  // The mini-dock's restore and action buttons used to live in this DOM.
  // They now live inside the floating OS window (see /web/mini-dock.html),
  // so there is nothing to wire here. The `miniDockRestore` and
  // `miniDockActions` references are kept harmless (null / empty) when the
  // elements are absent from the new index.html.

  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;
    const tag = String(event.target?.tagName || "").toLowerCase();
    const isTypingTarget = event.target?.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
    if (isTypingTarget) return;

    if (event.ctrlKey && event.shiftKey && String(event.key || "").toLowerCase() === "m") {
      event.preventDefault();
      toggleMiniMode();
    }
  });

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

  const savedMiniMode = localStorage.getItem(miniModeCacheKey) === "1";
  if (savedMiniMode) {
    window.setTimeout(() => setMiniMode(true, { persist: false }), 0);
  } else {
    updateMiniDockPage(localStorage.getItem(activePageKey) || "home");
    updateMiniDockUnread(lastUnreadCount, false);
  }

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
      const unreadCount = Number(count) || 0;
      const changed = unreadCount > lastUnreadCount;
      setChatNotificationDot(unreadCount);
      updateMiniDockUnread(unreadCount, changed);
      lastUnreadCount = unreadCount;
  });
}

document.addEventListener("DOMContentLoaded", bootstrap);
