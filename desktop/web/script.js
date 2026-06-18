const state = {
  page: "chat",
  sidebarCollapsed: false,
  chatFilter: "all",
  activeThreadId: "dm-srujan",
  chatSearch: "",
  threadSearch: "",
  threadSearchOpen: false,
  menuOpen: false,
  infoOpen: false,
  newChatOpen: false,
  newChatSearch: "",
  voiceActive: false,
  threads: [
    {
      id: "dm-srujan",
      kind: "dm",
      title: "Srujan",
      initials: "SJ",
      status: "online",
      unread: 2,
      lastMessage: "Could you review the retrieval report?",
      lastMessageType: "TEXT",
      lastMessageTime: "09:42",
      members: ["Amruthesh", "Srujan"],
      messages: [
        { id: "m0", sender: "system", senderName: "", type: "DAY", time: "Today" },
        {
          id: "m1",
          sender: "other",
          senderName: "Srujan",
          type: "TEXT",
          time: "09:36",
          text: "Hi Amruthesh, can you share the current architecture?"
        },
        {
          id: "m2",
          sender: "self",
          senderName: "Amruthesh",
          type: "TEXT",
          time: "09:33",
          text: "Hi Srujan, can you share the system architecture?"
        },
        {
          id: "m3",
          sender: "other",
          senderName: "Srujan",
          type: "IMAGE",
          time: "09:35",
          file: {
            name: "system-architecture.png",
            size: "1.8 MB",
            preview: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=80"
          },
          caption: "System Architecture"
        },
        {
          id: "m4",
          sender: "other",
          senderName: "Srujan",
          type: "FILE",
          time: "09:40",
          file: {
            name: "week3-summary.pdf",
            size: "1.2 MB"
          }
        }
      ]
    },
    {
      id: "dm-ravi",
      kind: "dm",
      title: "Ravi",
      initials: "RV",
      status: "away",
      unread: 0,
      lastMessage: "Image shared",
      lastMessageType: "IMAGE",
      lastMessageTime: "08:15",
      members: ["Amruthesh", "Ravi"],
      messages: [
        { id: "r0", sender: "system", senderName: "", type: "DAY", time: "Today" },
        {
          id: "r1",
          sender: "other",
          senderName: "Ravi",
          type: "TEXT",
          time: "08:10",
          text: "I updated the draft."
        },
        {
          id: "r2",
          sender: "other",
          senderName: "Ravi",
          type: "IMAGE",
          time: "08:15",
          file: {
            name: "retrieval-preview.png",
            size: "980 KB",
            preview: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80"
          }
        }
      ]
    },
    {
      id: "dm-meera",
      kind: "dm",
      title: "Meera",
      initials: "MR",
      status: "online",
      unread: 1,
      lastMessage: "meeting-notes.docx",
      lastMessageType: "FILE",
      lastMessageTime: "Yesterday",
      members: ["Amruthesh", "Meera"],
      messages: [
        { id: "me0", sender: "system", senderName: "", type: "DAY", time: "Yesterday" },
        {
          id: "me1",
          sender: "other",
          senderName: "Meera",
          type: "FILE",
          time: "Yesterday",
          file: {
            name: "meeting-notes.docx",
            size: "42 KB"
          }
        }
      ]
    },
    {
      id: "group-ade",
      kind: "group",
      title: "Team ADE",
      initials: "TA",
      status: "group",
      unread: 3,
      lastMessage: "Please add the diagram",
      lastMessageType: "TEXT",
      lastMessageTime: "10:01",
      members: ["Amruthesh", "Srujan", "Ravi", "Meera"],
      messages: [
        { id: "g0", sender: "system", senderName: "", type: "DAY", time: "Today" },
        {
          id: "g1",
          sender: "other",
          senderName: "Ravi",
          type: "TEXT",
          time: "09:55",
          text: "Please add the diagram."
        },
        {
          id: "g2",
          sender: "other",
          senderName: "Meera",
          type: "TEXT",
          time: "09:56",
          text: "I uploaded the latest doc."
        },
        {
          id: "g3",
          sender: "self",
          senderName: "Amruthesh",
          type: "TEXT",
          time: "10:01",
          text: "I’ll add it once the layout is final."
        }
      ]
    }
  ],
  contacts: [
    { id: "u-srujan", name: "Srujan", initials: "SJ", kind: "dm" },
    { id: "u-ravi", name: "Ravi", initials: "RV", kind: "dm" },
    { id: "u-meera", name: "Meera", initials: "MR", kind: "dm" },
    { id: "u-team", name: "Team ADE", initials: "TA", kind: "group" }
  ],
  toastTimer: null
};

const els = {};
const ESCAPE = /[&<>"']/g;

function icon(name) {
  const icons = {
    "chevron-left": `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`,
    home: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10.8V20h11V10.8"/><path d="M10 20v-5h4v5"/></svg>`,
    intelligence: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M6.5 7h11"/><path d="M6.5 12h11"/><path d="M6.5 17h11"/><path d="M9 7v10"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M4.5 5.5h15A1.5 1.5 0 0 1 21 7v8a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3v-3H4.5A1.5 1.5 0 0 1 3 15V7a1.5 1.5 0 0 1 1.5-1.5Z"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19 12h2M3 12h2M12 3v2M12 19v2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M17.8 6.2l-1.4 1.4M7.6 16.4l-1.4 1.4"/></svg>`,
    compose: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M4 20h4l11-11a2.2 2.2 0 0 0-3.1-3.1L4.9 16.9 4 20Z"/><path d="M13.5 7.5l3 3"/></svg>`,
    search: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><circle cx="11" cy="11" r="6.8"/><path d="M20 20l-3.4-3.4"/></svg>`,
    more: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M5 12h0M12 12h0M19 12h0"/></svg>`,
    close: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    attach: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M8 12.5l6.4-6.4a3 3 0 1 1 4.2 4.2L9.7 19.2a5 5 0 0 1-7.1-7.1l8.2-8.2"/></svg>`,
    image: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2.8"/><circle cx="9" cy="10" r="1.4"/><path d="M6 17l4-4 3 3 3-4 2 2"/></svg>`,
    mic: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><rect x="9" y="4" width="6" height="11" rx="3"/><path d="M6 11.5a6 6 0 0 0 12 0M12 17v3"/></svg>`,
    send: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M20 4L3 11l7 2.5L12.5 21 20 4Z"/></svg>`,
    file: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9A2.5 2.5 0 0 0 19 18.5V8l-5-5Z"/><path d="M14 3v5h5"/></svg>`,
    info: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><circle cx="12" cy="12" r="8.3"/><path d="M12 10.8v5"/><path d="M12 7.7h0"/></svg>`,
    clear: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
    group: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M8 11.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M16 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/><path d="M3.8 19a4.2 4.2 0 0 1 8.4 0"/><path d="M13.5 19a4 4 0 0 1 6.7-2.9"/></svg>`,
    dm: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><path d="M4.5 6.5h15A1.5 1.5 0 0 1 21 8v8a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3v-3H4.5A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5Z"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" class="icon" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><path d="M12 8.2V12l2.6 1.8"/></svg>`
  };
  return icons[name] || "";
}

function escapeHtml(value) {
  return String(value).replace(ESCAPE, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return ch;
    }
  });
}

function byId(id) {
  return document.getElementById(id);
}

function getThread(id) {
  return state.threads.find((thread) => thread.id === id) || null;
}

function getActiveThread() {
  return getThread(state.activeThreadId);
}

function normalize(value) {
  return String(value || "").toLowerCase();
}

function threadPreview(thread) {
  if (!thread.lastMessage) return "No messages yet";
  if (thread.lastMessageType === "IMAGE") return "Image";
  if (thread.lastMessageType === "FILE") return thread.lastMessage;
  return thread.lastMessage;
}

function filteredThreads() {
  const query = normalize(state.chatSearch.trim());
  return state.threads.filter((thread) => {
    const matchesFilter =
      state.chatFilter === "all" ||
      thread.kind === state.chatFilter;
    const haystack = normalize([
      thread.title,
      thread.lastMessage,
      thread.lastMessageType,
      thread.kind
    ].join(" "));
    const matchesSearch = !query || haystack.includes(query);
    return matchesFilter && matchesSearch;
  });
}

function filteredMessages(thread) {
  const query = normalize(state.threadSearch.trim());
  if (!thread) return [];
  if (!query) return thread.messages;
  return thread.messages.filter((message) => {
    if (message.type === "DAY") return true;
    const parts = [
      message.text || "",
      message.senderName || "",
      message.caption || "",
      message.file?.name || "",
      message.file?.size || "",
      message.type || ""
    ].join(" ");
    return normalize(parts).includes(query);
  });
}

function setPage(page) {
  state.page = page;
  document.body.setAttribute("data-page", page);
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });
  document.querySelectorAll(".page").forEach((pageEl) => {
    pageEl.classList.toggle("active", pageEl.dataset.pageView === page);
  });

  const map = {
    home: { title: "Home", kicker: "Secure workspace" },
    intelligence: { title: "Intelligence", kicker: "Document workspace" },
    chat: { title: "Chat", kicker: "Secure workspace" },
    settings: { title: "Settings", kicker: "Secure workspace" }
  };
  const current = map[page];
  byId("page-title").textContent = current.title;
  byId("page-kicker").textContent = current.kicker;

  closeThreadMenu();
  closeInfoDrawer();
  closeThreadSearch();
  closeNewChatModal();
}

function renderSidebar() {
  document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  byId("sidebar").classList.toggle("collapsed", state.sidebarCollapsed);
  const toggle = byId("sidebar-toggle");
  toggle.title = state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
  toggle.setAttribute("aria-label", toggle.title);
}

function renderThreadList() {
  const list = byId("thread-list");
  const items = filteredThreads();

  list.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "thread-empty";
    empty.style.height = "100%";
    empty.style.placeItems = "center";
    empty.style.alignContent = "center";
    empty.innerHTML = `
      <div class="empty-badge"><span class="mono">V</span></div>
      <h3 style="margin-top:8px;font-size:16px;">No chats found</h3>
      <p style="margin:0;color:var(--text-muted);font-size:12px;">Try a different search or filter.</p>
    `;
    list.appendChild(empty);
    return;
  }

  const template = byId("thread-item-template");

  items.forEach((thread) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.threadId = thread.id;
    node.classList.toggle("active", thread.id === state.activeThreadId);

    const avatar = node.querySelector(".thread-avatar");
    avatar.textContent = thread.initials;
    avatar.classList.add(thread.kind === "group" ? "group-avatar" : "dm-avatar");

    const presence = node.querySelector(".presence-dot");
    presence.classList.remove("online", "away");
    if (thread.status === "online") presence.classList.add("online");
    else if (thread.status === "away") presence.classList.add("away");

    node.querySelector(".thread-title-text").textContent = thread.title;
    node.querySelector(".thread-time").textContent = thread.lastMessageTime;
    node.querySelector(".thread-preview").textContent = threadPreview(thread);

    const badge = node.querySelector(".thread-badge");
    if (thread.unread > 0) {
      badge.textContent = thread.unread;
      badge.style.display = "inline-flex";
    } else {
      badge.textContent = "";
      badge.style.display = "none";
    }

    node.addEventListener("click", () => {
      selectThread(thread.id);
    });

    list.appendChild(node);
  });
}

function renderThreadHeader(thread) {
  if (!thread) return;

  byId("thread-avatar").textContent = thread.initials;
  byId("thread-name").textContent = thread.title;
  byId("thread-status").textContent = thread.kind === "group"
    ? `${thread.members.length} members`
    : thread.status === "online"
      ? "Online"
      : "Offline";
  byId("thread-status").previousElementSibling.classList.remove("online", "away");
  byId("thread-status").previousElementSibling.classList.add(
    thread.kind === "group" ? "online" : thread.status
  );

  byId("info-title").textContent = thread.title;
  byId("info-type").textContent = thread.kind === "group" ? "Group chat" : "Direct message";
  byId("info-shared").textContent = thread.messages.filter((m) => m.type === "IMAGE" || m.type === "FILE").length;

  const members = byId("info-members");
  members.innerHTML = "";
  thread.members.forEach((member) => {
    const pill = document.createElement("span");
    pill.className = "member-pill";
    pill.textContent = member;
    members.appendChild(pill);
  });
}

function renderMessages() {
  const thread = getActiveThread();
  const container = byId("thread-messages");

  container.innerHTML = "";

  if (!thread) {
    return;
  }

  const messages = filteredMessages(thread);
  const template = byId("message-template");

  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "thread-empty";
    empty.style.height = "100%";
    empty.style.alignContent = "center";
    empty.innerHTML = `
      <div class="empty-badge"><span class="mono">V</span></div>
      <h3 style="margin-top:8px;font-size:16px;">No matching messages</h3>
      <p style="margin:0;color:var(--text-muted);font-size:12px;">Try another search term.</p>
    `;
    container.appendChild(empty);
    return;
  }

  messages.forEach((message) => {
    if (message.type === "DAY") {
      const pill = document.createElement("div");
      pill.className = "day-pill";
      pill.textContent = message.time;
      container.appendChild(pill);
      return;
    }

    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.add(message.sender === "self" ? "self" : "other");
    node.querySelector(".message-sender").textContent = message.senderName || "";
    node.querySelector(".message-time").textContent = message.time;

    const bubble = node.querySelector(".message-bubble");
    bubble.innerHTML = renderMessageBubble(message);
    container.appendChild(node);
  });

  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}

function renderMessageBubble(message) {
  const ticks = `
    <span class="message-ticks" aria-hidden="true">
      <span>✓</span><span>✓</span>
    </span>
  `;

  if (message.type === "IMAGE") {
    return `
      <div class="image-message">
        <img class="image-preview" src="${escapeHtml(message.file.preview)}" alt="${escapeHtml(message.file.name)}" />
        ${message.caption ? `<div class="image-caption">${escapeHtml(message.caption)}</div>` : ""}
        <div class="file-sub mono" style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
          <span>${escapeHtml(message.file.name)}</span>
          <span>${escapeHtml(message.file.size)}</span>
        </div>
        ${message.sender === "self" ? `<div style="margin-top:6px;display:flex;justify-content:flex-end;">${ticks}</div>` : ""}
      </div>
    `;
  }

  if (message.type === "FILE") {
    return `
      <div class="message-file">
        <div class="file-chip">${icon("file")}</div>
        <div class="file-meta">
          <div class="file-name">${escapeHtml(message.file.name)}</div>
          <div class="file-sub mono">${escapeHtml(message.file.size)}</div>
        </div>
      </div>
      ${message.sender === "self" ? `<div style="margin-top:8px;display:flex;justify-content:flex-end;">${ticks}</div>` : ""}
    `;
  }

  return `
    <div class="message-text">${escapeHtml(message.text)}</div>
    <div style="margin-top:8px;display:flex;justify-content:${message.sender === "self" ? "flex-end" : "flex-start"};">
      ${message.sender === "self" ? ticks : `<span class="message-ticks" aria-hidden="true" style="opacity:.0">✓✓</span>`}
    </div>
  `;
}

function selectThread(threadId) {
  state.activeThreadId = threadId;
  state.infoOpen = false;
  state.menuOpen = false;
  state.threadSearchOpen = false;
  state.threadSearch = "";
  byId("thread-search").value = "";

  document.querySelectorAll(".thread-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.threadId === threadId);
  });

  const thread = getActiveThread();
  if (!thread) return;
  renderThreadHeader(thread);
  byId("thread-empty").classList.add("hidden");
  byId("thread-shell").classList.remove("hidden");
  renderMessages();
  renderConversationChrome();
}

function renderConversationChrome() {
  byId("thread-searchbar").classList.toggle("hidden", !state.threadSearchOpen);
  byId("thread-menu").classList.toggle("hidden", !state.menuOpen);
  byId("info-drawer").classList.toggle("hidden", !state.infoOpen);

  if (state.threadSearchOpen) {
    byId("thread-search").focus();
  }
}

function closeThreadMenu() {
  state.menuOpen = false;
  byId("thread-menu").classList.add("hidden");
}

function closeInfoDrawer() {
  state.infoOpen = false;
  byId("info-drawer").classList.add("hidden");
}

function closeThreadSearch() {
  state.threadSearchOpen = false;
  state.threadSearch = "";
  byId("thread-searchbar").classList.add("hidden");
  byId("thread-search").value = "";
}

function updateMessageInputHeight() {
  const input = byId("message-input");
  input.style.height = "0px";
  input.style.height = Math.min(input.scrollHeight, 126) + "px";
}

function makeFilePayload(file, mode) {
  const isImage = /^image\//.test(file.type) || mode === "image";
  return new Promise((resolve) => {
    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => resolve({
        type: "IMAGE",
        text: "",
        caption: "",
        file: {
          name: file.name,
          size: formatBytes(file.size),
          preview: reader.result
        }
      });
      reader.readAsDataURL(file);
      return;
    }

    resolve({
      type: "FILE",
      text: "",
      caption: "",
      file: {
        name: file.name,
        size: formatBytes(file.size)
      }
    });
  });
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function pushMessageToThread(threadId, message) {
  const thread = getThread(threadId);
  if (!thread) return;

  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const senderName = "Amruthesh";

  const rendered = {
    id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sender: "self",
    senderName,
    type: message.type,
    time,
    text: message.text || "",
    caption: message.caption || "",
    file: message.file || null
  };

  thread.messages.push(rendered);
  thread.lastMessageTime = time;
  thread.lastMessageType = message.type;

  if (message.type === "IMAGE") {
    thread.lastMessage = "Image shared";
  } else if (message.type === "FILE") {
    thread.lastMessage = message.file?.name || "File shared";
  } else {
    thread.lastMessage = message.text || "";
  }

  if (thread.id !== state.activeThreadId) {
    thread.unread += 1;
  }

  renderThreadList();
  if (thread.id === state.activeThreadId) renderMessages();
}

function sendCurrentMessage() {
  const input = byId("message-input");
  const text = input.value.trim();
  if (!text) return;

  pushMessageToThread(state.activeThreadId, {
    type: "TEXT",
    text
  });

  input.value = "";
  updateMessageInputHeight();
  input.focus();
}

function openNewChat() {
  state.newChatOpen = true;
  byId("modal-backdrop").classList.remove("hidden");
  byId("new-chat-modal").classList.remove("hidden");
  byId("new-chat-search").value = "";
  state.newChatSearch = "";
  renderNewChatList();
  byId("new-chat-search").focus();
}

function closeNewChatModal() {
  state.newChatOpen = false;
  byId("modal-backdrop").classList.add("hidden");
  byId("new-chat-modal").classList.add("hidden");
}

function renderNewChatList() {
  const list = byId("new-chat-list");
  const query = normalize(state.newChatSearch.trim());
  const available = state.contacts.filter((person) => {
    const haystack = normalize(`${person.name} ${person.kind}`);
    return !query || haystack.includes(query);
  });

  list.innerHTML = "";

  available.forEach((person) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "user-result";
    item.innerHTML = `
      <div class="thread-avatar">${person.initials}</div>
      <div style="min-width:0;">
        <div class="user-result-title">${escapeHtml(person.name)}</div>
        <div class="user-result-sub">${person.kind === "group" ? "Group chat" : "Direct message"}</div>
      </div>
    `;
    item.addEventListener("click", () => {
      if (person.kind === "group") {
        selectThread("group-ade");
      } else if (person.name === "Srujan") {
        selectThread("dm-srujan");
      } else if (person.name === "Ravi") {
        selectThread("dm-ravi");
      } else if (person.name === "Meera") {
        selectThread("dm-meera");
      }
      closeNewChatModal();
      setPage("chat");
    });
    list.appendChild(item);
  });
}

function showToast(text) {
  const region = byId("toast-region");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = text;
  region.appendChild(toast);
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    toast.remove();
  }, 2200);
}

function clearCurrentConversation() {
  const thread = getActiveThread();
  if (!thread) return;
  thread.messages = thread.messages.filter((message) => message.type === "DAY");
  thread.lastMessage = "";
  thread.lastMessageType = "TEXT";
  thread.lastMessageTime = "--:--";
  thread.unread = 0;
  renderThreadList();
  renderMessages();
  showToast("Conversation cleared");
}

function ensureConversationUI() {
  const thread = getActiveThread();
  if (!thread) {
    byId("thread-empty").classList.remove("hidden");
    byId("thread-shell").classList.add("hidden");
    return;
  }
  byId("thread-empty").classList.add("hidden");
  byId("thread-shell").classList.remove("hidden");
  renderThreadHeader(thread);
  renderMessages();
}

function initIcons() {
  document.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
}

function initEvents() {
  byId("sidebar-toggle").addEventListener("click", () => {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    renderSidebar();
  });

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => setPage(btn.dataset.page));
  });

  byId("chat-search").addEventListener("input", (e) => {
    state.chatSearch = e.target.value;
    renderThreadList();
  });

  document.querySelectorAll(".filter-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.chatFilter = tab.dataset.filter;
      document.querySelectorAll(".filter-tab").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.filter === state.chatFilter);
      });
      renderThreadList();
    });
  });

  byId("new-chat-btn").addEventListener("click", openNewChat);
  byId("new-chat-close").addEventListener("click", closeNewChatModal);
  byId("modal-backdrop").addEventListener("click", () => {
    closeNewChatModal();
  });

  byId("new-chat-search").addEventListener("input", (e) => {
    state.newChatSearch = e.target.value;
    renderNewChatList();
  });

  byId("thread-back-btn").addEventListener("click", () => {
    state.activeThreadId = null;
    state.menuOpen = false;
    state.infoOpen = false;
    state.threadSearchOpen = false;
    byId("thread-search").value = "";
    byId("thread-searchbar").classList.add("hidden");
    byId("thread-menu").classList.add("hidden");
    byId("info-drawer").classList.add("hidden");
    byId("thread-empty").classList.remove("hidden");
    byId("thread-shell").classList.add("hidden");
  });

  byId("thread-search-toggle").addEventListener("click", () => {
    state.threadSearchOpen = !state.threadSearchOpen;
    if (!state.threadSearchOpen) {
      state.threadSearch = "";
      byId("thread-search").value = "";
    }
    renderConversationChrome();
  });

  byId("thread-search-close").addEventListener("click", () => {
    closeThreadSearch();
    renderMessages();
  });

  byId("thread-search").addEventListener("input", (e) => {
    state.threadSearch = e.target.value;
    renderMessages();
  });

  byId("thread-menu-toggle").addEventListener("click", () => {
    state.menuOpen = !state.menuOpen;
    state.infoOpen = false;
    renderConversationChrome();
  });

  byId("thread-menu").addEventListener("click", (e) => {
    const actionBtn = e.target.closest("button[data-action]");
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    state.menuOpen = false;
    renderConversationChrome();

    if (action === "search") {
      state.threadSearchOpen = true;
      renderConversationChrome();
      return;
    }

    if (action === "clear") {
      clearCurrentConversation();
      return;
    }

    if (action === "info") {
      state.infoOpen = true;
      renderConversationChrome();
    }
  });

  byId("info-close").addEventListener("click", () => {
    closeInfoDrawer();
  });

  byId("attach-btn").addEventListener("click", () => {
    byId("attachment-input").click();
  });

  byId("image-btn").addEventListener("click", () => {
    byId("image-input").click();
  });

  byId("mic-btn").addEventListener("click", () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      showToast("Voice input not available in this build");
      return;
    }

    if (state.voiceActive) {
      state.voiceActive = false;
      byId("mic-btn").classList.remove("active");
      showToast("Voice input stopped");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;

    state.voiceActive = true;
    byId("mic-btn").classList.add("active");
    showToast("Listening...");

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("")
        .trim();

      if (transcript) {
        const input = byId("message-input");
        input.value = (input.value ? `${input.value} ` : "") + transcript;
        updateMessageInputHeight();
      }
    };

    recognition.onerror = () => {
      state.voiceActive = false;
      byId("mic-btn").classList.remove("active");
      showToast("Voice input stopped");
    };

    recognition.onend = () => {
      state.voiceActive = false;
      byId("mic-btn").classList.remove("active");
    };

    recognition.start();
  });

  byId("send-btn").addEventListener("click", sendCurrentMessage);

  byId("message-input").addEventListener("input", updateMessageInputHeight);
  byId("message-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendCurrentMessage();
    }
  });

  byId("attachment-input").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const file of files) {
      const payload = await makeFilePayload(file, "file");
      pushMessageToThread(state.activeThreadId, payload);
    }
  });

  byId("image-input").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const file of files) {
      const payload = await makeFilePayload(file, "image");
      pushMessageToThread(state.activeThreadId, payload);
    }
  });

  document.addEventListener("click", (e) => {
    const withinMenu = e.target.closest("#thread-menu");
    const withinInfo = e.target.closest("#info-drawer");
    const menuBtn = e.target.closest("#thread-menu-toggle");
    const searchBtn = e.target.closest("#thread-search-toggle");
    const newChat = e.target.closest("#new-chat-modal");
    const modalBackdrop = e.target.closest("#modal-backdrop");

    if (!withinMenu && !menuBtn) closeThreadMenu();
    if (!withinInfo) closeInfoDrawer();
    if (!searchBtn) {
      // keep search open unless explicitly closed
    }
    if (modalBackdrop) closeNewChatModal();
    if (newChat) return;
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (state.newChatOpen) closeNewChatModal();
      else if (state.menuOpen) closeThreadMenu();
      else if (state.infoOpen) closeInfoDrawer();
      else if (state.threadSearchOpen) closeThreadSearch();
    }
  });
}

function bootstrap() {
  initIcons();
  renderSidebar();
  renderThreadList();
  setPage("chat");
  selectThread(state.activeThreadId);
  ensureConversationUI();
  initEvents();
  updateMessageInputHeight();
}

bootstrap();
