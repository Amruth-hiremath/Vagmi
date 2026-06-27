// desktop/web/pages/chat/script.js

import { getConversations, getMessages, sendMessage, sendImage, sendVoice, markConversationRead, clearConversation, deleteMessage } from "../../services/dm.js";
import { apiRequest } from "../../services/api.js";
import { getUser } from "../../services/auth.js";
import {
  getRooms,
  getRoomMessages,
  getRoomMembers,
  sendRoomMessage,
  createRoom,
  addRoomMember,
  sendRoomImage,
  sendRoomVoice,
  deleteRoomMessage
} from "../../services/rooms.js";

import { escapeHTML, formatTime, formatFileSize } from "./core/utils.js";
import { saveActiveThreadKey, getSavedActiveThreadKey, makeThreadKey } from "./core/state.js";
import { iconMap } from "./core/icons.js";
import {
  clearConversationCanvas,
  showConversationEmptyState,
  openConversationView,
  renderThreadEmptyState,
  previewText,
  iconForPreview,
  renderThreads,
  updateConversationMeta,
  updateInfoDrawer,
  closeOverlays
} from "./core/ui.js";
import {
  activeThread,
  openThread,
  closeConversationAndShowEmptyState,
  loadConversations
} from "./core/conversation.js";
import {
  messageHTML,
  loadInlineImages,
  renderMessages,
  loadMessages,
  handleSend,
  setComposerText,
  handleAttachment
} from "./core/message.js";
import {
  clearAttachmentPreview,
  closeAttachmentModal,
  openImageViewer,
  closeImageViewer,
  openAttachmentModal,
  attachmentDownloadName,
  buildAttachmentUrl,
  fetchAttachmentBlob,
  buildAttachmentCard,
  renderAttachmentModalView,
  openAttachmentViewer,
  downloadAttachment
} from "./core/attachment.js";
import {
  openNewChatModal,
  closeNewChatModal,
  renderNewChatState,
  renderNewChatResults,
  setupImageViewerEvents
} from "./core/modal.js";
import { currentSearchUpdate, searchRegisteredUsers, startChatWithUser } from "./core/search.js";
import { searchUsers } from "../../services/users.js";

document.addEventListener("DOMContentLoaded", () => {
  const currentUser = getUser();

  const state = {
    activeThreadId: null,
    activeThreadKey: null,
    threadFilter: "all",
    chatSearch: "",
    convoSearch: "",
    menuOpen: false,
    infoOpen: false,
    newChatOpen: false,
    launcherOpen: false,
    roomCreateOpen: false,
    threads: [],
    rooms: [],
    activeRoomId: null,
    chatMode: "direct"
  };

  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;

  const roomMemberState = {
    selected: [],
    timer: null
  };

  function getRoomMemberKey(user) {
    if (!user) return null;
    return `${String(user.id)}:${String(user.username || "").toLowerCase()}`;
  }

  function clearRoomMemberSearchResults() {
    if (roomMemberResults) {
      roomMemberResults.innerHTML = "";
      roomMemberResults.classList.add("hidden");
    }
  }

  function renderSelectedRoomMembers() {
    if (!roomMemberSelected) return;

    if (roomMemberState.selected.length === 0) {
      roomMemberSelected.innerHTML = '<div class="member-picker-empty">No members selected yet.</div>';
      return;
    }

    roomMemberSelected.innerHTML = roomMemberState.selected.map((user) => `
      <div class="member-chip" data-user-id="${String(user.id)}">
        <span class="member-chip-label">${escapeHTML(user.username)}</span>
        <button type="button" class="member-chip-remove" data-remove-user-id="${String(user.id)}" aria-label="Remove ${escapeHTML(user.username)}">×</button>
      </div>
    `).join("");
  }

  function setRoomMemberStatus(message, tone = "muted") {
    if (!roomMemberResults) return;
    roomMemberResults.innerHTML = `<div class="member-picker-state ${tone}">${escapeHTML(message)}</div>`;
    roomMemberResults.classList.remove("hidden");
  }

  function syncRoomMemberResults(users) {
    const list = (Array.isArray(users) ? users : [])
      .filter((user) => user && String(user.username || "").trim())
      .filter((user) => user.username.toLowerCase() !== currentUser.username.toLowerCase())
      .filter((user) => !roomMemberState.selected.some((picked) => picked.id === user.id));

    if (!roomMemberResults) return;

    if (list.length === 0) {
      setRoomMemberStatus(roomMemberSearch?.value?.trim() ? "No matching approved users found." : "Type to search approved users.");
      return;
    }

    roomMemberResults.innerHTML = list.map((user) => {
      const username = user.username || "User";
      const initials = username
        .split(/[^a-zA-Z0-9]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("") || "U";

      return `
        <button type="button" class="member-result" data-member-id="${String(user.id)}" data-member-username="${escapeHTML(username)}">
          <div class="avatar">${escapeHTML(initials)}</div>
          <div class="member-result-copy">
            <div class="member-result-name">${escapeHTML(username)}</div>
            <div class="member-result-meta">Approved user</div>
          </div>
          <div class="member-result-action">Add</div>
        </button>
      `;
    }).join("");
    roomMemberResults.classList.remove("hidden");
  }

  async function searchRoomMembers(query) {
    if (!roomMemberResults) return;
    const normalized = String(query || "").trim();
    if (roomMemberState.timer) {
      clearTimeout(roomMemberState.timer);
      roomMemberState.timer = null;
    }
    roomMemberResults.classList.remove("hidden");
    roomMemberResults.innerHTML = '<div class="member-picker-state muted">Searching approved users…</div>';

    try {
      const users = await searchUsers(normalized);
      syncRoomMemberResults(users);
    } catch (error) {
      console.error("Room member search failed", error);
      setRoomMemberStatus("Unable to load approved users right now.", "error");
    }
  }

  function addRoomMemberSelection(user) {
    if (!user) return;
    const key = getRoomMemberKey(user);
    if (!key) return;
    if (roomMemberState.selected.some((picked) => getRoomMemberKey(picked) === key)) return;
    if (String(user.username || "").toLowerCase() === currentUser.username.toLowerCase()) return;
    roomMemberState.selected.push({ id: Number(user.id), username: user.username });
    renderSelectedRoomMembers();
    if (roomMemberSearch) {
      roomMemberSearch.value = "";
      roomMemberSearch.focus();
    }
    clearRoomMemberSearchResults();
  }

  function removeRoomMemberSelection(userId) {
    const numericId = Number(userId);
    roomMemberState.selected = roomMemberState.selected.filter((user) => Number(user.id) !== numericId);
    renderSelectedRoomMembers();
    if (roomMemberSearch?.value?.trim()) {
      searchRoomMembers(roomMemberSearch.value);
    } else {
      setRoomMemberStatus("Type to search approved users.");
    }
  }


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

  function getRoomDeleteLabel() {
    return "Delete message";
  }

  async function refreshConversations({ preserveSelection = true } = {}) {
    await loadConversations({ preserveSelection });
  }

  async function openLauncherModal() {
    closeOverlays(state);
    closeNewChatModal();
    closeRoomCreateModal();
    state.launcherOpen = true;
    chatLauncherModal?.classList.remove("hidden");
    chatLauncherModal?.setAttribute("aria-hidden", "false");
  }

  function closeLauncherModal() {
    state.launcherOpen = false;
    chatLauncherModal?.classList.add("hidden");
    chatLauncherModal?.setAttribute("aria-hidden", "true");
  }

  async function openRoomCreateModal() {
    closeOverlays(state);
    closeNewChatModal();
    closeLauncherModal();
    state.roomCreateOpen = true;
    roomCreateModal?.classList.remove("hidden");
    roomCreateModal?.setAttribute("aria-hidden", "false");
    roomMemberState.selected = [];
    if (roomMemberState.timer) {
      clearTimeout(roomMemberState.timer);
      roomMemberState.timer = null;
    }
    renderSelectedRoomMembers();
    clearRoomMemberSearchResults();
    if (roomMemberSearch) {
      roomMemberSearch.value = "";
      roomMemberSearch.focus();
      searchRoomMembers("");
    }
  }

  function closeRoomCreateModal() {
    state.roomCreateOpen = false;
    roomCreateModal?.classList.add("hidden");
    roomCreateModal?.setAttribute("aria-hidden", "true");
    roomMemberState.selected = [];
    if (roomMemberState.timer) {
      clearTimeout(roomMemberState.timer);
      roomMemberState.timer = null;
    }
    if (roomCreateForm) roomCreateForm.reset();
    renderSelectedRoomMembers();
    clearRoomMemberSearchResults();
    if (roomMemberSearch) roomMemberSearch.value = "";
  }

  async function submitRoomCreation(event) {
    event.preventDefault();
    const roomName = roomNameInput?.value?.trim();
    if (!roomName) {
      alert("Please enter a room name.");
      roomNameInput?.focus();
      return;
    }

    const members = roomMemberState.selected
      .map((user) => String(user.username || "").trim())
      .filter(Boolean)
      .filter((name) => name.toLowerCase() !== currentUser.username.toLowerCase());

    try {
      const room = await createRoom(roomName);

      const uniqueMembers = [...new Set(members.map((name) => name.toLowerCase()))];
      const originalNames = members.filter((name, idx) => uniqueMembers.indexOf(name.toLowerCase()) === idx);

      for (const username of originalNames) {
        try {
          await addRoomMember(room.id, username);
        } catch (error) {
          console.warn(`Could not add ${username} to room`, error);
        }
      }

      closeRoomCreateModal();
      await refreshConversations({ preserveSelection: false });
      await openThread(makeThreadKey("room", room.id), { remember: true });
    } catch (error) {
      alert(error?.message || "Failed to create room.");
    }
  }

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
  const menuItems = document.querySelectorAll(".menu-item");
  const infoDrawer = document.getElementById("info-drawer");
  const closeInfo = document.getElementById("close-info");
  const attachBtn = document.getElementById("attach-btn");
  const imageBtn = document.getElementById("image-btn");
  const micBtn = document.getElementById("mic-btn");
  const sendBtn = document.getElementById("send-btn");
  const inputField = document.getElementById("message-input");
  const fileInput = document.getElementById("file-input");
  const imageInput = document.getElementById("image-input");

  const chatLauncherBtn = document.getElementById("chat-launcher-btn");
  const chatLauncherModal = document.getElementById("chat-launcher-modal");
  const chatLauncherBackdrop = document.getElementById("chat-launcher-backdrop");
  const chatLauncherClose = document.getElementById("chat-launcher-close");
  const launcherDmBtn = document.getElementById("launcher-dm-btn");
  const launcherRoomBtn = document.getElementById("launcher-room-btn");

  const roomCreateModal = document.getElementById("room-create-modal");
  const roomCreateBackdrop = document.getElementById("room-create-backdrop");
  const roomCreateClose = document.getElementById("room-create-close");
  const roomCreateCancel = document.getElementById("room-create-cancel");
  const roomCreateForm = document.getElementById("room-create-form");
  const roomNameInput = document.getElementById("room-name-input");
  const roomMemberSearch = document.getElementById("room-member-search");
  const roomMemberPicker = document.getElementById("room-member-picker");
  const roomMemberResults = document.getElementById("room-member-results");
  const roomMemberSelected = document.getElementById("room-member-selected");

  const newChatModal = document.getElementById("new-chat-modal");
  const newChatBackdrop = document.getElementById("new-chat-backdrop");
  const newChatClose = document.getElementById("new-chat-close");
  const newChatSearch = document.getElementById("new-chat-search");
  const newChatResults = document.getElementById("new-chat-results");

  const attachmentModal = document.getElementById("attachment-modal");
  const attachmentModalBackdrop = document.getElementById("attachment-modal-backdrop");
  const attachmentModalClose = document.getElementById("attachment-modal-close");

  document.querySelectorAll("[data-icon]").forEach((el) => {
    const iconName = el.dataset.icon;
    el.innerHTML = iconMap[iconName] || "";
  });

  window.loadSequence = 0;
  window.newChatSearchTimer = null;
  window.getConversations = getConversations;
  window.getRooms = getRooms;
  window.scrollMessagesToBottom = scrollMessagesToBottom;
  window.sendMessage = sendMessage;
  window.sendImage = sendImage;
  window.sendVoice = sendVoice;
  window.sendRoomMessage = sendRoomMessage;
  window.sendRoomImage = sendRoomImage;
  window.sendRoomVoice = sendRoomVoice;
  window.formatTime = formatTime;
  window.formatFileSize = formatFileSize;
  window.renderThreads = renderThreads;
  window.markConversationRead = markConversationRead;
  window.loadMessages = loadMessages;
  window.getMessages = getMessages;
  window.getRoomMessages = getRoomMessages;
  window.getRoomMembers = getRoomMembers;
  window.fetchAttachmentBlob = fetchAttachmentBlob;
  window.openImageViewer = openImageViewer;
  window.loadInlineImages = loadInlineImages;
  window.currentUser = currentUser;
  window.chatState = state;
  window.updateConversationMeta = updateConversationMeta;
  window.updateInfoDrawer = updateInfoDrawer;
  window.activeThread = activeThread;
  window.clearConversation = clearConversation;
  window.deleteMessage = deleteMessage;
  window.deleteRoomMessage = deleteRoomMessage;
  window.apiRequest = apiRequest;
  window.searchRegisteredUsers = searchRegisteredUsers;
  window.renderNewChatState = renderNewChatState;
  window.renderNewChatResults = renderNewChatResults;
  window.openLauncherModal = openLauncherModal;
  window.closeLauncherModal = closeLauncherModal;
  window.openRoomCreateModal = openRoomCreateModal;
  window.closeRoomCreateModal = closeRoomCreateModal;
  window.openNewChatModal = openNewChatModal;
  window.closeNewChatModal = closeNewChatModal;

  if (messagesScroll && "MutationObserver" in window) {
    messagesObserver = new MutationObserver(() => {
      if (state.activeThreadKey !== null) {
        scrollMessagesToBottom();
      }
    });
    messagesObserver.observe(messagesScroll, { childList: true, subtree: true });
  }

  window.addEventListener("resize", () => {
    if (state.activeThreadKey !== null) {
      scrollMessagesToBottom();
    }
  });

  function isAttachmentVisible() {
    return attachmentModal && !attachmentModal.classList.contains("hidden");
  }

  function closeAllOverlays() {
    closeOverlays(state);
    closeNewChatModal();
    closeLauncherModal();
    closeRoomCreateModal();
  }

  function requestAnimationScroll() {
    requestAnimationFrame(() => scrollMessagesToBottom());
  }

  threadList?.addEventListener("click", (event) => {
    const btn = event.target.closest(".thread-item");
    if (!btn) return;
    const threadKey = btn.dataset.threadKey;
    if (!threadKey) return;
    openThread(threadKey, { remember: true });
  });

  inputField?.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = `${Math.min(this.scrollHeight, 120)}px`;
    this.style.overflowY = this.scrollHeight > 120 ? "auto" : "hidden";
  });

  inputField?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  });

  sendBtn?.addEventListener("click", handleSend);
  backBtn?.addEventListener("click", closeConversationAndShowEmptyState);


  chatLauncherBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    openLauncherModal();
  });

  chatLauncherBackdrop?.addEventListener("click", closeLauncherModal);
  chatLauncherClose?.addEventListener("click", closeLauncherModal);
  launcherDmBtn?.addEventListener("click", () => {
    closeLauncherModal();
    openNewChatModal();
  });
  launcherRoomBtn?.addEventListener("click", () => {
    openRoomCreateModal();
  });

  roomCreateBackdrop?.addEventListener("click", closeRoomCreateModal);
  roomCreateClose?.addEventListener("click", closeRoomCreateModal);
  roomCreateCancel?.addEventListener("click", closeRoomCreateModal);
  roomCreateForm?.addEventListener("submit", submitRoomCreation);
  roomCreateModal?.addEventListener("click", (event) => event.stopPropagation());
  roomMemberPicker?.addEventListener("click", (event) => event.stopPropagation());

  roomMemberSearch?.addEventListener("input", () => {
    if (roomMemberState.timer) {
      clearTimeout(roomMemberState.timer);
    }
    roomMemberState.timer = setTimeout(() => {
      searchRoomMembers(roomMemberSearch.value);
    }, 220);
  });

  roomMemberSearch?.addEventListener("focus", () => {
    if (!roomMemberResults || roomMemberResults.children.length === 0) {
      searchRoomMembers(roomMemberSearch.value || "");
    }
  });

  roomMemberSearch?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      clearRoomMemberSearchResults();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const first = roomMemberResults?.querySelector(".member-result");
      if (first) first.click();
    }
  });

  roomMemberResults?.addEventListener("click", (event) => {
    event.stopPropagation();
    const btn = event.target.closest(".member-result");
    if (!btn) return;
    const id = Number(btn.dataset.memberId);
    const username = btn.dataset.memberUsername;
    if (!Number.isFinite(id) || !username) return;
    addRoomMemberSelection({ id, username });
  });

  roomMemberSelected?.addEventListener("click", (event) => {
    event.stopPropagation();
    const removeBtn = event.target.closest("[data-remove-user-id]");
    if (!removeBtn) return;
    removeRoomMemberSelection(removeBtn.dataset.removeUserId);
  });

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

  micBtn?.addEventListener("click", async () => {
    const thread = activeThread(state);
    if (!thread) return;

    try {
      if (!isRecording) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) recordedChunks.push(event.data);
        };

        mediaRecorder.start();
        isRecording = true;
        micBtn.classList.add("recording");
        return;
      }

      mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(recordedChunks, { type: "audio/webm" });
          const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
          if (thread.type === "room") {
            await sendRoomVoice(thread.id, file);
          } else {
            await sendVoice(thread.id, file);
          }
          await loadMessages(thread.key);
          requestAnimationScroll();
        } catch (error) {
          console.error("Voice upload failed", error);
        } finally {
          mediaRecorder?.stream?.getTracks().forEach((track) => track.stop());
          mediaRecorder = null;
          isRecording = false;
          micBtn.classList.remove("recording");
        }
      };

      mediaRecorder.stop();
    } catch (error) {
      console.error("Voice recording failed", error);
    }
  });

  chatSearch?.addEventListener("input", () => currentSearchUpdate());

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filterButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      state.threadFilter = button.dataset.filter;
      renderThreads(state);
    });
  });

  searchToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    conversationSearchRow.classList.remove("hidden");
    conversationSearch?.focus();
  });

  closeSearch?.addEventListener("click", () => {
    conversationSearchRow.classList.add("hidden");
    state.convoSearch = "";
    if (conversationSearch) conversationSearch.value = "";
    const thread = activeThread(state);
    if (thread) renderMessages(thread);
  });

  conversationSearch?.addEventListener("input", () => {
    state.convoSearch = conversationSearch.value;
    const thread = activeThread(state);
    if (thread) renderMessages(thread);
  });

  menuToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    state.menuOpen = !state.menuOpen;
    menuPopover?.classList.toggle("hidden", !state.menuOpen);
  });

  document.addEventListener("click", (event) => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    const isInside = (selector) =>
      path.some((node) => node instanceof Element && node.matches?.(selector));

    if (
      isInside(".menu-wrap") ||
      isInside("#search-toggle") ||
      isInside(".conversation-search") ||
      isInside("#info-drawer") ||
      isInside("#new-chat-modal") ||
      isInside("#room-create-modal") ||
      isInside("#chat-launcher-modal") ||
      isInside("#attachment-modal") ||
      isInside(".menu-popover") ||
      isInside("#room-member-picker") ||
      isInside("#room-member-results")
    ) {
      return;
    }
    clearRoomMemberSearchResults();
    closeAllOverlays();
  });

  menuPopover?.addEventListener("click", async (event) => {
    event.stopPropagation();
    const btn = event.target.closest(".menu-item");
    if (!btn) return;

    const action = btn.dataset.menu;
    closeOverlays(state);

    if (action === "search") {
      conversationSearchRow.classList.remove("hidden");
      conversationSearch?.focus();
    }

    if (action === "clear") {
      const thread = activeThread(state);
      if (!thread) return;
      const confirmed = confirm("Clear this conversation? This only removes it from your view.");
      if (!confirmed) return;

      try {
        await clearConversation(thread.id);
        const id = thread.id;
        await refreshConversations({ preserveSelection: false });
        await openThread(id, { remember: true });
      } catch (error) {
        alert(error?.message || "Failed to clear conversation.");
      }
    }

    if (action === "info") {
      state.infoOpen = !state.infoOpen;
      if (state.infoOpen) {
        menuPopover?.classList.add("hidden");
      }
      infoDrawer?.classList.toggle("hidden", !state.infoOpen);
    }
  });

  newChatClose?.addEventListener("click", () => closeNewChatModal());
  newChatBackdrop?.addEventListener("click", () => closeNewChatModal());

  newChatSearch?.addEventListener("input", () => {
    if (window.newChatSearchTimer) {
      clearTimeout(window.newChatSearchTimer);
    }
    const value = newChatSearch.value;
    window.newChatSearchTimer = setTimeout(() => {
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

  messagesScroll?.addEventListener("click", async (event) => {
    const deleteBtn = event.target.closest(".delete-message-btn");
    if (deleteBtn) {
      const messageId = Number(deleteBtn.dataset.messageId);
      if (!confirm("Delete this message?")) return;

      try {
        const thread = activeThread(state);
        if (!thread) return;

        if (thread.type === "room") {
          await deleteRoomMessage(messageId);
        } else {
          await deleteMessage(messageId);
        }

        await loadMessages(thread.key);
        await refreshConversations({ preserveSelection: true });
        requestAnimationScroll();
      } catch (error) {
        alert(error?.message || "Failed to delete message.");
      }
      return;
    }

    const imgEl = event.target.closest(".chat-image-preview");
    if (imgEl) {
      const thread = activeThread(state);
      const message = thread?.messages?.find((m) => String(m.id) === String(imgEl.dataset.messageId));
      openImageViewer(imgEl.src, imgEl.alt || "image", thread, message);
      return;
    }

    const actionBtn = event.target.closest("[data-attachment-action]");
    const card = event.target.closest(".attachment-card.clickable");
    if (!actionBtn && !card) return;

    const targetCard = actionBtn ? actionBtn.closest(".attachment-card.clickable") : card;
    if (!targetCard) return;

    const threadKey = targetCard.dataset.attachmentThreadKey;
    const messageId = Number(targetCard.dataset.attachmentMessageId);
    if (!threadKey || !Number.isFinite(messageId)) return;

    const thread = state.threads.find((item) => item.key === threadKey);
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

  attachmentModalBackdrop?.addEventListener("click", () => closeAttachmentModal());
  attachmentModalClose?.addEventListener("click", () => closeAttachmentModal());

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.newChatOpen) closeNewChatModal();
    if (event.key === "Escape" && state.launcherOpen) closeLauncherModal();
    if (event.key === "Escape" && state.roomCreateOpen) closeRoomCreateModal();
    if (event.key === "Escape" && isAttachmentVisible()) closeAttachmentModal();
  });

  setupImageViewerEvents();

  async function initialize() {
    try {
      const savedThreadKey = getSavedActiveThreadKey();
      await refreshConversations({ preserveSelection: false });

      if (savedThreadKey !== null && state.threads.some((thread) => thread.key === savedThreadKey)) {
        await openThread(savedThreadKey, { remember: false });
      } else {
        state.activeThreadId = null;
        state.activeThreadKey = null;
        saveActiveThreadKey(null);
        showConversationEmptyState(state);
        scrollMessagesToBottom();
      }
    } catch (error) {
      console.error("Conversation load failed", error);
      state.activeThreadId = null;
      state.activeThreadKey = null;
      saveActiveThreadKey(null);
      showConversationEmptyState(state);
    }
  }

  initialize();
});
