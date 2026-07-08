// desktop/web/pages/chat/core/ui.js

import { escapeHTML, formatDate, formatTime } from "./utils.js";
import { iconMap } from "./icons.js";
import { initialsFor } from "../../../services/avatar.js";

/**
 * Asynchronously decorate any `[data-avatar-user-id]` element that still shows
 * initials with the user's profile image when one exists.
 */
export function decorateAvatars(root = document) {
  const loadAvatarObjectUrl = window.loadAvatarObjectUrl;
  if (typeof loadAvatarObjectUrl !== "function") return;
  const nodes = root.querySelectorAll("[data-avatar-user-id]:not(.avatar-decorated)");
  nodes.forEach((el) => {
    el.classList.add("avatar-decorated");
    const id = Number(el.dataset.avatarUserId);
    if (!Number.isFinite(id)) return;
    loadAvatarObjectUrl(id).then((url) => {
      if (!url) return;
      el.classList.add("avatar-has-image");
      el.innerHTML = `<img class="avatar-img" src="${url}" alt="" />`;
    });
  });
}

export function clearConversationCanvas(messagesScroll, dayChip) {
  if (messagesScroll) messagesScroll.innerHTML = "";
  if (dayChip) dayChip.hidden = true;
}

export function showConversationEmptyState(state) {
  const hasThreads = state.threads.length > 0;
  const conversationPane = document.getElementById("conversation-pane");
  const conversationEmptyState = document.getElementById("conversation-empty-state");
  const conversationContent = document.getElementById("conversation-content");
  const conversationEmptyTitle = document.getElementById("conversation-empty-title");
  const conversationEmptyCopy = document.getElementById("conversation-empty-copy");
  const conversationSearchRow = document.getElementById("conversation-search-row");
  const menuPopover = document.getElementById("menu-popover");
  const infoDrawer = document.getElementById("info-drawer");
  const conversationSearch = document.getElementById("conversation-search");

  state.menuOpen = false;
  state.infoOpen = false;
  if (conversationSearchRow) conversationSearchRow.classList.add("hidden");
  if (menuPopover) menuPopover.classList.add("hidden");
  if (infoDrawer) infoDrawer.classList.add("hidden");
  state.convoSearch = "";
  if (conversationSearch) conversationSearch.value = "";

  if (conversationPane) conversationPane.classList.add("is-empty");
  if (conversationEmptyState) conversationEmptyState.hidden = false;
  if (conversationContent) conversationContent.hidden = true;
  clearConversationCanvas(
    document.getElementById("messages-scroll"),
    document.getElementById("day-chip")
  );

  if (conversationEmptyTitle) conversationEmptyTitle.textContent = hasThreads ? "No chat selected" : "No conversations yet";
  if (conversationEmptyCopy) conversationEmptyCopy.textContent = hasThreads
    ? "Choose a conversation from the left or start a new one."
    : "Your conversations will appear here once they are created.";
}

export function openConversationView() {
  const conversationPane = document.getElementById("conversation-pane");
  const conversationEmptyState = document.getElementById("conversation-empty-state");
  const conversationContent = document.getElementById("conversation-content");

  if (conversationPane) conversationPane.classList.remove("is-empty");
  if (conversationEmptyState) conversationEmptyState.hidden = true;
  if (conversationContent) conversationContent.hidden = false;
  clearConversationCanvas(
    document.getElementById("messages-scroll"),
    document.getElementById("day-chip")
  );
}

export function renderThreadEmptyState(threadList, title, copy, actionLabel = "New chat", actionKind = "new-chat") {
  if (!threadList) return;
  threadList.innerHTML = `
    <div class="thread-empty-state">
      <div class="thread-empty-card">
        <div class="thread-empty-kicker mono">Chat</div>
        <div class="thread-empty-title">${escapeHTML(title)}</div>
        <div class="thread-empty-copy">${escapeHTML(copy)}</div>
        <button type="button" class="thread-empty-btn" id="thread-empty-action">${escapeHTML(actionLabel)}</button>
      </div>
    </div>
  `;

  const actionBtn = document.getElementById("thread-empty-action");
  actionBtn?.addEventListener("click", () => {
    if (actionKind === "clear-search") {
      const state = window.chatState;
      state.chatSearch = "";
      const chatSearch = document.getElementById("chat-search");
      if (chatSearch) chatSearch.value = "";
      renderThreads(state);
      return;
    }

    const launcher = window.openLauncherModal || window.openNewChatModal;
    if (typeof launcher === "function") {
      launcher();
    }
  });
}

export function previewText(thread) {
  if (thread.lastMessageType === "IMAGE") return thread.lastMessage || "Image";
  if (thread.lastMessageType === "FILE") return thread.lastMessage || "File";
  return thread.lastMessage || "No messages yet";
}

export function iconForPreview(type) {
  if (type === "IMAGE") return "imageSmall";
  if (type === "FILE") return "file";
  return null;
}

export function renderThreads(state) {
  const threadList = document.getElementById("thread-list");
  const filterTerm = state.chatSearch.trim().toLowerCase();

  const filteredThreads = state.threads.filter((thread) => {
    const filterKind = state.threadFilter === "group" ? "room" : state.threadFilter;
    const matchesKind = state.threadFilter === "all" || thread.kind === filterKind;
    const haystack = [
      thread.title || "",
      thread.lastMessage || "",
      thread.status || "",
      thread.kind || ""
    ].join(" ").toLowerCase();
    return matchesKind && haystack.includes(filterTerm);
  });

  if (state.threads.length === 0) {
    renderThreadEmptyState(
      threadList,
      "No conversations yet",
      "Your conversations will appear here after they are created.",
      "New chat",
      "new-chat"
    );
    return;
  }

  if (filteredThreads.length === 0) {
    renderThreadEmptyState(
      threadList,
      "No matching conversations",
      "Try a different search term or switch the filter.",
      "Clear search",
      "clear-search"
    );
    return;
  }

  threadList.innerHTML = "";

  filteredThreads.forEach((thread) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "thread-item" + (thread.key === state.activeThreadKey ? " active" : "");
    item.dataset.threadKey = thread.key || `${thread.type}:${thread.id}`;
    const avatarAttrs = thread.kind === "dm" && thread.peerId
      ? `data-avatar-user-id="${Number(thread.peerId)}"`
      : "";
    item.innerHTML = `
      <div class="avatar" ${avatarAttrs}>${escapeHTML(thread.initials)}</div>
      <div class="thread-meta">
        <div class="thread-title-row">
          <div class="thread-title">${escapeHTML(thread.title)}</div>
          <div class="thread-time mono">${escapeHTML(thread.lastMessageTime || "")}</div>
        </div>
        <div class="thread-preview-row">
          <div class="thread-preview">
            ${iconForPreview(thread.lastMessageType) ? `<span class="preview-icon">${iconMap[iconForPreview(thread.lastMessageType)]}</span>` : ""}
            <span>${escapeHTML(previewText(thread))}</span>
          </div>
          ${thread.unread ? `<span class="badge mono">${thread.unread}</span>` : ""}
        </div>
      </div>
    `;
    if (threadList) threadList.appendChild(item);
  });

  decorateAvatars(threadList);
}

export function updateConversationMeta(thread) {
  if (!thread) return;
  const conversationTitle = document.getElementById("conversation-title");
  const conversationStatus = document.getElementById("conversation-status");
  const conversationAvatar = document.getElementById("conversation-avatar");
  const roomAdminToggle = document.getElementById("room-admin-toggle");

  if (conversationTitle) conversationTitle.textContent = thread.title || "Conversation";
  if (conversationStatus) {
    if (thread.kind === "room") {

      conversationStatus.textContent =
        `Room · ${thread.members?.length || 1} members`;

    } else {

      if (thread.is_online) {

        conversationStatus.textContent = "🟢 Online";

      } else if (thread.last_seen) {

        const lastSeen = new Date(thread.last_seen);
        const dateLabel = formatDate(thread.last_seen);
        const timeLabel = formatTime(thread.last_seen);

        if (dateLabel === "Today") {
          conversationStatus.textContent = `Last seen today at ${timeLabel}`;
        } else if (dateLabel === "Yesterday") {
          conversationStatus.textContent = `Last seen yesterday at ${timeLabel}`;
        } else {
          conversationStatus.textContent = `Last seen ${dateLabel} at ${timeLabel}`;
        }

      } else {

        conversationStatus.textContent = "Offline";

      }

    }
  }

  // Reset avatar then show initials; swap to pfp for DMs where available.
  if (conversationAvatar) {
    conversationAvatar.textContent = thread.initials || "VA";
    conversationAvatar.removeAttribute("data-avatar-user-id");
    conversationAvatar.classList.remove("avatar-has-image", "avatar-decorated");
    if (thread.kind === "dm" && thread.peerId) {
      conversationAvatar.setAttribute("data-avatar-user-id", String(thread.peerId));
      decorateAvatars();
    }
  }

  // Show room admin toggle only for room creators
  const currentUser = window.currentUser || null;
  const canManage = thread.kind === "room" && currentUser && Number(thread.createdBy) === Number(currentUser.id);
  if (roomAdminToggle) {
    roomAdminToggle.classList.toggle("hidden", !canManage);
  }

  const infoParticipants = document.getElementById("info-participants");
  const infoType = document.getElementById("info-type");
  const infoFiles = document.getElementById("info-files");
  if (infoParticipants) infoParticipants.textContent = String(thread.members?.length || 1);
  if (infoType) infoType.textContent = thread.kind === "room" ? "Room" : "DM";
  if (infoFiles) infoFiles.textContent = String(
    (thread.messages || []).filter((msg) => msg.type === "FILE" || msg.type === "IMAGE").length
  );
}

export function updateInfoDrawer(thread) {
  if (!thread) return;
  const roomAdminSection = document.getElementById("room-admin-section");
  const currentUser = window.currentUser || null;

  const infoParticipants = document.getElementById("info-participants");
  const infoType = document.getElementById("info-type");
  const infoFiles = document.getElementById("info-files");
  
  if (infoParticipants) infoParticipants.textContent = String(thread.members?.length || 1);
  if (infoType) infoType.textContent = thread.kind === "room" ? "Room" : "DM";
  if (infoFiles) infoFiles.textContent = String(
    (thread.messages || []).filter((msg) => msg.type === "FILE" || msg.type === "IMAGE").length
  );

  // Show the room admin section for all room participants; admin controls are
  // gated inside renderRoomAdminPanel based on creator status.
  const isRoom = thread.kind === "room";
  roomAdminSection?.classList.toggle("hidden", !isRoom);

  // Trigger a panel render if the drawer is already open and the function is available.
  if (isRoom && typeof window.renderRoomAdminPanel === "function") {
    const state = window.chatState;
    if (state?.infoOpen) {
      window.renderRoomAdminPanel(thread);
    }
  }
}

export function closeOverlays(state) {
  const menuPopover = document.getElementById("menu-popover");
  const infoDrawer = document.getElementById("info-drawer");
  const attachmentModal = document.getElementById("attachment-modal");
  const conversationSearchRow = document.getElementById("conversation-search-row");
  
  menuPopover.classList.add("hidden");
  infoDrawer.classList.add("hidden");
  attachmentModal?.classList.add("hidden");
  state.menuOpen = false;
  state.infoOpen = false;
  conversationSearchRow.classList.add("hidden");
}
