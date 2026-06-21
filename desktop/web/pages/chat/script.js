import {
  getConversations,
  getMessages,
  sendMessage
} from "../../services/dm.js";

const state = {
  activeThreadId: null,
  threadFilter: "all",
  chatSearch: "",
  convoSearch: "",
  menuOpen: false,
  infoOpen: false,
  threads: []
};

const threadList = document.getElementById("thread-list");
const chatSearch = document.getElementById("chat-search");
const filterButtons = Array.from(document.querySelectorAll(".filter-btn"));
const messagesScroll = document.getElementById("messages-scroll");
const dayChip = document.getElementById("day-chip");
const conversationPane = document.getElementById("conversation-pane");
const conversationContent = document.getElementById("conversation-content");
const conversationEmptyState = document.getElementById("conversation-empty-state");
const conversationEmptyTitle = document.getElementById("conversation-empty-title");
const conversationEmptyCopy = document.getElementById("conversation-empty-copy");
const emptyStateNewChat = document.getElementById("new-chat-btn");
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
  back: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6"></path></svg>`
};

function activeThread() {
  return state.threads.find((thread) => thread.id === state.activeThreadId) || null;
}

function escapeHTML(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}


function requestNewChat() {
  window.parent?.postMessage({ type: "new-chat" }, "*");
  window.dispatchEvent(new CustomEvent("vagmi:new-chat"));
}

function openConversationView() {
  conversationPane.classList.remove("is-empty");
  conversationContent.hidden = false;
  conversationEmptyState.hidden = true;
}

function showConversationEmptyState(mode = "default") {
  conversationPane.classList.add("is-empty");
  conversationContent.hidden = true;
  conversationEmptyState.hidden = false;

  menuPopover.classList.add("hidden");
  infoDrawer.classList.add("hidden");
  state.menuOpen = false;
  state.infoOpen = false;
  conversationSearchRow.classList.add("hidden");
  state.convoSearch = "";
  conversationSearch.value = "";

  if (mode === "no-threads") {
    conversationEmptyTitle.textContent = "No chat selected";
    conversationEmptyCopy.textContent = "No conversations have been created yet. Start a new chat to begin messaging.";
    emptyStateNewChat.textContent = "New chat";
  } else {
    conversationEmptyTitle.textContent = "No chat selected";
    conversationEmptyCopy.textContent = "Choose a conversation from the left or start a new chat.";
    emptyStateNewChat.textContent = "New chat";
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

function iconForPreview(type) {
  if (type === "IMAGE") return "imageSmall";
  if (type === "FILE") return "file";
  return null;
}

function previewText(thread) {
  if (thread.lastMessageType === "IMAGE") return "Image";
  if (thread.lastMessageType === "FILE") return thread.lastMessage;
  return thread.lastMessage || "No messages yet";
}

function renderThreads() {
  const filterTerm = state.chatSearch.trim().toLowerCase();

  const filteredThreads = state.threads.filter((thread) => {
    const matchesKind = state.threadFilter === "all" || thread.kind === state.threadFilter;
    const matchesSearch =
      thread.title.toLowerCase().includes(filterTerm) ||
      (thread.lastMessage || "").toLowerCase().includes(filterTerm);
    return matchesKind && matchesSearch;
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
    item.className = "thread-item" + (thread.id === state.activeThreadId ? " active" : "");
    item.dataset.threadId = thread.id;
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
    item.addEventListener("click", () => openThread(thread.id));
    threadList.appendChild(item);
  });
}

function messageHTML(message) {
  const sideClass = message.sender === "self" ? "self" : "other";
  const senderLine = message.sender === "self" ? "" : `<div class="message-sender">${escapeHTML(message.senderName)}</div>`;

  if (message.type === "TEXT") {
    return `
      <div class="message-row ${sideClass}">
        <div class="message-bubble">
          ${senderLine ? `<div class="message-meta">${senderLine}</div>` : ""}
          <div class="message-text">${escapeHTML(message.text)}</div>
          <div class="message-time mono">${escapeHTML(message.time)}</div>
        </div>
      </div>
    `;
  }

  if (message.type === "IMAGE") {
    const imgSrc = message.file?.preview || "";
    return `
      <div class="message-row ${sideClass}">
        <div class="message-bubble">
          ${senderLine ? `<div class="message-meta">${senderLine}</div>` : ""}
          <div class="attachment-card image-card">
            <img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(message.file?.name || "Image")}" />
            ${message.caption ? `<div class="message-text">${escapeHTML(message.caption)}</div>` : ""}
          </div>
          <div class="message-time mono">${escapeHTML(message.time)}</div>
        </div>
      </div>
    `;
  }

  if (message.type === "FILE") {
    return `
      <div class="message-row ${sideClass}">
        <div class="message-bubble">
          ${senderLine ? `<div class="message-meta">${senderLine}</div>` : ""}
          <div class="file-chip">
            <div class="file-icon">${iconMap.file}</div>
            <div class="file-text">
              <div class="file-name">${escapeHTML(message.file?.name || "File")}</div>
              <div class="file-meta">${escapeHTML(message.file?.size || "")}</div>
            </div>
          </div>
          <div class="message-time mono">${escapeHTML(message.time)}</div>
        </div>
      </div>
    `;
  }

  return "";
}

function renderMessages(thread) {
  if (!thread) {
    messagesScroll.innerHTML = "";
    dayChip.hidden = true;
    return;
  }

  const messages = thread.messages.filter((msg) => msg.type !== "DAY");
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

  dayChip.hidden = false;
  dayChip.textContent = "Today";
  const term = state.convoSearch.trim().toLowerCase();

  const filtered = !term
    ? messages
    : messages.filter((msg) => {
        const haystack = [
          msg.senderName || "",
          msg.text || "",
          msg.caption || "",
          msg.file?.name || "",
          msg.file?.size || ""
        ].join(" ").toLowerCase();
        return haystack.includes(term);
      });

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
    return;
  }

  messagesScroll.innerHTML = filtered.map(messageHTML).join("");
  requestAnimationFrame(() => {
    messagesScroll.scrollTop = messagesScroll.scrollHeight;
  });
}

function updateConversationMeta(thread) {
  if (!thread) return;
  conversationTitle.textContent = thread.title || "Conversation";
  conversationStatus.textContent = thread.status || "Online";
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
  state.menuOpen = false;
  state.infoOpen = false;
  conversationSearchRow.classList.add("hidden");
}

function setActiveThread(threadId) {
  state.activeThreadId = threadId;
  const thread = activeThread();
  if (thread) {
    openConversationView();
    updateConversationMeta(thread);
    updateInfoDrawer(thread);
    renderMessages(thread);
  } else {
    showConversationEmptyState(state.threads.length === 0 ? "no-threads" : "default");
  }
  renderThreads();
}

function openThread(threadId) {
  state.activeThreadId = threadId;
  const thread = activeThread();
  if (!thread) return;

  thread.unread = 0;
  state.convoSearch = "";
  conversationSearch.value = "";
  closeOverlays();
  openConversationView();
  updateConversationMeta(thread);
  updateInfoDrawer(thread);
  renderThreads();
  loadMessages(threadId);
}

function setComposerText(text) {
  inputField.value = text;
  inputField.dispatchEvent(new Event("input"));
}

function appendLocalThreadMessage(thread, payload) {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const message = {
    id: `local-${Date.now()}`,
    sender: "self",
    senderName: currentUser?.username || "You",
    time,
    ...payload
  };

  thread.messages.push(message);
  thread.lastMessageTime = time;

  if (payload.type === "TEXT") {
    thread.lastMessage = payload.text;
    thread.lastMessageType = "TEXT";
  } else if (payload.type === "IMAGE") {
    thread.lastMessage = "Image";
    thread.lastMessageType = "IMAGE";
  } else if (payload.type === "FILE") {
    thread.lastMessage = payload.file.name;
    thread.lastMessageType = "FILE";
  }

  thread.unread = 0;
  updateConversationMeta(thread);
  renderThreads();
  renderMessages(thread);
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
    await loadMessages(thread.id);

    thread.lastMessage = text;
    thread.lastMessageType = "TEXT";
    thread.lastMessageTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    thread.unread = 0;

    renderThreads();
  } catch (error) {
    console.error("Message send failed", error);
    setComposerText(text);
  }
}

function handleAttachment(file, forceType = null) {
  const thread = activeThread();
  if (!thread) return;

  const type = forceType || (file.type.startsWith("image/") ? "IMAGE" : "FILE");

  if (type === "IMAGE") {
    const preview = URL.createObjectURL(file);
    appendLocalThreadMessage(thread, {
      type: "IMAGE",
      file: { name: file.name, size: formatFileSize(file.size), preview },
      caption: file.name
    });
    return;
  }

  appendLocalThreadMessage(thread, {
    type: "FILE",
    file: { name: file.name, size: formatFileSize(file.size) }
  });
}

async function loadConversations() {
  const conversations = await getConversations();
  console.log("Backend conversations:", conversations);

  state.threads = (conversations || []).map((conversation) => ({
    id: conversation.conversation_id,
    kind: conversation.kind || "dm",
    title: conversation.username || "Conversation",
    initials: (conversation.username || "VA").substring(0, 2).toUpperCase(),
    status: conversation.status || "Direct Message",
    unread: 0,
    lastMessage: conversation.last_message || "",
    lastMessageType: conversation.last_message_type || (conversation.last_message ? "TEXT" : "TEXT"),
    lastMessageTime: conversation.last_message_time || "",
    members: [conversation.username || "User"],
    messages: []
  }));

  state.activeThreadId = null;
  renderThreads();

  if (state.threads.length === 0) {
    showConversationEmptyState("no-threads");
  } else {
    showConversationEmptyState("default");
  }
}

async function loadMessages(conversationId) {
  try {
    const messages = await getMessages(conversationId);
    const thread = state.threads.find((t) => t.id === conversationId);
    if (!thread) return;

    thread.messages = (messages || []).map((message) => ({
      id: message.id,
      sender: message.sender_username === (currentUser?.username || "") ? "self" : "other",
      senderName: message.sender_username,
      type: message.message_type,
      text: message.message_text,
      time: new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }));

    updateConversationMeta(thread);
    updateInfoDrawer(thread);
    renderMessages(thread);
  } catch (error) {
    console.error("Failed loading messages", error);
  }
}

function currentSearchUpdate() {
  state.chatSearch = chatSearch.value;
  renderThreads();
}

function closeConversationAndShowEmptyState() {
  state.activeThreadId = null;
  state.convoSearch = "";
  conversationSearch.value = "";
  closeOverlays();
  renderThreads();
  showConversationEmptyState(state.threads.length === 0 ? "no-threads" : "default");
}

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

sendBtn.addEventListener("click", handleSend);
backBtn.addEventListener("click", closeConversationAndShowEmptyState);

attachBtn.addEventListener("click", () => fileInput.click());
imageBtn.addEventListener("click", () => imageInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) handleAttachment(file, "FILE");
  fileInput.value = "";
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (file) handleAttachment(file, "IMAGE");
  imageInput.value = "";
});

micBtn.addEventListener("click", () => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setComposerText("Voice input is not available in this browser.");
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    setComposerText(event.results[0][0].transcript);
  };
  recognition.onerror = () => {
    setComposerText("Voice input failed.");
  };
  recognition.start();
});

chatSearch.addEventListener("input", currentSearchUpdate);

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    filterButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    state.threadFilter = button.dataset.filter;
    renderThreads();
  });
});

searchToggle.addEventListener("click", () => {
  conversationSearchRow.classList.remove("hidden");
  conversationSearch.focus();
});

closeSearch.addEventListener("click", () => {
  conversationSearchRow.classList.add("hidden");
  state.convoSearch = "";
  conversationSearch.value = "";
  const thread = activeThread();
  if (thread) renderMessages(thread);
});

conversationSearch.addEventListener("input", () => {
  state.convoSearch = conversationSearch.value;
  const thread = activeThread();
  if (thread) renderMessages(thread);
});

menuToggle.addEventListener("click", (event) => {
  event.stopPropagation();
  state.menuOpen = !state.menuOpen;
  menuPopover.classList.toggle("hidden", !state.menuOpen);
});

document.addEventListener("click", () => {
  closeOverlays();
});

menuPopover.addEventListener("click", (event) => {
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

emptyStateNewChat.addEventListener("click", () => {
  requestNewChat();
});

document.querySelectorAll("[data-icon]").forEach((el) => {
  const iconName = el.dataset.icon;
  el.innerHTML = iconMap[iconName] || "";
});

async function initialize() {
  try {
    await loadConversations();
    if (state.threads.length === 0) {
      showConversationEmptyState("no-threads");
    } else {
      showConversationEmptyState("default");
    }
  } catch (error) {
    console.error("Conversation load failed", error);
    showConversationEmptyState("no-threads");
  }
}

initialize();
