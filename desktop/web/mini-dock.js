// desktop/web/mini-dock.js
//
// Standalone logic for the mini chat window. Runs in its own pywebview
// window/browsing context (same origin as the main window, so it shares
// localStorage — including the auth token) and talks to the backend
// directly rather than depending on the main window being open.
//
// Flow: watch for sign-in -> show conversation list -> tap a chat ->
// thread view (poll for new messages) -> back -> list again.

import { getConversations, getMessages, sendMessage, sendAttachment, markConversationRead } from "./services/dm.js";
import { getUser, isAuthenticated } from "./services/auth.js";
import { apiRequest } from "./services/api.js";
import { formatTime, formatDate, getDateKey } from "./pages/chat/core/utils.js";
import { saveBlobToDownloads } from "./pages/chat/core/attachment.js";

const AUTH_RETRY_MS = 1500;
const LIST_POLL_MS = 6000;
const MESSAGE_POLL_MS = 3500;
const TOAST_DURATION_MS = 3200;

const els = {
  window: document.getElementById("miniChatWindow"),

  backBtn: document.getElementById("backBtn"),
  headerTitle: document.getElementById("headerTitle"),
  minimizeBtn: document.getElementById("minimizeBtn"),
  maximizeBtn: document.getElementById("maximizeBtn"),

  signedOutNotice: document.getElementById("signedOutNotice"),

  listView: document.getElementById("listView"),
  listContainer: document.getElementById("conversationListContainer"),
  listEmpty: document.getElementById("listEmpty"),
  listLoading: document.getElementById("listLoading"),

  threadView: document.getElementById("threadView"),
  avatar: document.getElementById("conversationAvatar"),
  name: document.getElementById("conversationName"),
  statusWrap: document.querySelector(".conversation-sub"),
  statusText: document.getElementById("statusText"),

  messagesScroll: document.getElementById("messagesScroll"),
  messagesContainer: document.getElementById("messagesContainer"),
  messagesEmpty: document.getElementById("messagesEmpty"),

  attachBtn: document.getElementById("attachBtn"),
  attachmentInput: document.getElementById("attachmentInput"),
  input: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),

  toast: document.getElementById("miniToast"),
};

let currentUser = null;
let activeConversationId = null;
let activeConversation = null;
let renderedMessageIds = new Set();
let lastDayKey = null;
let listPollTimer = null;
let messagePollTimer = null;
let authWatchTimer = null;
let sending = false;
let toastTimer = null;
let windowVisible = true;

function getBridge() {
  return window.pywebview && window.pywebview.api ? window.pywebview.api : null;
}

function ensureCurrentUser() {
  if (!currentUser) {
    currentUser = getUser();
  }
  return currentUser;
}

// ---------------------------------------------------------------------
// SVG icons — replace every <span class="icon" data-icon="…"></span>
// with an inline <svg><use href="#i-…"/></svg> on boot. Using <use>
// keeps the DOM small and lets theme color flows through currentColor.
// ---------------------------------------------------------------------

function applyIcons(root = document) {
  const map = {
    back: "i-back",
    close: "i-close",
    minimize: "i-minimize",
    maximize: "i-maximize",
    attach: "i-attach",
    send: "i-send",
    image: "i-image",
    chat: "i-chat",
    lock: "i-lock",
    mic: "i-mic",
    file: "i-file",
    download: "i-download",
  };

  root.querySelectorAll("span.icon[data-icon]").forEach((span) => {
    const name = span.getAttribute("data-icon");
    const symbolId = map[name];
    if (!symbolId) return;
    // Only inject if not already done.
    if (span.querySelector("svg")) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `#${symbolId}`);
    use.setAttribute("href", `#${symbolId}`);
    svg.appendChild(use);
    span.appendChild(svg);
  });
}

// ---------------------------------------------------------------------
// Toast — small, transient feedback surface for send / network errors.
// ---------------------------------------------------------------------

function showToast(message, kind = "info") {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.toggle("error", kind === "error");
  els.toast.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, TOAST_DURATION_MS);
}

function hideToast() {
  if (!els.toast) return;
  els.toast.hidden = true;
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
}

// ---------------------------------------------------------------------
// Auth gating — the mini window is created hidden at app startup, often
// before the user has logged in through the main window. So instead of
// checking auth once, keep watching (storage events + a poll fallback)
// until a token shows up, then boot the chat UI.
// ---------------------------------------------------------------------

function showSignedOut() {
  els.signedOutNotice.hidden = false;
  els.listView.hidden = true;
  els.threadView.hidden = true;
  els.backBtn.hidden = true;
}

function watchForAuth() {
  window.addEventListener("storage", (event) => {
    if (event.key === "vagmi_token" && event.newValue) {
      onSignedIn();
    } else if (event.key === "vagmi_token" && !event.newValue) {
      // Logged out — reset state.
      currentUser = null;
      stopMessagePolling();
      if (listPollTimer) {
        clearInterval(listPollTimer);
        listPollTimer = null;
      }
      showSignedOut();
    }
  });

  authWatchTimer = setInterval(() => {
    if (isAuthenticated()) onSignedIn();
  }, AUTH_RETRY_MS);
}

function onSignedIn() {
  if (currentUser) return; // already booted
  if (authWatchTimer) {
    clearInterval(authWatchTimer);
    authWatchTimer = null;
  }

  currentUser = getUser();
  els.signedOutNotice.hidden = true;

  showListView();
  loadConversationList({ initial: true });
  listPollTimer = setInterval(() => {
    if (windowVisible && !activeConversationId) {
      loadConversationList({ initial: false });
    }
  }, LIST_POLL_MS);
}

async function init() {
  applyIcons(document);
  if (isAuthenticated()) {
    onSignedIn();
  } else {
    showSignedOut();
    watchForAuth();
  }
}

// ---------------------------------------------------------------------
// View switching
// ---------------------------------------------------------------------

function showListView() {
  activeConversationId = null;
  activeConversation = null;
  stopMessagePolling();
  renderedMessageIds.clear();
  lastDayKey = null;

  els.headerTitle.textContent = "Conversations";
  els.backBtn.hidden = true;

  els.listView.hidden = false;
  els.threadView.hidden = true;

  els.input.disabled = true;
  els.sendBtn.disabled = true;
  els.attachBtn.disabled = true;
  els.input.value = "";
  autoResizeInput();

  // Refresh list immediately so the user sees fresh data when returning.
  loadConversationList({ initial: false });
}

function showThreadView(conversation) {
  els.headerTitle.textContent = conversation.username || "Chat";
  els.backBtn.hidden = false;

  els.listView.hidden = true;
  els.threadView.hidden = false;
}

els.backBtn.addEventListener("click", () => {
  showListView();
});

// ---------------------------------------------------------------------
// Conversation list
// ---------------------------------------------------------------------

async function loadConversationList({ initial }) {
  try {
    const conversations = await getConversations();
    renderConversationList(Array.isArray(conversations) ? conversations : []);
  } catch (err) {
    if (initial) {
      els.listEmpty.querySelector(".mini-empty-title").textContent = "Couldn't load chats";
      els.listEmpty.querySelector(".mini-empty-copy").textContent =
        err?.message || "Please make sure the backend is running.";
      els.listEmpty.hidden = false;
      els.listLoading.hidden = true;
    }
    console.warn("mini-dock: failed to load conversation list", err);
  }
}

function renderConversationList(conversations) {
  const sorted = [...conversations].sort((a, b) => {
    const aTime = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
    const bTime = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
    return bTime - aTime;
  });

  // Clear existing items but preserve the empty / loading state nodes.
  els.listContainer.querySelectorAll(".conversation-list-item").forEach((n) => n.remove());

  els.listLoading.hidden = true;

  if (sorted.length === 0) {
    els.listEmpty.hidden = false;
    return;
  }

  els.listEmpty.hidden = true;

  for (const conversation of sorted) {
    els.listContainer.appendChild(buildConversationListItem(conversation));
  }
}

function buildConversationListItem(conversation) {
  const name = conversation.username || "Unknown";
  const item = document.createElement("div");
  item.className = "conversation-list-item";
  item.dataset.conversationId = String(conversation.conversation_id);
  if (activeConversationId === conversation.conversation_id) {
    item.classList.add("active");
  }

  const avatar = document.createElement("div");
  avatar.className = "thread-avatar avatar-large";
  avatar.textContent = (name.charAt(0) || "?").toUpperCase();

  const meta = document.createElement("div");
  meta.className = "thread-list-meta";

  const top = document.createElement("div");
  top.className = "thread-list-top";

  const nameEl = document.createElement("div");
  nameEl.className = "thread-list-name";
  nameEl.textContent = name;

  const timeEl = document.createElement("div");
  timeEl.className = "thread-list-time";
  timeEl.textContent = conversation.last_message_time
    ? formatTime(conversation.last_message_time)
    : "";

  top.appendChild(nameEl);
  top.appendChild(timeEl);

  const previewRow = document.createElement("div");
  previewRow.className = "thread-list-preview-row";

  const preview = document.createElement("div");
  preview.className = "thread-list-preview";
  preview.innerHTML = previewTextHTML(conversation);

  previewRow.appendChild(preview);

  if (conversation.unread_count > 0) {
    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent =
      conversation.unread_count > 99 ? "99+" : String(conversation.unread_count);
    previewRow.appendChild(badge);
  }

  meta.appendChild(top);
  meta.appendChild(previewRow);

  item.appendChild(avatar);
  item.appendChild(meta);

  item.addEventListener("click", () => openConversation(conversation));
  return item;
}

function previewTextHTML(conversation) {
  if (!conversation.last_message) return escapeHTML("No messages yet");
  const prefix =
    conversation.last_message_sender === currentUser?.username ? "You: " : "";
  return `${escapeHTML(prefix)}${escapeHTML(conversation.last_message)}`;
}

function escapeHTML(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ---------------------------------------------------------------------
// Thread view
// ---------------------------------------------------------------------

async function openConversation(conversation) {
  activeConversationId = conversation.conversation_id;
  activeConversation = conversation;

  // Mark active item in the list (the list isn't visible while in thread
  // view, but we keep the class in sync for when we return).
  els.listContainer.querySelectorAll(".conversation-list-item").forEach((n) => {
    n.classList.toggle(
      "active",
      n.dataset.conversationId === String(activeConversationId)
    );
  });

  ensureCurrentUser();
  renderThreadHeader(conversation);
  showThreadView(conversation);

  els.input.disabled = false;
  els.attachBtn.disabled = false;
  els.sendBtn.disabled = false;
  els.input.value = "";
  autoResizeInput();
  els.input.focus();

  // Reset message rendering state.
  els.messagesContainer.querySelectorAll(".message-row, .day-chip").forEach((n) => n.remove());
  els.messagesEmpty.hidden = true;
  renderedMessageIds.clear();
  lastDayKey = null;

  await loadMessages({ scrollToBottom: true });
  markConversationRead(activeConversationId).catch(() => {});

  stopMessagePolling();
  messagePollTimer = setInterval(() => {
    if (windowVisible) pollActiveConversation();
  }, MESSAGE_POLL_MS);
}

function stopMessagePolling() {
  if (messagePollTimer) {
    clearInterval(messagePollTimer);
    messagePollTimer = null;
  }
}

function renderThreadHeader(conversation) {
  const name = conversation.username || "Unknown";
  els.name.textContent = name;
  els.avatar.textContent = (name.charAt(0) || "?").toUpperCase();
  setStatus(
    conversation.is_online ? "Online" : formatLastSeen(conversation.last_seen),
    Boolean(conversation.is_online)
  );
}

function setStatus(text, isOnline) {
  els.statusText.textContent = text;
  if (els.statusWrap) {
    els.statusWrap.classList.toggle("is-online", Boolean(isOnline));
  }
}

function formatLastSeen(lastSeen) {
  if (!lastSeen) return "Offline";
  const time = formatTime(lastSeen);
  return time ? `Last seen ${time}` : "Offline";
}

// ---------------------------------------------------------------------
// Messages — rendering & incremental updates
// ---------------------------------------------------------------------

async function loadMessages({ scrollToBottom }) {
  if (!activeConversationId) return;

  try {
    const messages = await getMessages(activeConversationId);
    renderMessages(normalizeMiniMessages(messages));

    if (scrollToBottom) scheduleScrollToBottom();
  } catch (err) {
    console.warn("mini-dock: failed to load messages", err);
    showToast("Couldn't load messages", "error");
  }
}

function renderMessages(messages) {
  ensureCurrentUser();
  if (messages.length === 0) {
    els.messagesEmpty.hidden = false;
    // Make sure the empty state is the only child.
    els.messagesContainer.querySelectorAll(".message-row, .day-chip").forEach((n) => n.remove());
    renderedMessageIds.clear();
    lastDayKey = null;
    return;
  }

  els.messagesEmpty.hidden = true;

  for (const message of messages) {
    appendMessage(message, { animate: false });
  }
}

function appendMessage(message, { animate = true } = {}) {
  const id = Number(message.id ?? message.message_id ?? 0);
  if (!id || renderedMessageIds.has(id)) return;

  // Insert day separator if needed.
  const dayKey = getDateKey({
    createdAt: message.created_at || message.createdAt || message.timestamp,
  });
  if (dayKey && dayKey !== lastDayKey) {
    const chip = document.createElement("div");
    chip.className = "day-chip";
    chip.textContent = formatDate(message.created_at || message.createdAt || message.timestamp);
    els.messagesContainer.appendChild(chip);
    lastDayKey = dayKey;
  }

  const row = buildMessageRow(message, { animate });
  els.messagesContainer.appendChild(row);
  renderedMessageIds.add(id);
}

// ---------------------------------------------------------------------
// Self-message detection — a message belongs to the current user if
// either its sender_id matches currentUser.id OR its sender_username
// matches currentUser.username. Checking both is necessary because the
// stored user object may have id as a string (from JSON) while the API
// returns it as a number, and vice versa.
// ---------------------------------------------------------------------

function isSelfMessage(message) {
  if (!currentUser) return false;

  const senderId = Number(message.sender_id ?? message.senderId ?? message.user_id ?? message.userId ?? 0);
  const myId = Number(currentUser.id ?? 0);
  if (senderId && myId && senderId === myId) return true;

  const senderUsername = safeTrim(
    message.sender_username ||
    message.senderUsername ||
    message.sender_name ||
    message.senderName
  ).toLowerCase();

  const myUsername = safeTrim(currentUser.username).toLowerCase();
  if (senderUsername && myUsername && senderUsername === myUsername) {
    return true;
  }

  return false;
}

function buildMessageRow(message, { animate = true } = {}) {
  const isSelf = message.sender === "self" ? true : isSelfMessage(message);
  const row = document.createElement("div");
  row.className = `message-row ${isSelf ? "self" : "other"}`;
  if (!animate) row.style.animation = "none";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  const type = String(message.type || message.message_type || message.messageType || "TEXT").toUpperCase();

  if (type === "IMAGE") {
    buildImageContent(bubble, message);
  } else if (type === "VOICE") {
    buildVoiceContent(bubble, message);
  } else if (type === "FILE") {
    buildFileContent(bubble, message);
  } else {
    const text = document.createElement("div");
    text.className = "message-text";
    text.textContent =
      message.message_text || message.messageText || "";
    bubble.appendChild(text);
  }

  // Footer (time + receipt).
  const footer = document.createElement("div");
  footer.className = "message-footer";
  footer.appendChild(buildMessageTime(message));
  if (isSelf) {
    const receipt = buildMessageReceipt(message);
    if (receipt) footer.appendChild(receipt);
  }
  bubble.appendChild(footer);

  row.appendChild(bubble);
  return row;
}

function buildMessageTime(message) {
  const time = document.createElement("span");
  time.className = "message-time";
  time.textContent = formatTime(
    message.created_at || message.createdAt || message.timestamp
  );
  return time;
}

function buildMessageReceipt(message) {
  const state = getReceiptState(message);
  if (!state) return null;

  const span = document.createElement("span");
  span.className = `message-receipt ${state}`;
  span.setAttribute(
    "aria-label",
    state === "pending"
      ? "Not delivered"
      : state === "delivered"
        ? "Delivered"
        : "Seen"
  );

  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");

  if (state === "pending") {
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", "M5 12.5l4 4L19 7");
    svg.appendChild(path);
  } else {
    const p1 = document.createElementNS(svgNS, "path");
    p1.setAttribute("d", "M4.8 12.3l3.7 3.7L15.6 8.9");
    svg.appendChild(p1);
    const p2 = document.createElementNS(svgNS, "path");
    p2.setAttribute("d", "M8.8 12.3l3.7 3.7L19.6 8.9");
    svg.appendChild(p2);
  }

  span.appendChild(svg);
  return span;
}

function getReceiptState(message) {
  const deliveredAt = message.delivered_at || message.deliveredAt;
  const seenAt = message.seen_at || message.seenAt;
  if (!deliveredAt) return "pending";
  if (seenAt) return "seen";
  return "delivered";
}

function safeTrim(value) {
  return String(value || "").trim();
}

function attachmentFilename(message) {
  return (
    message?.original_filename ||
    message?.originalFilename ||
    message?.attachment_name ||
    message?.attachmentName ||
    message?.fileMeta ||
    "attachment"
  );
}

function normalizeMiniMessage(message) {
  const senderUsername = safeTrim(
    message?.sender_username ||
    message?.senderUsername ||
    message?.sender_name ||
    message?.senderName
  );
  const senderId = Number(
    message?.sender_id ??
    message?.senderId ??
    message?.user_id ??
    message?.userId ??
    0
  );

  const me = currentUser || getUser();
  const myUsername = safeTrim(me?.username).toLowerCase();
  const myId = Number(me?.id ?? 0);

  const isSelfById = senderId && myId && senderId === myId;
  const isSelfByName = senderUsername &&
    myUsername &&
    senderUsername.toLowerCase() === myUsername;

  const isSelf = Boolean(isSelfById || isSelfByName);
  const type = String(message?.message_type || message?.messageType || "TEXT").toUpperCase();

  return {
    ...message,
    id: Number(message?.id ?? message?.message_id ?? 0),
    sender: isSelf ? "self" : "other",
    senderName: senderUsername || (isSelf ? (currentUser?.username || "You") : "Sender"),
    senderId,
    type,
    text: message?.message_text || message?.messageText || "",
    originalFilename: attachmentFilename(message),
    attachmentPath: message?.attachment_path || message?.attachmentPath || "",
    attachmentId: message?.attachment_id || message?.attachmentId || null,
    fileMeta: attachmentFilename(message),
    fileSize: message?.file_size ?? message?.fileSize ?? null,
    caption: message?.caption || "",
    createdAt: message?.created_at || message?.createdAt || message?.timestamp || null,
    deliveredAt: message?.delivered_at || message?.deliveredAt || null,
    seenAt: message?.seen_at || message?.seenAt || null,
    time: message?.time || formatTime(message?.created_at || message?.createdAt || message?.timestamp),
  };
}

function normalizeMiniMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter(Boolean)
    .map((message) => normalizeMiniMessage(message))
    .filter((message) => message.id)
    .sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      if (aTime !== bTime) return aTime - bTime;
      return a.id - b.id;
    });
}

function scheduleScrollToBottom() {
  const scrollNow = () => {
    const area = els.messagesScroll;
    if (!area) return;
    area.scrollTop = area.scrollHeight;
  };

  requestAnimationFrame(() => {
    scrollNow();
    requestAnimationFrame(scrollNow);
    window.setTimeout(scrollNow, 120);
  });
}

// ---------------------------------------------------------------------
// Image / voice / file rendering — load attachments with auth headers
// and convert to blob URLs so the <img>/<audio> can render them.
// ---------------------------------------------------------------------

function attachmentUrlFor(message) {
  const id = message.id ?? message.message_id;
  if (!id || !activeConversationId) return "";
  return `/dm/${activeConversationId}/messages/${id}/attachment`;
}

async function loadAttachmentBlob(message) {
  const url = attachmentUrlFor(message);
  if (!url) throw new Error("Attachment URL missing");
  const response = await apiRequest(url);
  if (!response.ok) throw new Error("Failed to load attachment");
  return response.blob();
}

function buildImageContent(bubble, message) {
  const img = document.createElement("img");
  img.className = "message-image";
  img.alt = message.original_filename || "Image";
  img.loading = "lazy";
  // The CSS gives the img a branded gradient background while loading
  // (min-width/min-height reserve the space) and clears it once loaded.
  bubble.appendChild(img);

  loadAttachmentBlob(message)
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      img.addEventListener(
        "load",
        () => {
          img.classList.add("is-loaded");
        },
        { once: true }
      );
      img.addEventListener(
        "error",
        () => {
          img.classList.add("is-error");
          img.alt = "Failed to load image";
        },
        { once: true }
      );
      img.src = blobUrl;
      img.onclick = () =>
        openMiniImageViewer(blobUrl, message.original_filename || "Image");
    })
    .catch((err) => {
      console.warn("mini-dock: image load failed", err);
      img.classList.add("is-error");
      img.alt = "Failed to load image";
    });

  if (message.caption) {
    const cap = document.createElement("div");
    cap.className = "message-caption";
    cap.textContent = message.caption;
    bubble.appendChild(cap);
  }
}

function buildVoiceContent(bubble, message) {
  const card = document.createElement("div");
  card.className = "voice-card";

  const top = document.createElement("div");
  top.className = "voice-card-top";

  const iconWrap = document.createElement("div");
  iconWrap.className = "voice-card-icon";
  const iconSpan = document.createElement("span");
  iconSpan.className = "icon";
  iconSpan.setAttribute("data-icon", "mic");
  iconWrap.appendChild(iconSpan);

  const copy = document.createElement("div");
  copy.className = "voice-card-copy";
  const title = document.createElement("div");
  title.className = "voice-card-title";
  title.textContent = "Voice message";
  const subtitle = document.createElement("div");
  subtitle.className = "voice-card-subtitle";
  subtitle.textContent = formatTime(message.created_at || message.createdAt);
  copy.appendChild(title);
  copy.appendChild(subtitle);

  top.appendChild(iconWrap);
  top.appendChild(copy);

  const audio = document.createElement("audio");
  audio.className = "voice-players";
  audio.controls = true;
  audio.preload = "metadata";

  card.appendChild(top);
  card.appendChild(audio);
  bubble.appendChild(card);

  applyIcons(bubble);

  loadAttachmentBlob(message)
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const source = document.createElement("source");
      source.src = blobUrl;
      source.type = blob.type || "audio/wav";
      audio.appendChild(source);
    })
    .catch((err) => {
      console.warn("mini-dock: voice load failed", err);
    });
}

function buildFileContent(bubble, message) {
  const card = document.createElement("div");
  card.className = "file-chip";

  const iconWrap = document.createElement("div");
  iconWrap.className = "file-icon";
  const iconSpan = document.createElement("span");
  iconSpan.className = "icon";
  iconSpan.setAttribute("data-icon", "file");
  iconWrap.appendChild(iconSpan);

  const main = document.createElement("div");
  main.style.minWidth = "0";
  const nameEl = document.createElement("div");
  nameEl.className = "file-name";
  nameEl.textContent = message.original_filename || "Attachment";
  const metaEl = document.createElement("div");
  metaEl.className = "file-meta";
  metaEl.textContent = formatFileSize(message.file_size);
  main.appendChild(nameEl);
  main.appendChild(metaEl);

  const downloadBtn = document.createElement("button");
  downloadBtn.type = "button";
  downloadBtn.className = "file-download-btn";
  downloadBtn.title = "Download";
  downloadBtn.setAttribute("aria-label", "Download attachment");
  const dlIcon = document.createElement("span");
  dlIcon.className = "icon";
  dlIcon.setAttribute("data-icon", "download");
  downloadBtn.appendChild(dlIcon);

  downloadBtn.addEventListener("click", async () => {
    try {
      const blob = await loadAttachmentBlob(message);
      await saveBlobToDownloads(blob, attachmentFilename(message));
    } catch (err) {
      console.error("mini-dock: download failed", err);
      showToast("Download failed", "error");
    }
  });

  card.appendChild(iconWrap);
  card.appendChild(main);
  card.appendChild(downloadBtn);
  bubble.appendChild(card);

  applyIcons(bubble);

  if (message.caption) {
    const cap = document.createElement("div");
    cap.className = "message-caption";
    cap.textContent = message.caption;
    bubble.appendChild(cap);
  }
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------
// Mini image viewer — a lightweight overlay so users can tap to enlarge
// an image without leaving the mini window.
// ---------------------------------------------------------------------

let miniViewerOverlay = null;

function openMiniImageViewer(src, altText = "Image") {
  closeMiniImageViewer();

  const overlay = document.createElement("div");
  overlay.className = "mini-image-viewer";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Image preview");

  const close = document.createElement("button");
  close.type = "button";
  close.className = "mini-image-viewer-close";
  close.title = "Close";
  close.setAttribute("aria-label", "Close");
  close.innerHTML = '<span class="icon" data-icon="close"></span>';

  const img = document.createElement("img");
  img.className = "mini-image-viewer-img";
  img.src = src;
  img.alt = altText;

  overlay.appendChild(close);
  overlay.appendChild(img);
  els.window.appendChild(overlay);
  applyIcons(overlay);

  close.addEventListener("click", closeMiniImageViewer);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeMiniImageViewer();
  });

  miniViewerOverlay = overlay;
}

function closeMiniImageViewer() {
  if (!miniViewerOverlay) return;
  miniViewerOverlay.remove();
  miniViewerOverlay = null;
}

// ---------------------------------------------------------------------
// Scrolling
// ---------------------------------------------------------------------

function scrollMessagesToBottom() {
  scheduleScrollToBottom();
}

function isScrolledNearBottom() {
  const area = els.messagesScroll;
  if (!area) return true;
  return area.scrollHeight - area.scrollTop - area.clientHeight < 80;
}

async function pollActiveConversation() {
  ensureCurrentUser();
  if (!activeConversationId || sending) return;

  try {
    const messages = await getMessages(activeConversationId);
    const list = normalizeMiniMessages(messages);

    // Determine which messages are new.
    const newMessages = list.filter((m) => {
      return m.id && !renderedMessageIds.has(m.id);
    });

    if (newMessages.length === 0) return;

    const wasNearBottom = isScrolledNearBottom();

    for (const message of newMessages) {
      appendMessage(message, { animate: true });
    }

    if (wasNearBottom) scheduleScrollToBottom();
    markConversationRead(activeConversationId).catch(() => {});
  } catch (err) {
    console.warn("mini-dock: poll failed", err);
  }
}

// ---------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------

async function handleSend() {
  ensureCurrentUser();
  const text = els.input.value.trim();
  if (!text || !activeConversationId || sending) return;

  sending = true;
  els.sendBtn.disabled = true;
  els.sendBtn.classList.add("sending");

  try {
    const response = await sendMessage(activeConversationId, text);
    const optimistic = normalizeMiniMessage({
      ...response,
      sender: "self",
      sender_id: response?.sender_id ?? currentUser?.id,
      sender_username: response?.sender_username ?? currentUser?.username,
    });
    appendMessage(optimistic, { animate: true });
    scheduleScrollToBottom();
    els.input.value = "";
    autoResizeInput();
    await loadMessages({ scrollToBottom: true });
    scheduleScrollToBottom();
    markConversationRead(activeConversationId).catch(() => {});
  } catch (err) {
    console.error("mini-dock: send failed", err);
    showToast(err?.message || "Failed to send message", "error");
  } finally {
    sending = false;
    els.sendBtn.classList.remove("sending");
    els.sendBtn.disabled = false;
    els.input.focus();
  }
}

els.sendBtn.addEventListener("click", handleSend);

els.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
});

els.input.addEventListener("input", autoResizeInput);

function autoResizeInput() {
  const el = els.input;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 110)}px`;
}

els.attachBtn.addEventListener("click", () => {
  if (!activeConversationId) return;
  els.attachmentInput.click();
});

els.attachmentInput.addEventListener("change", async () => {
  ensureCurrentUser();
  const file = els.attachmentInput.files?.[0];
  els.attachmentInput.value = "";
  if (!file || !activeConversationId) return;

  sending = true;
  els.sendBtn.disabled = true;
  els.sendBtn.classList.add("sending");

  try {
    const response = await sendAttachment(activeConversationId, file);
    const optimistic = normalizeMiniMessage({
      ...response,
      sender: "self",
      sender_id: response?.sender_id ?? currentUser?.id,
      sender_username: response?.sender_username ?? currentUser?.username,
    });
    appendMessage(optimistic, { animate: true });
    scheduleScrollToBottom();
    await loadMessages({ scrollToBottom: true });
    scheduleScrollToBottom();
    markConversationRead(activeConversationId).catch(() => {});
  } catch (err) {
    console.error("mini-dock: file send failed", err);
    showToast(err?.message || "Failed to send file", "error");
  } finally {
    sending = false;
    els.sendBtn.classList.remove("sending");
    els.sendBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------
// Window chrome
// ---------------------------------------------------------------------

els.maximizeBtn.addEventListener("click", () => {
  // "Maximize" = open the full main window at the chat page.
  const bridge = getBridge();
  if (bridge?.restore_with_page) {
    bridge.restore_with_page("chat");
  } else if (bridge?.exit_compact_mode) {
    bridge.exit_compact_mode();
  }
});

els.minimizeBtn.addEventListener("click", () => {
  // "Minimize" = true OS-level minimize of the mini window.
  const bridge = getBridge();
  if (bridge?.minimize_mini_window) {
    bridge.minimize_mini_window();
  } else if (bridge?.exit_compact_mode) {
    // Fallback for older bridges without minimize_mini_window.
    bridge.exit_compact_mode();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (miniViewerOverlay) {
      closeMiniImageViewer();
      return;
    }
    if (activeConversationId) {
      showListView();
    } else {
      getBridge()?.minimize_mini_window?.() ||
        getBridge()?.exit_compact_mode?.();
    }
  }
});

// Pause polling when the window is hidden — avoids burning CPU/battery
// and prevents the backend from being hammered while the user is away.
document.addEventListener("visibilitychange", () => {
  windowVisible = !document.hidden;
  if (windowVisible) {
    // On refocus, immediately catch up.
    if (activeConversationId) {
      pollActiveConversation();
    } else if (isAuthenticated()) {
      loadConversationList({ initial: false });
    }
  }
});

window.addEventListener("blur", () => {
  // Treat blur as "likely hidden" too — pywebview doesn't always emit
  // visibilitychange reliably across backends.
  windowVisible = false;
});

window.addEventListener("focus", () => {
  windowVisible = true;
  if (activeConversationId) {
    pollActiveConversation();
  }
});

window.addEventListener("beforeunload", () => {
  if (listPollTimer) clearInterval(listPollTimer);
  if (messagePollTimer) clearInterval(messagePollTimer);
  if (authWatchTimer) clearInterval(authWatchTimer);
  if (toastTimer) clearTimeout(toastTimer);
});

init();