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

function currentThread() {
  return state.threads.find((thread) => thread.id === state.activeThreadId) || state.threads[0];
}

function updateConversationMeta(thread) {
  if (!thread) return;
  conversationTitle.textContent = thread.title;
  conversationStatus.textContent = thread.status;
  conversationAvatar.textContent = thread.initials;
  dayChip.textContent = thread.messages.find((msg) => msg.type === "DAY")?.time || "Today";
  document.getElementById("info-participants").textContent = thread.members.length;
  document.getElementById("info-type").textContent = thread.kind === "group" ? "Group" : "DM";
  document.getElementById("info-files").textContent = thread.messages.filter((msg) => msg.type === "FILE" || msg.type === "IMAGE").length;
}

function iconForPreview(type) {
  if (type === "IMAGE") return "imageSmall";
  if (type === "FILE") return "file";
  return null;
}

function previewText(thread) {
  if (thread.lastMessageType === "IMAGE") return "Image";
  if (thread.lastMessageType === "FILE") return thread.lastMessage;
  return thread.lastMessage;
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

function renderThreads() {
  const filterTerm = state.chatSearch.trim().toLowerCase();
  threadList.innerHTML = "";

  const filteredThreads = state.threads.filter((thread) => {
    const matchesKind = state.threadFilter === "all" || thread.kind === state.threadFilter;
    const matchesSearch =
      thread.title.toLowerCase().includes(filterTerm) ||
      (thread.lastMessage || "").toLowerCase().includes(filterTerm);
    return matchesKind && matchesSearch;
  });

  filteredThreads.forEach((thread) => {
    const item = document.createElement("button");
    item.className = "thread-item" + (thread.id === state.activeThreadId ? " active" : "");
    item.dataset.threadId = thread.id;
    item.innerHTML = `
      <div class="avatar">${thread.initials}</div>
      <div class="thread-meta">
        <div class="thread-title-row">
          <div class="thread-title">${escapeHTML(thread.title)}</div>
          <div class="thread-time mono">${escapeHTML(thread.lastMessageTime)}</div>
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
  if (message.type === "DAY") {
    return "";
  }

  const sideClass = message.sender === "self" ? "self" : "other";
  const senderLine = message.sender === "self" ? "" : `<div class="message-sender">${escapeHTML(message.senderName)}</div>`;

  if (message.type === "TEXT") {
    return `
      <div class="message-row ${sideClass}">
        <div class="message-bubble">
          <div class="message-meta">${senderLine || ""}</div>
          <div class="message-text">${escapeHTML(message.text)}</div>
          <div class="message-time mono">${escapeHTML(message.time)}</div>
        </div>
      </div>
    `;
  }

  if (message.type === "IMAGE") {
    const imgSrc = message.file.preview || "";
    return `
      <div class="message-row ${sideClass}">
        <div class="message-bubble">
          <div class="message-meta">${senderLine || ""}</div>
          <div class="attachment-card image-card">
            <img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(message.file.name)}" />
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
          <div class="message-meta">${senderLine || ""}</div>
          <div class="file-chip">
            <div class="file-icon">${iconMap.file}</div>
            <div>
              <div class="file-name">${escapeHTML(message.file.name)}</div>
              <div class="file-meta">${escapeHTML(message.file.size)}</div>
            </div>
          </div>
          <div class="message-time mono">${escapeHTML(message.time)}</div>
        </div>
      </div>
    `;
  }

  return "";
}

function filterThreadMessages(thread) {
  const term = state.convoSearch.trim().toLowerCase();
  const messages = thread.messages.filter((msg) => msg.type !== "DAY");
  if (!term) return messages;
  return messages.filter((msg) => {
    const target = [
      msg.senderName || "",
      msg.text || "",
      msg.caption || "",
      msg.file?.name || "",
      msg.file?.size || ""
    ].join(" ").toLowerCase();
    return target.includes(term);
  });
}

function renderMessages(thread) {
  const filtered = filterThreadMessages(thread);
  messagesScroll.innerHTML = filtered.map(messageHTML).join("");
  requestAnimationFrame(() => {
    messagesScroll.scrollTop = messagesScroll.scrollHeight;
  });
}

function closeOverlays() {
  menuPopover.classList.add("hidden");
  infoDrawer.classList.add("hidden");
  state.menuOpen = false;
  state.infoOpen = false;
}

function updateInfoDrawer(thread) {
  document.getElementById("info-participants").textContent = thread.members.length;
  document.getElementById("info-type").textContent = thread.kind === "group" ? "Group" : "DM";
  document.getElementById("info-files").textContent = thread.messages.filter((msg) => msg.type === "FILE" || msg.type === "IMAGE").length;
}

function openThread(threadId) {
  state.activeThreadId = threadId;
  const thread = currentThread();
  if (!thread) return;
  thread.unread = 0;
  state.convoSearch = "";
  conversationSearch.value = "";
  conversationSearchRow.classList.add("hidden");
  document.querySelector(".conversation-pane").classList.remove("empty-chat-state");
  closeOverlays();
  updateConversationMeta(thread);
  updateInfoDrawer(thread);
  renderThreads();
  loadMessages(threadId);
}

function rerenderActiveConversation() {
  const thread = currentThread();
  if (!thread) return;
  updateConversationMeta(thread);
  updateInfoDrawer(thread);
  renderMessages(thread);
}

function appendSelfMessage(payload) {
  const thread = currentThread();
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const message = {
    id: `local-${Date.now()}`,
    sender: "self",
    senderName: "Amruthesh",
    time,
    ...payload,
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
  closeOverlays();
  renderThreads();
  rerenderActiveConversation();
}
async function handleSend() {

    const text =
        inputField.value.trim();

    if (!text) {
        return;
    }

    const conversationId =
        state.activeThreadId;

    try {

        await sendMessage(
            conversationId,
            text
        );

        inputField.value = "";

        inputField.style.height =
            "44px";

        await loadMessages(
            conversationId
        );
          const thread =
      currentThread();

  if (thread) {

      thread.lastMessage =
          text;

      thread.lastMessageType =
          "TEXT";

      thread.lastMessageTime =
          new Date()
          .toLocaleTimeString(
              [],
              {
                  hour: "2-digit",
                  minute: "2-digit"
              }
          );
  }

        renderThreads();

    } catch(error) {

        console.error(
            "Message send failed",
            error
        );
    }
}
function handleAttachment(file, forceType = null) {
  const type = forceType || (file.type.startsWith("image/") ? "IMAGE" : "FILE");
  if (type === "IMAGE") {
    const preview = URL.createObjectURL(file);
    appendSelfMessage({
      type: "IMAGE",
      file: { name: file.name, size: formatFileSize(file.size), preview },
      caption: file.name,
    });
    return;
  }

  appendSelfMessage({
    type: "FILE",
    file: { name: file.name, size: formatFileSize(file.size) }
  });
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
backBtn.addEventListener("click", () => {
  state.activeThreadId = null;
  conversationSearchRow.classList.add("hidden");
  closeOverlays();
  renderThreads();
  document.querySelector(".conversation-pane").classList.add("empty-chat-state");
  threadList.scrollTo({ top: 0, behavior: "smooth" });
});

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
    inputField.value = "Voice input not available in this preview.";
    inputField.dispatchEvent(new Event("input"));
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    inputField.value = event.results[0][0].transcript;
    inputField.dispatchEvent(new Event("input"));
  };
  recognition.onerror = () => {
    inputField.value = "Voice input failed.";
    inputField.dispatchEvent(new Event("input"));
  };
  recognition.start();
});

chatSearch.addEventListener("input", () => {
  state.chatSearch = chatSearch.value;
  renderThreads();
});

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
  rerenderActiveConversation();
});

conversationSearch.addEventListener("input", () => {
  state.convoSearch = conversationSearch.value;
  rerenderActiveConversation();
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
    const thread = currentThread();
    thread.messages = thread.messages.filter((msg) => msg.type === "DAY");
    thread.lastMessage = "";
    thread.lastMessageType = "TEXT";
    renderThreads();
    rerenderActiveConversation();
  }

  if (action === "info") {
    state.infoOpen = !state.infoOpen;
    infoDrawer.classList.toggle("hidden", !state.infoOpen);
  }
});

document.querySelectorAll("[data-icon]").forEach((el) => {
  const iconName = el.dataset.icon;
  el.innerHTML = iconMap[iconName] || "";
});

async function initialize() {

    try {

        await loadConversations();

        renderThreads();

        if (state.threads.length > 0) {
            start();
            await loadMessages(
              state.activeThreadId
            );  
        }

    }
    catch(error) {

        console.error(
            "Conversation load failed",
            error
        );
    }
}
async function loadConversations() {

    const conversations =
        await getConversations();

    console.log(
        "Backend conversations:",
        conversations
    );

    if (
        !conversations ||
        conversations.length === 0
    ) {

        console.log(
            "No conversations yet"
        );

        renderThreads();
        return;
    }

    state.threads =
        conversations.map(
            conversation => ({

                id:
                    conversation.conversation_id,

                kind: "dm",

                title:
                    conversation.username,

                initials:
                    conversation.username
                        .substring(0,2)
                        .toUpperCase(),

                status: "Direct Message",

                unread: 0,

                lastMessage:
                    conversation.last_message
                    || "",

                lastMessageType:
                    "TEXT",

                lastMessageTime:
                    conversation.last_message_time
                        ? new Date(
                            conversation.last_message_time
                          ).toLocaleTimeString(
                              [],
                              {
                                  hour: "2-digit",
                                  minute: "2-digit"
                              }
                          )
                        : "",

                members: [
                    conversation.username
                ],

                messages: []
            })
        );

    state.activeThreadId =
        state.threads[0]?.id;

    
}
async function loadMessages(
    conversationId
) {

    try {

        const messages =
            await getMessages(
                conversationId
            );

        const thread =
            state.threads.find(
                t => t.id === conversationId
            );

        if (!thread) {
            return;
        }

        thread.messages =
            messages.map(
                message => ({
                    id: message.id,
                    sender:
                        message.sender_username ===
                        localStorage.getItem(
                            "username"
                        )
                            ? "self"
                            : "other",

                    senderName:
                        message.sender_username,

                    type:
                        message.message_type,

                    text:
                        message.message_text,

                    time:
                        new Date(
                            message.created_at
                        ).toLocaleTimeString(
                            [],
                            {
                                hour: "2-digit",
                                minute: "2-digit"
                            }
                        )
                })
            );

        renderMessages(
            thread
        );

    } catch(error) {

        console.error(
            "Failed loading messages",
            error
        );
    }
}

function start() {

  const thread = currentThread();

  if (!thread) {
    renderThreads();
    return;
  }

  updateConversationMeta(thread);
  updateInfoDrawer(thread);
  renderThreads();
  renderMessages(thread);

  thread.unread = 0;

  renderThreads();
}

// start();
initialize();