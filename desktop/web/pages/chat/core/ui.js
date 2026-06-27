// desktop/web/pages/chat/core/ui.js

import { escapeHTML } from "./utils.js";
import { iconMap } from "./icons.js";

export function clearConversationCanvas(messagesScroll, dayChip) {
  messagesScroll.innerHTML = "";
  dayChip.hidden = true;
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
  conversationSearchRow.classList.add("hidden");
  menuPopover.classList.add("hidden");
  infoDrawer.classList.add("hidden");
  state.convoSearch = "";
  conversationSearch.value = "";

  conversationPane.classList.add("is-empty");
  conversationEmptyState.hidden = false;
  conversationContent.hidden = true;
  clearConversationCanvas(
    document.getElementById("messages-scroll"),
    document.getElementById("day-chip")
  );

  conversationEmptyTitle.textContent = hasThreads ? "No chat selected" : "No conversations yet";
  conversationEmptyCopy.textContent = hasThreads
    ? "Choose a conversation from the left or start a new one."
    : "Your conversations will appear here once they are created.";
}

export function openConversationView() {
  const conversationPane = document.getElementById("conversation-pane");
  const conversationEmptyState = document.getElementById("conversation-empty-state");
  const conversationContent = document.getElementById("conversation-content");
  
  conversationPane.classList.remove("is-empty");
  conversationEmptyState.hidden = true;
  conversationContent.hidden = false;
  clearConversationCanvas(
    document.getElementById("messages-scroll"),
    document.getElementById("day-chip")
  );
}

export function renderThreadEmptyState(threadList, title, copy, actionLabel = "New chat", actionKind = "new-chat") {
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
    const matchesKind = state.threadFilter === "all" || thread.kind === state.threadFilter;
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
    item.innerHTML = `
      <div class="avatar">${escapeHTML(thread.initials)}</div>
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
    threadList.appendChild(item);
  });
}

export function updateConversationMeta(thread) {
  if (!thread) return;
  const conversationTitle = document.getElementById("conversation-title");
  const conversationStatus = document.getElementById("conversation-status");
  const conversationAvatar = document.getElementById("conversation-avatar");
  
  conversationTitle.textContent = thread.title || "Conversation";
  conversationStatus.textContent = thread.kind === "room"
    ? `Group · ${thread.members?.length || 1} members`
    : (thread.status || "Direct Message");
  conversationAvatar.textContent = thread.initials || "VA";
  document.getElementById("info-participants").textContent = String(thread.members?.length || 1);
  document.getElementById("info-type").textContent = thread.kind === "group" ? "Group" : "DM";
  document.getElementById("info-files").textContent = String(
    (thread.messages || []).filter((msg) => msg.type === "FILE" || msg.type === "IMAGE").length
  );
}

export function updateInfoDrawer(thread) {
  if (!thread) return;
  document.getElementById("info-participants").textContent = String(thread.members?.length || 1);
  document.getElementById("info-type").textContent = thread.kind === "group" ? "Group" : "DM";
  document.getElementById("info-files").textContent = String(
    (thread.messages || []).filter((msg) => msg.type === "FILE" || msg.type === "IMAGE").length
  );
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
