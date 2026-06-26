// desktop/web/pages/chat/script.js
import {
  getConversations,
  getMessages,
  sendMessage,
  sendImage,
  sendVoice,
  markConversationRead,
  startConversation
} from "../../services/dm.js";

import { searchUsers } from "../../services/users.js";
import { apiRequest } from "../../services/api.js";

const state = {
  activeThreadId: null,
  threadFilter: "all",
  chatSearch: "",
  convoSearch: "",
  menuOpen: false,
  infoOpen: false,
  newChatOpen: false,
  threads: []
};

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

const ACTIVE_THREAD_KEY = "vagmi-active-chat-thread";
let newChatSearchTimer = null;
let loadSequence = 0;
let attachmentPreview = null;

let scrollRaf1 = null;
let scrollRaf2 = null;
let scrollTimeout = null;
let messagesObserver = null;

function scrollMessagesToBottom() {
  if (!messagesScroll) return;
  if (scrollRaf1) cancelAnimationFrame(scrollRaf1);
  if (scrollRaf2) cancelAnimationFrame(scrollRaf2);
  if (scrollTimeout) window.clearTimeout(scrollTimeout);

  const jump = () => {
    messagesScroll.scrollTop = messagesScroll.scrollHeight;
  };

  scrollRaf1 = requestAnimationFrame(() => {
    scrollRaf2 = requestAnimationFrame(jump);
  });

  scrollTimeout = window.setTimeout(jump, 60);
}


const threadList = document.getElementById("thread-list");
const chatSearch = document.getElementById("chat-search");
const filterButtons = Array.from(document.querySelectorAll(".filter-btn"));
const messagesScroll = document.getElementById("messages-scroll");

if (messagesScroll && "MutationObserver" in window) {
  messagesObserver = new MutationObserver(() => {
    if (state.activeThreadId !== null) {
      scrollMessagesToBottom();
    }
  });
  messagesObserver.observe(messagesScroll, {
    childList: true,
    subtree: true
  });
}

window.addEventListener("resize", () => {
  if (state.activeThreadId !== null) {
    scrollMessagesToBottom();
  }
});
const dayChip = document.getElementById("day-chip");
const conversationPane = document.getElementById("conversation-pane");
const conversationContent = document.getElementById("conversation-content");
const conversationEmptyState = document.getElementById("conversation-empty-state");
const conversationEmptyTitle = document.getElementById("conversation-empty-title");
const conversationEmptyCopy = document.getElementById("conversation-empty-copy");
const threadNewChatBtn = document.getElementById("thread-new-chat-btn");
const conversationTitle = document.getElementById("conversation-title");
const conversationStatus = document.getElementById("conversation-status");
const conversationAvatar = document.getElementById("conversation-avatar");
const backBtn = document.getElementById("back-btn");
const conversationSearchRow = document.getElementById("conversation-search-row");
const conversationSearch = document.getElementById("conversation-search");
const searchToggle = document.getElementById("search-toggle");
const closeSearch = document.getElementById("close-search");
const menuToggle = document.getElementById("menu-toggle");
const menuPopover = document.getElementById("menu-popover");
const infoDrawer = document.getElementById("info-drawer");
const closeInfo = document.getElementById("close-info");
const attachBtn = document.getElementById("attach-btn");
const imageBtn = document.getElementById("image-btn");
const micBtn = document.getElementById("mic-btn");
const sendBtn = document.getElementById("send-btn");
const inputField = document.getElementById("message-input");
const fileInput = document.getElementById("file-input");
const imageInput = document.getElementById("image-input");

const newChatModal = document.getElementById("new-chat-modal");
const newChatBackdrop = document.getElementById("new-chat-backdrop");
const newChatClose = document.getElementById("new-chat-close");
const newChatSearch = document.getElementById("new-chat-search");
const newChatResults = document.getElementById("new-chat-results");
const attachmentModal = document.getElementById("attachment-modal");
const attachmentModalBackdrop = document.getElementById("attachment-modal-backdrop");
const attachmentModalClose = document.getElementById("attachment-modal-close");
const attachmentModalTitle = document.getElementById("attachment-modal-title");
const attachmentModalBody = document.getElementById("attachment-modal-body");
const attachmentModalOpen = document.getElementById("attachment-modal-open");
const attachmentModalDownload = document.getElementById("attachment-modal-download");

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("vagmi_user") || "null");
  } catch {
    return null;
  }
}

const currentUser = getCurrentUser();

const iconMap = {
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7.5"></circle><line x1="20" y1="20" x2="16.5" y2="16.5"></line></svg>`,
  more: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none"/></svg>`,
  attach: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.5l-8.8 8.8a5 5 0 1 1-7.1-7.1l9.2-9.2a3.5 3.5 0 0 1 5 5l-9.6 9.6a2 2 0 0 1-2.8-2.8l8.5-8.5"></path></svg>`,
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="9" cy="9" r="1.5"></circle><path d="M21 15l-5-5-8 8"></path></svg>`,
  mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="3" width="6" height="12" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v3"></path></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>`,
  file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"></path><path d="M14 2v5h5"></path></svg>`,
  imageSmall: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="8" cy="9" r="1.4"></circle><path d="M21 17l-5-5-5 5-3-3-5 5"></path></svg>`,
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"></path></svg>`,
  compose: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 20h4l12-12a2.5 2.5 0 0 0-4-4L4 16v4z"></path><path d="M13.5 6.5l4 4"></path></svg>`
};

function escapeHTML(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatTime(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function clearAttachmentPreview() {
  if (attachmentPreview?.objectUrl) {
    URL.revokeObjectURL(attachmentPreview.objectUrl);
  }
  attachmentPreview = null;
}

function closeAttachmentModal() {
  if (!attachmentModal) return;
  clearAttachmentPreview();
  attachmentModal.classList.add("hidden");
  attachmentModal.setAttribute("aria-hidden", "true");
  if (attachmentModalBody) attachmentModalBody.innerHTML = "";
  if (attachmentModalTitle) attachmentModalTitle.textContent = "Preview";
}

let imgViewerZoom = 1;

function openImageViewer(src, filename) {
  const modal = document.getElementById("image-viewer-modal");
  const img   = document.getElementById("img-viewer-el");
  if (!modal || !img) return;
  imgViewerZoom = 1;
  img.src = src;
  img.alt = filename || "image";
  img.style.transform = "scale(1)";
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeImageViewer() {
  const modal = document.getElementById("image-viewer-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  document.getElementById("img-viewer-el").src = "";
}

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

document.getElementById("img-download")?.addEventListener("click", () => {
  const img = document.getElementById("img-viewer-el");
  if (!img?.src) return;
  const link = document.createElement("a");
  link.href = img.src;
  link.download = img.alt || "image";
  link.click();
});

// Escape key closes viewer
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeImageViewer();
});

function openAttachmentModal() {
  if (!attachmentModal) return;
  attachmentModal.classList.remove("hidden");
  attachmentModal.setAttribute("aria-hidden", "false");
}

function attachmentDownloadName(message) {
  return message?.originalFilename || "attachment";
}

function buildAttachmentUrl(thread, message) {
  if (!thread || !message) return "";
  if (message.attachmentId) {
    return `/attachments/${message.attachmentId}`;
  }
  if (message.attachmentPath) {
    if (thread.kind === "dm") {
      return `/dm/${thread.id}/messages/${message.id}/attachment`;
    }
    return `/rooms/${thread.id}/messages/${message.id}/attachment`;
  }
  return "";
}

async function fetchAttachmentBlob(thread, message) {
  const url = buildAttachmentUrl(thread, message);
  if (!url) {
    throw new Error("Attachment is not available.");
  }

  const response = await apiRequest(url);
  const blob = await response.blob();
  return {
    blob,
    contentType: response.headers.get("content-type") || blob.type || "application/octet-stream",
    filename: attachmentDownloadName(message)
  };
}

function buildAttachmentCard(thread, message) {
  const name = escapeHTML(message.originalFilename || "Attachment");
  const meta = message.type === "IMAGE" ? "Image attachment" : "File attachment";
  const icon = message.type === "IMAGE" ? iconMap.imageSmall : iconMap.file;
  const attachmentUrl = buildAttachmentUrl(thread, message);
  const hasRemoteAttachment = Boolean(attachmentUrl);

  return `
    <div
      class="attachment-card${hasRemoteAttachment ? " clickable" : ""}"
      data-attachment-thread-id="${thread.id}"
      data-attachment-message-id="${message.id}"
      data-attachment-kind="${message.type}"
      ${hasRemoteAttachment ? 'role="button" tabindex="0"' : ""}
      aria-label="${hasRemoteAttachment ? `Open attachment ${name}` : `Attachment ${name}`}"
    >
      <div class="attachment-card-icon">${icon}</div>
      <div class="attachment-card-main">
        <div class="attachment-card-title">${name}</div>
        <div class="attachment-card-subtitle">${meta}</div>
      </div>
      <div class="attachment-card-actions">
        ${
          hasRemoteAttachment
            ? `<button class="attachment-action-btn" data-attachment-action="view" type="button">Open</button>
               <button class="attachment-action-btn" data-attachment-action="download" type="button">Download</button>`
            : `<span class="attachment-local-label">Stored locally</span>`
        }
      </div>
    </div>
  `;
}

function renderAttachmentModalView(thread, message, blob, contentType) {
  const title = message.originalFilename || "Attachment";
  const objectUrl = URL.createObjectURL(blob);
  clearAttachmentPreview();
  attachmentPreview = { objectUrl, filename: title, contentType };

  if (attachmentModalTitle) attachmentModalTitle.textContent = title;

  const isImage = contentType.startsWith("image/") || message.type === "IMAGE";
  const isPdf = contentType.includes("pdf") || /\.pdf$/i.test(title);
  const isText = contentType.startsWith("text/") || /\.(txt|md|json|csv|log)$/i.test(title);

  if (!attachmentModalBody) return;

  if (isImage) {
    attachmentModalBody.innerHTML = `
      <div class="attachment-preview">
        <img class="attachment-preview-image" src="${objectUrl}" alt="${escapeHTML(title)}" />
      </div>
    `;
  } else if (isPdf) {
    attachmentModalBody.innerHTML = `
      <div class="attachment-preview">
        <iframe class="attachment-preview-frame" src="${objectUrl}" title="${escapeHTML(title)}"></iframe>
      </div>
    `;
  } else if (isText) {
    attachmentModalBody.innerHTML = `
      <div class="attachment-preview">
        <iframe class="attachment-preview-frame" src="${objectUrl}" title="${escapeHTML(title)}"></iframe>
      </div>
    `;
  } else {
    attachmentModalBody.innerHTML = `
      <div class="attachment-preview">
        <div class="attachment-preview-card">
          <div class="avatar-large" style="margin:0 auto;">${iconMap.file}</div>
          <div class="attachment-preview-name">${escapeHTML(title)}</div>
          <div class="attachment-preview-copy">This file can be opened in a new tab or downloaded locally.</div>
        </div>
      </div>
    `;
  }

  attachmentModalOpen.onclick = () => {
    if (!attachmentPreview?.objectUrl) return;
    window.open(attachmentPreview.objectUrl, "_blank", "noopener,noreferrer");
  };

  attachmentModalDownload.onclick = () => {
    if (!attachmentPreview?.objectUrl) return;
    const link = document.createElement("a");
    link.href = attachmentPreview.objectUrl;
    link.download = attachmentPreview.filename || "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
}

async function openAttachmentViewer(thread, message) {
  try {
    const { blob, contentType, filename } = await fetchAttachmentBlob(thread, message);
    renderAttachmentModalView(thread, { ...message, originalFilename: filename }, blob, contentType);
    openAttachmentModal();
  } catch (error) {
    console.error("Attachment open failed", error);
  }
}

async function downloadAttachment(thread, message) {
  try {
    const { blob, filename } = await fetchAttachmentBlob(thread, message);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename || "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  } catch (error) {
    console.error("Attachment download failed", error);
  }
}

function activeThread() {
  return state.threads.find((thread) => thread.id === state.activeThreadId) || null;
}

function saveActiveThreadId(threadId) {
  if (threadId === null || threadId === undefined) {
    localStorage.removeItem(ACTIVE_THREAD_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_THREAD_KEY, String(threadId));
}

function getSavedActiveThreadId() {
  const raw = localStorage.getItem(ACTIVE_THREAD_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function clearConversationCanvas() {
  messagesScroll.innerHTML = "";
  dayChip.hidden = true;
}

function showConversationEmptyState() {
  const hasThreads = state.threads.length > 0;

  state.menuOpen = false;
  state.infoOpen = false;
  conversationSearchRow.classList.add("hidden");
  menuPopover.classList.add("hidden");
  infoDrawer.classList.add("hidden");
  closeAttachmentModal();
  state.convoSearch = "";
  conversationSearch.value = "";

  conversationPane.classList.add("is-empty");
  conversationEmptyState.hidden = false;
  conversationContent.hidden = true;
  clearConversationCanvas();

  conversationEmptyTitle.textContent = hasThreads ? "No chat selected" : "No conversations yet";
  conversationEmptyCopy.textContent = hasThreads
    ? "Choose a conversation from the left or start a new one."
    : "Your conversations will appear here once they are created.";

}

function openConversationView() {
  conversationPane.classList.remove("is-empty");
  conversationEmptyState.hidden = true;
  conversationContent.hidden = false;
  clearConversationCanvas();
}

function requestNewChat() {
  openNewChatModal();
}

function openNewChatModal() {
  if (!newChatModal) return;
  state.newChatOpen = true;
  newChatModal.classList.remove("hidden");
  newChatSearch.value = "";
  renderNewChatState("Search registered users to start a new chat.");
  setTimeout(() => newChatSearch?.focus(), 0);
  searchRegisteredUsers("");
}

function closeNewChatModal() {
  if (!newChatModal) return;
  state.newChatOpen = false;
  if (newChatSearchTimer) {
    clearTimeout(newChatSearchTimer);
    newChatSearchTimer = null;
  }
  newChatModal.classList.add("hidden");
  newChatSearch.value = "";
  renderNewChatState("Search registered users to start a new chat.");
}

function renderNewChatState(message) {
  if (!newChatResults) return;
  newChatResults.innerHTML = `<div class="new-chat-empty">${escapeHTML(message)}</div>`;
}

function renderNewChatResults(users) {
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
      <button type="button" class="new-chat-result" data-username="${escapeHTML(username)}">
        <div class="avatar">${escapeHTML(initials)}</div>
        <div>
          <div class="result-name">${escapeHTML(username)}</div>
          <div class="result-meta">Direct message</div>
        </div>
        <div class="result-action">Start</div>
      </button>
    `;
  }).join("");
}

async function searchRegisteredUsers(query) {
  if (!newChatResults) return;
  try {
    newChatResults.innerHTML = `<div class="new-chat-loading">Searching users...</div>`;
    const users = await searchUsers(query ?? "");
    renderNewChatResults(users);
  } catch (error) {
    console.error("User search failed", error);
    renderNewChatState("Unable to search users right now.");
  }
}

async function startChatWithUser(username) {
  try {
    const conversation = await startConversation(username);
    closeNewChatModal();
    await loadConversations({ preserveSelection: false });
    await openThread(conversation.id, { remember: true });
  } catch (error) {
    console.error("Failed to start conversation", error);
    renderNewChatState(error?.message || "Failed to start conversation.");
  }
}

function renderThreadEmptyState(title, copy, actionLabel = "New chat", actionKind = "new-chat") {
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
      state.chatSearch = "";
      chatSearch.value = "";
      renderThreads();
      return;
    }
    requestNewChat();
  });
}

function previewText(thread) {
  if (thread.lastMessageType === "IMAGE") return thread.lastMessage || "Image";
  if (thread.lastMessageType === "FILE") return thread.lastMessage || "File";
  return thread.lastMessage || "No messages yet";
}

function iconForPreview(type) {
  if (type === "IMAGE") return "imageSmall";
  if (type === "FILE") return "file";
  return null;
}

function renderThreads() {
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
      "No conversations yet",
      "Your conversations will appear here after they are created.",
      "New chat",
      "new-chat"
    );
    return;
  }

  if (filteredThreads.length === 0) {
    renderThreadEmptyState(
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
    item.className = "thread-item" + (thread.id === state.activeThreadId ? " active" : "");
    item.dataset.threadId = String(thread.id);
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

threadList.addEventListener("click", (event) => {
  const btn = event.target.closest(".thread-item");
  if (!btn) return;
  const threadId = Number(btn.dataset.threadId);
  if (!Number.isFinite(threadId)) return;
  openThread(threadId);
});

async function loadInlineImages() {

  const images = document.querySelectorAll(".chat-image-preview");

  for (const img of images) {

    const threadId = Number(img.dataset.threadId);
    const messageId = Number(img.dataset.messageId);


    const thread = state.threads.find((t) => t.id === threadId);

    if (!thread) {

      continue;
    }

    const message = thread.messages.find((m) => m.id === messageId);

    if (!message) {

      continue;
    }

    try {

      const { blob } = await fetchAttachmentBlob(thread, message);



      const blobUrl = URL.createObjectURL(blob);

      img.src = blobUrl;

      img.onclick = () => {
      openImageViewer(blobUrl, message.originalFilename);
      };

    } catch (err) {

      console.error(" Image load failed:", err);

    }
  }
}

function messageHTML(thread, message) {
  const sideClass = message.sender === "self" ? "self" : "other";
  const senderLine =
    message.sender === "other"
      ? `<div class="message-sender">${escapeHTML(message.senderName || "Sender")}</div>`
      : "";

  if (message.type === "TEXT") {
    return `
      <div class="message-row ${sideClass}">
        <div class="message-bubble">
          ${senderLine ? `<div class="message-meta">${senderLine}</div>` : ""}
          <div class="message-text">${escapeHTML(message.text || "")}</div>
          <div class="message-time mono">${escapeHTML(message.time || "")}</div>
        </div>
      </div>
    `;
  }

    if (message.type === "VOICE") {

      const audioUrl =
        `/api/dm/voice/${message.id}`;

      return `
        <div class="message-row ${sideClass}">
          <div class="message-bubble">

            ${
              senderLine
                ? `<div class="message-meta">${senderLine}</div>`
                : ""
            }

            <div class="voice-card">

              <audio
                controls
                preload="metadata"
                class="voice-player"
              >
                <source
                  src="${audioUrl}"
                  type="audio/webm"
                >
              </audio>

            </div>

            <div class="message-time mono">
              ${escapeHTML(message.time)}
            </div>

          </div>
        </div>
      `;
    }


  if (message.type === "IMAGE") {
  const imageUrl = buildAttachmentUrl(thread, message);
  
  return `
    <div class="message-row ${sideClass}">
      <div class="message-bubble">
        ${senderLine ? `<div class="message-meta">${senderLine}</div>` : ""}
        
        <img
    class="chat-image-preview"
    data-thread-id="${thread.id}"
    data-message-id="${message.id}"
    alt="${escapeHTML(message.originalFilename || "Image")}"
    style="
        max-width:240px;
        max-height:240px;
        width:auto;
        height:auto;
        border-radius:10px;
        cursor:pointer;
        display:block;
        object-fit:cover;
    "
/>
        <div class="message-time mono">${escapeHTML(message.time || "")}</div>
      </div>
    </div>
  `;
}

if (message.type === "FILE") {
  return `
    <div class="message-row ${sideClass}">
      <div class="message-bubble">
        ${senderLine ? `<div class="message-meta">${senderLine}</div>` : ""}
        ${buildAttachmentCard(thread, message)}
        <div class="message-time mono">${escapeHTML(message.time || "")}</div>
      </div>
    </div>
  `;
}
  return "";
}

function renderMessages(thread) {
  if (!thread || state.activeThreadId !== thread.id) {
    clearConversationCanvas();
    return;
  }

  const messages = thread.messages.filter((msg) => msg.type !== "DAY");
  const term = state.convoSearch.trim().toLowerCase();

  const filtered = !term
    ? messages
    : messages.filter((msg) => {
        const haystack = [
          msg.senderName || "",
          msg.text || "",
          msg.originalFilename || "",
          msg.fileMeta || ""
        ].join(" ").toLowerCase();
        return haystack.includes(term);
      });

  if (messages.length === 0) {
    messagesScroll.innerHTML = `
      <div class="messages-empty">
        <div class="messages-empty-card">
          <div class="messages-empty-kicker mono">Conversation ready</div>
          <div class="messages-empty-title">No messages yet</div>
          <div class="messages-empty-copy">Use the composer below to start this conversation.</div>
        </div>
      </div>
    `;
    dayChip.hidden = true;
    return;
  }

  if (filtered.length === 0) {
    messagesScroll.innerHTML = `
      <div class="messages-empty">
        <div class="messages-empty-card">
          <div class="messages-empty-kicker mono">Search</div>
          <div class="messages-empty-title">No messages match your search</div>
          <div class="messages-empty-copy">Try another term or clear the search box.</div>
        </div>
      </div>
    `;
    dayChip.hidden = true;
    return;
  }

  dayChip.hidden = false;
  dayChip.textContent = "Today";
  messagesScroll.innerHTML = filtered.map((message) => messageHTML(thread, message)).join("");

  loadInlineImages();

  scrollMessagesToBottom();
}


function updateConversationMeta(thread) {
  if (!thread) return;
  conversationTitle.textContent = thread.title || "Conversation";
  conversationStatus.textContent = thread.status || "Direct Message";
  conversationAvatar.textContent = thread.initials || "VA";
  document.getElementById("info-participants").textContent = String(thread.members?.length || 1);
  document.getElementById("info-type").textContent = thread.kind === "group" ? "Group" : "DM";
  document.getElementById("info-files").textContent = String(
    (thread.messages || []).filter((msg) => msg.type === "FILE" || msg.type === "IMAGE").length
  );
}

function updateInfoDrawer(thread) {
  if (!thread) return;
  document.getElementById("info-participants").textContent = String(thread.members?.length || 1);
  document.getElementById("info-type").textContent = thread.kind === "group" ? "Group" : "DM";
  document.getElementById("info-files").textContent = String(
    (thread.messages || []).filter((msg) => msg.type === "FILE" || msg.type === "IMAGE").length
  );
}

function closeOverlays() {
  menuPopover.classList.add("hidden");
  infoDrawer.classList.add("hidden");
  attachmentModal?.classList.add("hidden");
  state.menuOpen = false;
  state.infoOpen = false;
  conversationSearchRow.classList.add("hidden");
}

async function loadMessages(conversationId, loadToken = 0) {
  try {
    const messages = await getMessages(conversationId);
    if (loadToken !== 0 && loadToken !== loadSequence) return;

    const thread = state.threads.find((t) => t.id === Number(conversationId));
    if (!thread) return;

    thread.messages = (messages || []).map((message) => {
      const senderName = message.sender_username || "Unknown";

      const isSelf = senderName === (currentUser?.username || "");
      
      return {
        id: message.id,
        sender: isSelf ? "self" : "other",
        senderName,
        type: (message.message_type || "TEXT").toUpperCase(),
        text: message.message_text || "",
        originalFilename: message.original_filename || "",
        attachmentPath: message.attachment_path || "",
        attachmentId: message.attachment_id || null,
        fileMeta: message.original_filename || "",
        time: formatTime(message.created_at)
      };
    });

    updateConversationMeta(thread);
    updateInfoDrawer(thread);
    renderMessages(thread);
    scrollMessagesToBottom();
  } catch (error) {
    console.error("Failed loading messages", error);
  }
}

async function openThread(threadId, { remember = true } = {}) {
  const numericId = Number(threadId);
  if (!Number.isFinite(numericId)) return;

  const thread = state.threads.find((item) => item.id === numericId);
  if (!thread) return;

  state.activeThreadId = numericId;
  if (remember) {
    saveActiveThreadId(numericId);
  }

  state.convoSearch = "";
  conversationSearch.value = "";
  closeAttachmentModal();
  closeOverlays();
  openConversationView();
  updateConversationMeta(thread);
  updateInfoDrawer(thread);
  renderThreads();

  loadSequence += 1;
  const currentSequence = loadSequence;

  await loadMessages(numericId, currentSequence);
  if (currentSequence !== loadSequence) return;

  try {
    await markConversationRead(numericId);
    thread.unread = 0;
    renderThreads();
  } catch (error) {
    console.error("Failed marking conversation as read", error);
  }
}

function closeConversationAndShowEmptyState() {
  loadSequence += 1;
  state.activeThreadId = null;
  saveActiveThreadId(null);
  state.convoSearch = "";
  conversationSearch.value = "";
  closeAttachmentModal();
  closeOverlays();
  renderThreads();
  showConversationEmptyState();
}

async function handleSend() {
  const thread = activeThread();
  if (!thread) return;

  const text = inputField.value.trim();
  if (!text) return;

  try {
    inputField.value = "";
    inputField.style.height = "44px";
    inputField.style.overflowY = "hidden";

    await sendMessage(thread.id, text);
    thread.lastMessage = text;
    thread.lastMessageType = "TEXT";
    thread.lastMessageTime = formatTime(new Date());
    thread.unread = 0;

    await loadMessages(thread.id);
    renderThreads();
    scrollMessagesToBottom();
  } catch (error) {
    console.error("Message send failed", error);
    setComposerText(text);
  }
}

function setComposerText(text) {
  inputField.value = text;
  inputField.dispatchEvent(new Event("input"));
}

function handleAttachment(file, forceType = null) {
  const thread = activeThread();
  if (!thread) return;

  const type = forceType || (file.type.startsWith("image/") ? "IMAGE" : "FILE");

  if (type === "IMAGE") {
    sendImage(thread.id, file)
      .then(() => loadMessages(thread.id))
      .then(() => {
        thread.lastMessage = "Image";
        thread.lastMessageType = "IMAGE";
        thread.lastMessageTime = formatTime(new Date());
        renderThreads();
        scrollMessagesToBottom();
      })
      .catch((error) => {
        console.error("Image send failed", error);
      });
    return;
  }

  // File attachments are not yet supported by the backend DM flow.
  // We keep the composer functional without breaking the interface.
  const time = formatTime(new Date());
  thread.messages.push({
    id: `local-${Date.now()}`,
    sender: "self",
    senderName: currentUser?.username || "You",
    type: "FILE",
    originalFilename: file.name,
    fileMeta: formatFileSize(file.size),
    time
  });
  thread.lastMessage = file.name;
  thread.lastMessageType = "FILE";
  thread.lastMessageTime = time;
  renderMessages(thread);
  renderThreads();
}

async function loadConversations({ preserveSelection = true } = {}) {
  const conversations = await getConversations();
  const preservedActiveId = preserveSelection ? state.activeThreadId : null;

  state.threads = (conversations || []).map((conversation) => ({
    id: Number(conversation.conversation_id),
    kind: conversation.kind || "dm",
    title: conversation.username || "Conversation",
    initials: (conversation.username || "VA").substring(0, 2).toUpperCase(),
    status: conversation.status || "Direct Message",
    unread: conversation.unread_count || 0,
    lastMessage: conversation.last_message || "",
    lastMessageSender: conversation.last_message_sender || "",
    lastMessageType: conversation.last_message_type || (conversation.last_message ? "TEXT" : "TEXT"),
    lastMessageTime: formatTime(conversation.last_message_time),
    members: [conversation.username || "User"],
    messages: []
  }));

  renderThreads();

  if (
    preservedActiveId !== null &&
    state.threads.some((thread) => thread.id === preservedActiveId)
  ) {
    await openThread(preservedActiveId, { remember: false });
    return;
  }

  state.activeThreadId = null;
  saveActiveThreadId(null);

  if (state.threads.length === 0) {
    showConversationEmptyState();
  } else {
    showConversationEmptyState();
  }
}

function currentSearchUpdate() {
  state.chatSearch = chatSearch.value;
  renderThreads();
}

document.querySelectorAll("[data-icon]").forEach((el) => {
  const iconName = el.dataset.icon;
  el.innerHTML = iconMap[iconName] || "";
});

threadList.addEventListener("click", (event) => {
  const btn = event.target.closest(".thread-item");
  if (!btn) return;
  const threadId = Number(btn.dataset.threadId);
  if (!Number.isFinite(threadId)) return;
  openThread(threadId);
});

inputField.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = `${Math.min(this.scrollHeight, 120)}px`;
  this.style.overflowY = this.scrollHeight > 120 ? "auto" : "hidden";
});

inputField.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
});

sendBtn?.addEventListener("click", handleSend);
backBtn?.addEventListener("click", closeConversationAndShowEmptyState);

threadNewChatBtn?.addEventListener("click", () => requestNewChat());

attachBtn?.addEventListener("click", () => fileInput?.click());
imageBtn?.addEventListener("click", () => imageInput?.click());

fileInput?.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) handleAttachment(file, "FILE");
  fileInput.value = "";
});

imageInput?.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (file) handleAttachment(file, "IMAGE");
  imageInput.value = "";
});

micBtn?.addEventListener(
  "click",
  async () => {

    const thread = activeThread();

    if (!thread) {
      return;
    }

    try {

      if (!isRecording) {

        const stream =
          await navigator.mediaDevices.getUserMedia({
            audio: true
          });

        recordedChunks = [];

        mediaRecorder =
          new MediaRecorder(stream);

        mediaRecorder.ondataavailable =
          (event) => {

            if (event.data.size > 0) {
              recordedChunks.push(
                event.data
              );
            }
          };

        mediaRecorder.start();

        isRecording = true;

        micBtn.classList.add(
          "recording"
        );

      } else {

        mediaRecorder.stop();

        mediaRecorder.onstop =
          async () => {

            try {

              const blob =
                new Blob(
                  recordedChunks,
                  {
                    type: "audio/webm"
                  }
                );

              const file =
                new File(
                  [blob],
                  `voice-${Date.now()}.webm`,
                  {
                    type: "audio/webm"
                  }
                );

              await sendVoice(
                thread.id,
                file
              );

              await loadMessages(
                thread.id
              );
              scrollMessagesToBottom();

            } catch (error) {

              console.error(
                "Voice upload failed",
                error
              );
            }
          };

        isRecording = false;

        micBtn.classList.remove(
          "recording"
        );
      }

    } catch (error) {

      console.error(
        "Voice recording failed",
        error
      );
    }
  }
);

chatSearch?.addEventListener("input", currentSearchUpdate);

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    state.threadFilter = button.dataset.filter;
    renderThreads();
  });
});

searchToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  conversationSearchRow.classList.remove("hidden");
  conversationSearch.focus();
});

closeSearch?.addEventListener("click", () => {
  conversationSearchRow.classList.add("hidden");
  state.convoSearch = "";
  conversationSearch.value = "";
  const thread = activeThread();
  if (thread) renderMessages(thread);
});

conversationSearch?.addEventListener("input", () => {
  state.convoSearch = conversationSearch.value;
  const thread = activeThread();
  if (thread) renderMessages(thread);
});

menuToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  state.menuOpen = !state.menuOpen;
  menuPopover.classList.toggle("hidden", !state.menuOpen);
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (
    target.closest(".menu-wrap") ||
    target.closest("#search-toggle") ||
    target.closest(".conversation-search") ||
    target.closest("#info-drawer") ||
    target.closest("#new-chat-modal") ||
    target.closest("#attachment-modal")
  ) {
    return;
  }
  closeOverlays();
});

menuPopover?.addEventListener("click", (event) => {
  event.stopPropagation();
  const btn = event.target.closest(".menu-item");
  if (!btn) return;

  const action = btn.dataset.menu;
  closeOverlays();

  if (action === "search") {
    conversationSearchRow.classList.remove("hidden");
    conversationSearch.focus();
  }

  if (action === "clear") {
    const thread = activeThread();
    if (!thread) return;
    thread.messages = [];
    thread.lastMessage = "";
    thread.lastMessageType = "TEXT";
    thread.lastMessageTime = "";
    updateConversationMeta(thread);
    renderThreads();
    renderMessages(thread);
  }

  if (action === "info") {
    state.infoOpen = !state.infoOpen;
    infoDrawer.classList.toggle("hidden", !state.infoOpen);
  }
});

newChatClose?.addEventListener("click", closeNewChatModal);
newChatBackdrop?.addEventListener("click", closeNewChatModal);

newChatSearch?.addEventListener("input", () => {
  if (newChatSearchTimer) {
    clearTimeout(newChatSearchTimer);
  }
  const value = newChatSearch.value;
  newChatSearchTimer = setTimeout(() => {
    searchRegisteredUsers(value);
  }, 220);
});

newChatResults?.addEventListener("click", (event) => {
  const btn = event.target.closest(".new-chat-result");
  if (!btn) return;
  const username = btn.dataset.username;
  if (!username) return;
  startChatWithUser(username);
});

messagesScroll.addEventListener("click", (event) => {
  const imgEl = event.target.closest(".chat-image-preview");
  if (imgEl) {
  openImageViewer(
    imgEl.src,
    imgEl.dataset.messageId
  );
    return;
  }
  const actionBtn = event.target.closest("[data-attachment-action]");
  const card = event.target.closest(".attachment-card.clickable");
  if (!actionBtn && !card) return;

  const targetCard = actionBtn ? actionBtn.closest(".attachment-card.clickable") : card;
  if (!targetCard) return;

  const threadId = Number(targetCard.dataset.attachmentThreadId);
  const messageId = Number(targetCard.dataset.attachmentMessageId);
  if (!Number.isFinite(threadId) || !Number.isFinite(messageId)) return;

  const thread = state.threads.find((item) => item.id === threadId);
  if (!thread) return;
  const message = thread.messages.find((item) => item.id === messageId);
  if (!message) return;

  const action = actionBtn?.dataset.attachmentAction || "view";
  if (action === "download") {
    downloadAttachment(thread, message);
  } else {
    openAttachmentViewer(thread, message);
  }
});

attachmentModalBackdrop?.addEventListener("click", closeAttachmentModal);
attachmentModalClose?.addEventListener("click", closeAttachmentModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.newChatOpen) {
    closeNewChatModal();
  }
  if (event.key === "Escape" && attachmentModal && !attachmentModal.classList.contains("hidden")) {
    closeAttachmentModal();
  }
});



async function initialize() {
  try {
    const savedThreadId = getSavedActiveThreadId();

    await loadConversations({ preserveSelection: false });

    if (savedThreadId !== null && state.threads.some((thread) => thread.id === savedThreadId)) {
      await openThread(savedThreadId, { remember: false });
    } else {
      state.activeThreadId = null;
      saveActiveThreadId(null);
      showConversationEmptyState();
      scrollMessagesToBottom();
    }
  } catch (error) {
    console.error("Conversation load failed", error);
    state.activeThreadId = null;
    saveActiveThreadId(null);
    showConversationEmptyState();
  }
}

initialize();
