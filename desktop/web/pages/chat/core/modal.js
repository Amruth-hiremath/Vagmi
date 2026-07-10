// desktop/web/pages/chat/core/modal.js
import { openImageViewer, closeImageViewer } from "./attachment.js";
import { escapeHTML } from "./utils.js";
let newChatSearchTimer = null;
let imgViewerZoom = 1;

export function openNewChatModal() {
  const state = window.chatState;
  const newChatModal = document.getElementById("new-chat-modal");
  const newChatSearch = document.getElementById("new-chat-search");

  if (!newChatModal) return;
  state.newChatOpen = true;
  newChatModal.classList.remove("hidden");
  if (newChatSearch) newChatSearch.value = "";
  renderNewChatState("Search registered users to start a new chat.");
  setTimeout(() => newChatSearch?.focus(), 0);
  window.searchRegisteredUsers?.("");
}

export function closeNewChatModal() {
  const state = window.chatState;
  const newChatModal = document.getElementById("new-chat-modal");
  const newChatSearch = document.getElementById("new-chat-search");

  if (!newChatModal) return;
  state.newChatOpen = false;
  if (newChatSearchTimer) {
    clearTimeout(newChatSearchTimer);
    newChatSearchTimer = null;
  }
  if (window.newChatSearchTimer) {
    clearTimeout(window.newChatSearchTimer);
    window.newChatSearchTimer = null;
  }
  newChatModal.classList.add("hidden");
  if (newChatSearch) newChatSearch.value = "";
  renderNewChatState("Search registered users to start a new chat.");
}

export function renderNewChatState(message) {
  const newChatResults = document.getElementById("new-chat-results");
  if (!newChatResults) return;
  newChatResults.innerHTML = `<div class="new-chat-empty">${escapeHTML(message)}</div>`;
}

export function renderNewChatResults(users) {
  const newChatResults = document.getElementById("new-chat-results");
  if (!newChatResults) return;
  const list = Array.isArray(users) ? users : [];
  if (list.length === 0) {
    renderNewChatState("No matching users found.");
    return;
  }

  newChatResults.innerHTML = list.map((user) => {
    const username = user.username || "User";
    const initials = username
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "U";

    return `
      <button type="button" class="new-chat-result" data-username="${escapeHTML(username)}" data-user-id="${Number(user.id) || ""}">
        <div class="avatar avatar-has-image" data-avatar-user-id="${Number(user.id) || ""}">${escapeHTML(initials)}</div>
        <div>
          <div class="result-name">${escapeHTML(username)}</div>
          <div class="result-meta">Direct message</div>
        </div>
        <div class="result-action">Start</div>
      </button>
    `;
  }).join("");

  // Decorate avatars with profile images where available.
  const loadAvatarObjectUrl = window.loadAvatarObjectUrl;
  if (typeof loadAvatarObjectUrl === "function") {
    newChatResults.querySelectorAll("[data-avatar-user-id]").forEach(async (el) => {
      const id = Number(el.dataset.avatarUserId);
      if (!Number.isFinite(id)) return;
      const url = await loadAvatarObjectUrl(id);
      if (!url) return;
      el.innerHTML = `<img class="avatar-img" src="${url}" alt="" />`;
    });
  }
}

export function setupImageViewerEvents() {
  document.getElementById("img-viewer-close")?.addEventListener("click", closeImageViewer);

  document.getElementById("image-viewer-modal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeImageViewer(); // click backdrop to close
  });

  document.getElementById("img-zoom-in")?.addEventListener("click", () => {
    imgViewerZoom = Math.min(imgViewerZoom + 0.25, 4);
    document.getElementById("img-viewer-el").style.transform = `scale(${imgViewerZoom})`;
  });

  document.getElementById("img-zoom-out")?.addEventListener("click", () => {
    imgViewerZoom = Math.max(imgViewerZoom - 0.25, 0.25);
    document.getElementById("img-viewer-el").style.transform = `scale(${imgViewerZoom})`;
  });

  document.getElementById("img-download")?.addEventListener("click", async () => {

    const imgEl = document.getElementById("img-viewer-el");
    const url = imgEl?.getAttribute("src");
    if (!url) return;

    const filename = imgEl.getAttribute("alt") || "image";
    const saveLoadedUrl = window.saveLoadedUrl;
    if (typeof saveLoadedUrl === "function") {
      await saveLoadedUrl(url, filename);
    }

  });

  // Escape key closes viewer
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeImageViewer();
  });
}


