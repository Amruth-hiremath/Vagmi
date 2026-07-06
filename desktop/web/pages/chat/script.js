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
  removeRoomMember,
  updateRoom,
  sendRoomImage,
  sendRoomVoice,
  deleteRoomMessage,
  markRoomRead
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
  closeOverlays,
  decorateAvatars
} from "./core/ui.js";
import {
  activeThread,
  openThread,
  closeConversationAndShowEmptyState,
  loadConversations
} from "./core/conversation.js";
import {
  messageHTML,
  messageMenuContentHTML,
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
  downloadAttachment,
  saveBlobToDownloads,
  saveLoadedUrl
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
import { uploadRoomAttachment, uploadDmAttachment } from "../../services/attachment.js";
import { loadAvatarObjectUrl, loadMyAvatarObjectUrl, bumpAvatarCache as bumpGlobalAvatarCache } from "../../services/avatar.js";
import { deleteMessageForMe } from "../../services/dm.js";
import { deleteRoomMessageForMe } from "../../services/rooms.js";


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
    messageMenuOpen: false,
    messageMenuAnchor: null,
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

  // Predeclare room-create DOM refs so overlay helpers can safely reference them
  // before the later DOM query block assigns the actual elements.
  let roomCreateModal = null;
  let roomCreateBackdrop = null;
  let roomCreateClose = null;
  let roomCreateCancel = null;
  let roomCreateForm = null;
  let roomCreateTitle = null;
  let roomCreateSubmit = null;
  let roomNameInput = null;
  let roomMemberPicker = null;
  let roomMemberSearch = null;
  let roomMemberResults = null;
  let roomMemberSelected = null;

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
      roomMemberSearch.focus({ preventScroll: true });
      roomMemberSearch.setSelectionRange(0, 0);
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

  async function openRoomCreateModal(thread = null) {
    closeOverlays(state);
    closeNewChatModal();
    closeLauncherModal();

    const target = thread && thread.kind === "room" ? thread : null;
    state.roomCreateOpen = true;
    state.roomEditTarget = target;

    roomCreateModal?.classList.remove("hidden");
    roomCreateModal?.setAttribute("aria-hidden", "false");

    if (roomCreateTitle) {
      roomCreateTitle.textContent = target ? "Edit group info" : "Set up a group room";
    }

    if (roomCreateSubmit) {
      roomCreateSubmit.textContent = target ? "Save changes" : "Create room";
    }

    if (target) {
      let members = Array.isArray(target.members)
        ? target.members
            .filter((member) => member && Number(member.id) !== currentUser.id)
            .map((member) => ({
              id: Number(member.id),
              username: String(member.username || "").trim()
            }))
            .filter((member) => Number.isFinite(member.id) && member.username)
        : [];

      if (members.length === 0 && typeof getRoomMembers === "function") {
        try {
          const fetchedMembers = await getRoomMembers(target.id);
          members = Array.isArray(fetchedMembers)
            ? fetchedMembers
                .filter((member) => member && Number(member.id) !== currentUser.id)
                .map((member) => ({
                  id: Number(member.id),
                  username: String(member.username || "").trim()
                }))
                .filter((member) => Number.isFinite(member.id) && member.username)
            : members;
          target.members = members;
        } catch (error) {
          console.warn("Unable to refresh room members before editing", error);
        }
      }

      roomMemberState.selected = members;
      if (roomNameInput) roomNameInput.value = String(target.title || target.name || "").trim();
    } else {
      roomMemberState.selected = [];
      if (roomCreateForm) roomCreateForm.reset();
      if (roomNameInput) roomNameInput.value = "";
    }

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
    state.roomEditTarget = null;
    if (roomCreateModal) {
      roomCreateModal.classList.add("hidden");
      roomCreateModal.setAttribute("aria-hidden", "true");
    }
    roomMemberState.selected = [];
    if (roomMemberState.timer) {
      clearTimeout(roomMemberState.timer);
      roomMemberState.timer = null;
    }
    if (roomCreateForm) roomCreateForm.reset();
    if (roomCreateTitle) roomCreateTitle.textContent = "Set up a group room";
    if (roomCreateSubmit) roomCreateSubmit.textContent = "Create room";
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

    const selectedMembers = roomMemberState.selected
      .map((user) => ({
        id: Number(user.id),
        username: String(user.username || "").trim()
      }))
      .filter((user) => Number.isFinite(user.id) && user.username)
      .filter((user) => user.id !== currentUser.id);

    try {
      const target = state.roomEditTarget;
      if (target) {
        const nextRoom = await updateRoom(target.id, { name: roomName });
        const currentMembers = Array.isArray(target.members) ? target.members : [];
        const currentIds = new Set(
          currentMembers
            .map((member) => Number(member.id))
            .filter((id) => Number.isFinite(id) && id !== currentUser.id)
        );
        const selectedIds = new Set(selectedMembers.map((member) => member.id));

        for (const member of selectedMembers) {
          if (!currentIds.has(member.id)) {
            try {
              await addRoomMember(target.id, { user_id: member.id });
            } catch (error) {
              console.warn(`Could not add ${member.username} to room`, error);
            }
          }
        }

        for (const member of currentMembers) {
          const memberId = Number(member.id);
          if (!Number.isFinite(memberId) || memberId === currentUser.id) continue;
          if (!selectedIds.has(memberId)) {
            try {
              await removeRoomMember(target.id, memberId);
            } catch (error) {
              console.warn(`Could not remove ${member.username} from room`, error);
            }
          }
        }

        closeRoomCreateModal();
        await refreshConversations({ preserveSelection: false });
        await openThread(makeThreadKey("room", nextRoom.id), { remember: true });
        return;
      }

      const room = await createRoom(roomName);
      for (const member of selectedMembers) {
        try {
          await addRoomMember(room.id, { user_id: member.id });
        } catch (error) {
          console.warn(`Could not add ${member.username} to room`, error);
        }
      }

      closeRoomCreateModal();
      await refreshConversations({ preserveSelection: false });
      await openThread(makeThreadKey("room", room.id), { remember: true });
    } catch (error) {
      alert(error?.message || "Failed to save room.");
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
  const roomAdminToggle = document.getElementById("room-admin-toggle");
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

  roomCreateModal = document.getElementById("room-create-modal");
  roomCreateBackdrop = document.getElementById("room-create-backdrop");
  roomCreateClose = document.getElementById("room-create-close");
  roomCreateCancel = document.getElementById("room-create-cancel");
  roomCreateForm = document.getElementById("room-create-form");
  roomCreateTitle = document.getElementById("room-create-title");
  roomCreateSubmit = document.getElementById("room-create-submit");
  roomNameInput = document.getElementById("room-name-input");
  roomMemberPicker = document.getElementById("room-member-picker");
  roomMemberSearch = document.getElementById("room-member-search");
  roomMemberResults = document.getElementById("room-member-results");
  roomMemberSelected = document.getElementById("room-member-selected");

  const newChatModal = document.getElementById("new-chat-modal");
  const newChatBackdrop = document.getElementById("new-chat-backdrop");
  const newChatClose = document.getElementById("new-chat-close");
  const newChatSearch = document.getElementById("new-chat-search");
  const newChatResults = document.getElementById("new-chat-results");

  const attachmentModal = document.getElementById("attachment-modal");
  const attachmentModalBackdrop = document.getElementById("attachment-modal-backdrop");
  const attachmentModalClose = document.getElementById("attachment-modal-close");
  const messageMenuOverlay = document.getElementById("message-menu-overlay");
  const messageMenuBackdrop = document.getElementById("message-menu-backdrop");
  const messageMenuSurface = document.getElementById("message-menu-surface");
  const roomCreateDialog = document.querySelector(".room-create-dialog");

  // Drawer admin section elements
  const roomAdminSection = document.getElementById("room-admin-section");
  const roomNameDisplay = document.getElementById("room-name-display");
  const roomNameValue = document.getElementById("room-name-value");
  const roomNameEditBtn = document.getElementById("room-name-edit-btn");
  const roomNameEdit = document.getElementById("room-name-edit");
  const roomNameInputInline = document.getElementById("room-name-input-inline");
  const roomNameSaveBtn = document.getElementById("room-name-save-btn");
  const roomNameCancelBtn = document.getElementById("room-name-cancel-btn");
  const roomMembersList = document.getElementById("room-members-list");
  const roomAddMemberToggle = document.getElementById("room-add-member-toggle");
  const roomAddMemberPicker = document.getElementById("room-add-member-picker");
  const roomAddMemberSearch = document.getElementById("room-add-member-search");
  const roomAddMemberResults = document.getElementById("room-add-member-results");

  roomCreateDialog?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  roomMemberPicker?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

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
  window.markRoomRead = markRoomRead;
  window.uploadRoomAttachment = uploadRoomAttachment;
  window.uploadDmAttachment = uploadDmAttachment;
  window.formatTime = formatTime;
  window.formatFileSize = formatFileSize;
  window.renderThreads = renderThreads;
  window.renderMessages = renderMessages;
  window.markConversationRead = markConversationRead;
  window.loadMessages = loadMessages;
  window.getMessages = getMessages;
  window.getRoomMessages = getRoomMessages;
  window.getRoomMembers = getRoomMembers;
window.fetchAttachmentBlob = fetchAttachmentBlob;
window.openImageViewer = openImageViewer;
window.loadInlineImages = loadInlineImages;
window.saveBlobToDownloads = saveBlobToDownloads;
window.saveLoadedUrl = saveLoadedUrl;
window.loadAvatarObjectUrl = loadAvatarObjectUrl;
window.loadMyAvatarObjectUrl = loadMyAvatarObjectUrl;
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
  window.openRoomEditModal = openRoomCreateModal;
  window.closeRoomCreateModal = closeRoomCreateModal;
  window.openNewChatModal = openNewChatModal;
  window.closeNewChatModal = closeNewChatModal;
  window.sendAttachment = handleAttachment;
  window.handleAttachment = handleAttachment;
  const chatState = window.chatState;

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

  function closeMessageMenu() {
    if (!messageMenuOverlay || !messageMenuSurface) return;
    messageMenuOverlay.classList.add("hidden");
    messageMenuOverlay.setAttribute("aria-hidden", "true");
    messageMenuSurface.innerHTML = "";
    messageMenuSurface.style.left = "";
    messageMenuSurface.style.top = "";
    messageMenuSurface.style.right = "";
    messageMenuSurface.style.bottom = "";
    messageMenuSurface.style.visibility = "";
    state.messageMenuOpen = false;
    state.messageMenuAnchor = null;
  }

  function positionMessageMenu(buttonEl, surfaceEl) {
    if (!buttonEl || !surfaceEl) return;
    const rect = buttonEl.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 10;
    const menuRect = surfaceEl.getBoundingClientRect();
    const menuWidth = menuRect.width || 260;
    const menuHeight = menuRect.height || 180;
    const maxLeft = window.innerWidth - menuWidth - viewportPadding;
    let left = rect.right - menuWidth;
    left = Math.min(Math.max(viewportPadding, left), maxLeft);

    let top = rect.bottom + gap;
    const belowOverflow = top + menuHeight > window.innerHeight - viewportPadding;
    if (belowOverflow) {
      top = rect.top - gap - menuHeight;
    }
    top = Math.max(viewportPadding, top);

    surfaceEl.style.left = `${left}px`;
    surfaceEl.style.top = `${top}px`;
  }

  function openMessageMenu(buttonEl, message, thread) {
    if (!messageMenuOverlay || !messageMenuSurface) return;
    messageMenuSurface.innerHTML = messageMenuContentHTML(message);
    messageMenuOverlay.classList.remove("hidden");
    messageMenuOverlay.setAttribute("aria-hidden", "false");
    state.messageMenuOpen = true;
    state.messageMenuAnchor = {
      buttonEl,
      messageId: Number(message?.id),
      threadKey: thread?.key || null
    };
    requestAnimationFrame(() => {
      positionMessageMenu(buttonEl, messageMenuSurface);
    });
  }

  function closeAllOverlays() {
    closeOverlays(state);
    closeNewChatModal();
    closeLauncherModal();
    closeRoomCreateModal();
    closeMessageMenu();
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

  const handleRoomMemberChoice = (event) => {
    const btn = event.target.closest(".member-result");
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    const id = Number(btn.dataset.memberId);
    const username = btn.dataset.memberUsername;
    if (!Number.isFinite(id) || !username) return;
    addRoomMemberSelection({ id, username });
  };

  roomMemberResults?.addEventListener("pointerdown", handleRoomMemberChoice);
  roomMemberResults?.addEventListener("click", handleRoomMemberChoice);

  roomMemberSelected?.addEventListener("click", (event) => {
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

  let notificationPermissionRequested = false;

  function requestNotificationPermission() {
    console.log("Checking notification permission:", Notification.permission);
    if (!notificationPermissionRequested && "Notification" in window && Notification.permission === "default") {
      console.log("Requesting notification permission...");
      Notification.requestPermission().then(permission => {
        console.log("Notification permission:", permission);
        notificationPermissionRequested = true;
      });
    }
  }

  document.addEventListener("click", requestNotificationPermission, { once: true });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (
      target.closest(".menu-wrap") ||
      target.closest("#search-toggle") ||
      target.closest(".conversation-search") ||
      target.closest("#info-drawer") ||
      target.closest("#new-chat-modal") ||
      target.closest("#room-create-modal") ||
      target.closest("#chat-launcher-modal") ||
      target.closest("#attachment-modal") ||
      target.closest("#message-menu-overlay") ||
      target.closest("#message-menu-surface") ||
      target.closest("#message-menu-backdrop") ||
      target.closest("#room-admin-toggle") ||
      target.closest("#room-add-member-toggle") ||
      target.closest("#room-name-edit-btn") ||
      target.closest("#room-name-save-btn") ||
      target.closest("#room-name-cancel-btn") ||
      target.closest("#room-add-member-picker") ||
      target.closest("#room-add-member-results") ||
      target.closest(".attachment-card") ||
      target.closest(".attachment-action-btn") ||
      target.closest(".chat-image-preview") ||
      target.closest(".menu-popover") ||
      target.closest("#room-member-picker") ||
      target.closest("#room-member-results") ||
      target.closest(".message-menu") ||
      target.closest(".message-menu-btn") ||
      target.closest(".message-menu-item")
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

  closeInfo?.addEventListener("click", () => {
    state.infoOpen = false;
    infoDrawer?.classList.add("hidden");
  });

  // ── Drawer admin panel (WhatsApp-style room management) ──

  const isAdmin = () => {
    const thread = activeThread(state);
    const me = window.currentUser;
    return thread?.kind === "room" && me && Number(thread.createdBy) === Number(me.id);
  };

  async function renderRoomAdminPanel(thread) {
    if (!thread || thread.kind !== "room") {
      roomAdminSection?.classList.add("hidden");
      return;
    }

    const me = window.currentUser;
    const canManage = me && Number(thread.createdBy) === Number(me.id);

    // Ensure members are fresh from the server.
    if (typeof getRoomMembers === "function") {
      try {
        const members = await getRoomMembers(thread.id);
        thread.members = Array.isArray(members) ? members : [];
      } catch (error) {
        console.warn("Failed to refresh room members", error);
      }
    }

    const members = thread.members || [];
    roomAdminSection?.classList.remove("hidden");
    roomAddMemberToggle?.classList.toggle("hidden", !canManage);
    if (roomNameValue) roomNameValue.textContent = thread.title || "Room";
    roomNameEditBtn?.classList.toggle("hidden", !canManage);

    // Render member list
    if (roomMembersList) {
      roomMembersList.innerHTML = members.map((member) => {
        const isCreator = Number(member.id) === Number(thread.createdBy);
        const label = isCreator ? `${escapeHTML(member.username || "User")} (Admin)` : escapeHTML(member.username || "User");
        const initials = (member.username || "U").split(/[^a-zA-Z0-9]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "U";
        const avatarAttr = Number.isFinite(Number(member.id)) ? `data-avatar-user-id="${Number(member.id)}"` : "";
        const canRemove = canManage && !isCreator && Number(member.id) !== Number(me.id);
        const removeBtn = canRemove
          ? `<button class="room-member-remove" data-remove-member-id="${Number(member.id)}" data-remove-member-name="${escapeHTML(member.username || "")}" title="Remove member" type="button">×</button>`
          : "";
        return `
          <div class="room-member-row" data-member-id="${Number(member.id)}">
            <div class="room-member-info">
              <span class="avatar avatar-sm ${avatarAttr ? 'avatar-has-image' : ''}" ${avatarAttr}>${escapeHTML(initials)}</span>
              <span class="room-member-name">${label}</span>
            </div>
            ${removeBtn}
          </div>
        `;
      }).join("");
      // Decorate member avatars
      if (typeof window.decorateAvatars === "function") {
        window.decorateAvatars(roomMembersList);
      }
    }
  }

  // Make window.renderRoomAdminPanel available for the avatar-updated listener.
  window.renderRoomAdminPanel = renderRoomAdminPanel;

  // Name edit toggle
  roomNameEditBtn?.addEventListener("click", () => {
    const thread = activeThread(state);
    if (!thread) return;
    roomNameDisplay?.classList.add("hidden");
    roomNameEditBtn?.classList.add("hidden");
    roomNameEdit?.classList.remove("hidden");
    if (roomNameInputInline) {
      roomNameInputInline.value = thread.title || "";
      roomNameInputInline.focus();
    }
  });

  roomNameCancelBtn?.addEventListener("click", () => {
    roomNameDisplay?.classList.remove("hidden");
    roomNameEditBtn?.classList.remove("hidden");
    roomNameEdit?.classList.add("hidden");
  });

  roomNameSaveBtn?.addEventListener("click", async () => {
    const thread = activeThread(state);
    if (!thread || thread.kind !== "room") return;
    const newName = roomNameInputInline?.value?.trim();
    if (!newName) return;
    try {
      await updateRoom(thread.id, { name: newName });
      thread.title = newName;
      thread.initials = newName.substring(0, 2).toUpperCase();
      if (roomNameValue) roomNameValue.textContent = newName;
      // Refresh header and thread list
      updateConversationMeta(thread);
      renderThreads(state);
      roomNameDisplay?.classList.remove("hidden");
      roomNameEditBtn?.classList.remove("hidden");
      roomNameEdit?.classList.add("hidden");
    } catch (error) {
      alert(error?.message || "Failed to update room name.");
    }
  });

  roomNameInputInline?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); roomNameSaveBtn?.click(); }
    if (e.key === "Escape") roomNameCancelBtn?.click();
  });

  // Remove member
  roomMembersList?.addEventListener("click", async (event) => {
    const removeBtn = event.target.closest(".room-member-remove");
    if (!removeBtn) return;
    const memberId = Number(removeBtn.dataset.removeMemberId);
    const memberName = removeBtn.dataset.removeMemberName || "this user";
    if (!confirm(`Remove ${memberName} from the room?`)) return;
    const thread = activeThread(state);
    if (!thread || thread.kind !== "room") return;
    try {
      await removeRoomMember(thread.id, memberId);
      await renderRoomAdminPanel(thread);
      renderThreads(state);
    } catch (error) {
      alert(error?.message || "Failed to remove member.");
    }
  });

  // Add member picker in drawer
  roomAddMemberToggle?.addEventListener("click", () => {
    roomAddMemberPicker?.classList.toggle("hidden");
    if (!roomAddMemberPicker?.classList.contains("hidden")) {
      roomAddMemberSearch?.focus();
    }
  });

  let addMemberSearchTimer = null;
  roomAddMemberSearch?.addEventListener("input", () => {
    if (addMemberSearchTimer) clearTimeout(addMemberSearchTimer);
    addMemberSearchTimer = setTimeout(async () => {
      const query = roomAddMemberSearch.value?.trim() || "";
      if (!query || !roomAddMemberResults) {
        roomAddMemberResults?.classList.add("hidden");
        return;
      }
      roomAddMemberResults.classList.remove("hidden");
      roomAddMemberResults.innerHTML = '<div class="member-picker-state muted">Searching…</div>';
      try {
        const users = await searchUsers(query);
        const thread = activeThread(state);
        const memberIds = new Set((thread?.members || []).map((m) => Number(m.id)));
        const list = (Array.isArray(users) ? users : [])
          .filter((u) => u && u.username)
          .filter((u) => Number(u.id) !== Number(currentUser.id))
          .filter((u) => !memberIds.has(Number(u.id)));
        if (list.length === 0) {
          roomAddMemberResults.innerHTML = '<div class="member-picker-state muted">No new users to add.</div>';
          return;
        }
        roomAddMemberResults.innerHTML = list.map((user) => {
          const initials = (user.username || "U").split(/[^a-zA-Z0-9]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "U";
          return `
            <button type="button" class="member-result" data-member-id="${Number(user.id)}" data-member-username="${escapeHTML(user.username)}">
              <div class="avatar">${escapeHTML(initials)}</div>
              <div class="member-result-copy">
                <div class="member-result-name">${escapeHTML(user.username)}</div>
                <div class="member-result-meta">Approved user</div>
              </div>
              <div class="member-result-action">Add</div>
            </button>
          `;
        }).join("");
      } catch (error) {
        roomAddMemberResults.innerHTML = '<div class="member-picker-state error">Search failed.</div>';
      }
    }, 250);
  });

  roomAddMemberResults?.addEventListener("click", async (event) => {
    const btn = event.target.closest(".member-result");
    if (!btn) return;
    event.preventDefault();
    const id = Number(btn.dataset.memberId);
    const username = btn.dataset.memberUsername;
    const thread = activeThread(state);
    if (!thread || thread.kind !== "room") return;
    try {
      await addRoomMember(thread.id, { user_id: id });
      roomAddMemberSearch.value = "";
      roomAddMemberResults?.classList.add("hidden");
      await renderRoomAdminPanel(thread);
      renderThreads(state);
    } catch (error) {
      alert(error?.message || "Failed to add member.");
    }
  });

  roomAddMemberPicker?.addEventListener("click", (event) => event.stopPropagation());

  // Room admin toggle button - opens info drawer with admin panel for room creators
  console.log("roomAdminToggle element:", roomAdminToggle);
  if (roomAdminToggle) {
    roomAdminToggle.addEventListener("click", () => {
      console.log("Room admin toggle clicked");
      state.infoOpen = true;
      menuPopover?.classList.add("hidden");
      infoDrawer?.classList.remove("hidden");
      console.log("Info drawer opened, classes:", infoDrawer?.className);
      const thread = activeThread(state);
      console.log("Active thread for admin panel:", thread);
      if (thread?.kind === "room") {
        console.log("Rendering room admin panel");
        renderRoomAdminPanel(thread);
      }
    });
  } else {
    console.log("roomAdminToggle element not found!");
  }

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
    const thread = activeThread(state);
    if (!thread) return;

    const menuBtn = event.target.closest(".message-menu-btn");
    console.log("Menu button click:", menuBtn, "Target:", event.target);

    if (menuBtn) {
      event.stopPropagation();

      document.querySelectorAll(".message-menu").forEach(menu => {
        menu.classList.add("hidden");
      });

      const menu = document.querySelector(`[data-message-menu="${menuBtn.dataset.messageId}"]`);
      console.log("Menu element:", menu, "Message ID:", menuBtn.dataset.messageId);
      menu?.classList.toggle("hidden");

      return;
    }

    const copyBtn = event.target.closest('[data-action="copy"]');
    if (copyBtn) {

      const message = thread.messages.find(
        m => m.id === Number(copyBtn.dataset.messageId)
      );

      if (!message) return;

      await navigator.clipboard.writeText(message.text);

      document.querySelectorAll(".message-menu").forEach(menu => {
        menu.classList.add("hidden");
      });

      return;
    }

    const deleteForMeBtn = event.target.closest('[data-action="delete-me"]');

    if (deleteForMeBtn) {
      const messageId = Number(deleteForMeBtn.dataset.messageId);

        if (thread.type === "room") {

            await deleteRoomMessageForMe(
                messageId
            );

        } else {

            await deleteMessageForMe(
                messageId
            );

        }

        // Remove the deleted message from local thread messages
        const messageIndex = thread.messages.findIndex(m => m.id === messageId);
        if (messageIndex !== -1) {
          const deletedMessage = thread.messages[messageIndex];
          thread.messages.splice(messageIndex, 1);
          
          // Update thread metadata if the deleted message was the last one
          if (thread.lastMessage === deletedMessage.text || 
              (deletedMessage.type === "IMAGE" && thread.lastMessageType === "IMAGE") ||
              (deletedMessage.type === "FILE" && thread.lastMessageType === "FILE")) {
            const newLastMessage = thread.messages[thread.messages.length - 1];
            if (newLastMessage) {
              thread.lastMessage = newLastMessage.text || (newLastMessage.type === "IMAGE" ? "Image" : (newLastMessage.type === "FILE" ? newLastMessage.originalFilename : "Message"));
              thread.lastMessageType = newLastMessage.type;
              thread.lastMessageTime = newLastMessage.time;
            } else {
              thread.lastMessage = "";
              thread.lastMessageType = "TEXT";
              thread.lastMessageTime = "";
            }
            renderThreads(state);
          }
        }

        await loadMessages(
            thread.key
        );

        await loadConversations({
            preserveSelection: true
        });

        return;

    }


    const deleteAllBtn = event.target.closest('[data-action="delete-all"]');
    if (deleteAllBtn) {

      if (!confirm("Delete this message for everyone?")) return;

      document.querySelectorAll(".message-menu").forEach(menu => {
        menu.classList.add("hidden");
      });

      const messageId = Number(deleteAllBtn.dataset.messageId);

      try {

        if (thread.type === "room") {
          await deleteRoomMessage(messageId);
        } else {
          await deleteMessage(messageId);
        }

        // Remove the deleted message from local thread messages
        const messageIndex = thread.messages.findIndex(m => m.id === messageId);
        if (messageIndex !== -1) {
          const deletedMessage = thread.messages[messageIndex];
          thread.messages.splice(messageIndex, 1);
          
          // Update thread metadata if the deleted message was the last one
          if (thread.lastMessage === deletedMessage.text || 
              (deletedMessage.type === "IMAGE" && thread.lastMessageType === "IMAGE") ||
              (deletedMessage.type === "FILE" && thread.lastMessageType === "FILE")) {
            const newLastMessage = thread.messages[thread.messages.length - 1];
            if (newLastMessage) {
              thread.lastMessage = newLastMessage.text || (newLastMessage.type === "IMAGE" ? "Image" : (newLastMessage.type === "FILE" ? newLastMessage.originalFilename : "Message"));
              thread.lastMessageType = newLastMessage.type;
              thread.lastMessageTime = newLastMessage.time;
            } else {
              thread.lastMessage = "";
              thread.lastMessageType = "TEXT";
              thread.lastMessageTime = "";
            }
            renderThreads(state);
          }
        }

        await loadMessages(thread.key);
        await refreshConversations({ preserveSelection: true });

      } catch (error) {

        alert(error?.message || "Failed to delete message.");

      }

      return;
    }


    const imgEl = event.target.closest(".chat-image-preview");
    if (imgEl) {
      event.stopPropagation();
      event.preventDefault();
      const thread = activeThread(state);
      const message = thread?.messages?.find((m) => String(m.id) === String(imgEl.dataset.messageId));
      openImageViewer(imgEl.src, imgEl.alt || "image", thread, message);
      return;
    }

    const actionBtn = event.target.closest("[data-attachment-action]");
    const card = event.target.closest(".attachment-card.clickable");
    console.log("Attachment click detection:", { actionBtn, card, target: event.target, actionBtnDataset: actionBtn?.dataset });
    if (!actionBtn && !card) return;

    event.stopPropagation();
    event.preventDefault();

    const targetCard = actionBtn ? actionBtn.closest(".attachment-card.clickable") : card;
    if (!targetCard) return;

    const threadKey = targetCard.dataset.attachmentThreadKey;
    const messageId = Number(targetCard.dataset.attachmentMessageId);
    console.log("Attachment card data:", { threadKey, messageId });
    if (!threadKey || !Number.isFinite(messageId)) return;

    const attachmentThread = state.threads.find((item) => item.key === threadKey);
    console.log("Thread found:", attachmentThread);
    if (!attachmentThread) return;

    const fallbackMessage = {
      id: messageId,
      type: targetCard.dataset.attachmentKind || "FILE",
      originalFilename: targetCard.dataset.attachmentFilename || "Attachment",
      fileMeta: targetCard.dataset.attachmentFilename || "Attachment",
      attachmentId: targetCard.dataset.attachmentId ? Number(targetCard.dataset.attachmentId) : null,
      attachmentPath: targetCard.dataset.attachmentUrl || "",
      attachmentUrl: targetCard.dataset.attachmentUrl || ""
    };

    const message = (attachmentThread.messages || []).find((item) => String(item.id) === String(messageId)) || fallbackMessage;
    console.log("Message found:", message);

    const action = actionBtn?.dataset.attachmentAction || "view";
    console.log("Attachment action clicked:", action, "actionBtn:", actionBtn);
    if (action === "download") {
      console.log("Calling downloadAttachment for:", message);
      await downloadAttachment(attachmentThread, message);
    } else {
      console.log("Calling openAttachmentViewer for:", message);
      openAttachmentViewer(attachmentThread, message);
    }

    closeMessageMenu();

  });

  attachmentModalBackdrop?.addEventListener("click", () => closeAttachmentModal());
  attachmentModalClose?.addEventListener("click", () => closeAttachmentModal());

  messageMenuBackdrop?.addEventListener("click", () => closeMessageMenu());
  messageMenuSurface?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  async function handleMessageMenuAction(event) {
    const thread = activeThread(state);
    if (!thread) return;

    const copyBtn = event.target.closest('[data-action="copy"]');
    if (copyBtn) {
      const message = thread.messages.find(
        (m) => Number(m.id) === Number(copyBtn.dataset.messageId)
      );
      if (!message) return;
      await navigator.clipboard.writeText(message.text || "");
      closeMessageMenu();
      return;
    }

    const deleteForMeBtn = event.target.closest('[data-action="delete-me"]');
    if (deleteForMeBtn) {
      const messageId = Number(deleteForMeBtn.dataset.messageId);

      if (thread.type === "room") {
        await deleteRoomMessageForMe(messageId);
      } else {
        await deleteMessageForMe(messageId);
      }

      const messageIndex = thread.messages.findIndex((m) => m.id === messageId);
      if (messageIndex !== -1) {
        const deletedMessage = thread.messages[messageIndex];
        thread.messages.splice(messageIndex, 1);

        if (
          thread.lastMessage === deletedMessage.text ||
          (deletedMessage.type === "IMAGE" && thread.lastMessageType === "IMAGE") ||
          (deletedMessage.type === "FILE" && thread.lastMessageType === "FILE")
        ) {
          const newLastMessage = thread.messages[thread.messages.length - 1];
          if (newLastMessage) {
            thread.lastMessage = newLastMessage.text || (newLastMessage.type === "IMAGE" ? "Image" : (newLastMessage.type === "FILE" ? newLastMessage.originalFilename : "Message"));
            thread.lastMessageType = newLastMessage.type;
            thread.lastMessageTime = newLastMessage.time;
          } else {
            thread.lastMessage = "";
            thread.lastMessageType = "TEXT";
            thread.lastMessageTime = "";
          }
          renderThreads(state);
        }
      }

      await loadMessages(thread.key);
      await loadConversations({ preserveSelection: true });
      closeMessageMenu();
      return;
    }

    const deleteAllBtn = event.target.closest('[data-action="delete-all"]');
    if (deleteAllBtn) {
      if (!confirm("Delete this message for everyone?")) return;
      const messageId = Number(deleteAllBtn.dataset.messageId);

      try {
        if (thread.type === "room") {
          await deleteRoomMessage(messageId);
        } else {
          await deleteMessage(messageId);
        }

        const messageIndex = thread.messages.findIndex((m) => m.id === messageId);
        if (messageIndex !== -1) {
          const deletedMessage = thread.messages[messageIndex];
          thread.messages.splice(messageIndex, 1);

          if (
            thread.lastMessage === deletedMessage.text ||
            (deletedMessage.type === "IMAGE" && thread.lastMessageType === "IMAGE") ||
            (deletedMessage.type === "FILE" && thread.lastMessageType === "FILE")
          ) {
            const newLastMessage = thread.messages[thread.messages.length - 1];
            if (newLastMessage) {
              thread.lastMessage = newLastMessage.text || (newLastMessage.type === "IMAGE" ? "Image" : (newLastMessage.type === "FILE" ? newLastMessage.originalFilename : "Message"));
              thread.lastMessageType = newLastMessage.type;
              thread.lastMessageTime = newLastMessage.time;
            } else {
              thread.lastMessage = "";
              thread.lastMessageType = "TEXT";
              thread.lastMessageTime = "";
            }
            renderThreads(state);
          }
        }

        await loadMessages(thread.key);
        await refreshConversations({ preserveSelection: true });
      } catch (error) {
        alert(error?.message || "Failed to delete message.");
      }

      closeMessageMenu();
      return;
    }
  }

  messageMenuSurface?.addEventListener("click", handleMessageMenuAction);

  window.addEventListener("resize", () => {
    if (state.messageMenuOpen && state.messageMenuAnchor?.buttonEl) {
      const thread = activeThread(state);
      const message = thread?.messages?.find(
        (m) => Number(m.id) === Number(state.messageMenuAnchor.messageId)
      );
      if (message) {
        openMessageMenu(state.messageMenuAnchor.buttonEl, message, thread);
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.newChatOpen) closeNewChatModal();
    if (event.key === "Escape" && state.launcherOpen) closeLauncherModal();
    if (event.key === "Escape" && state.roomCreateOpen) closeRoomCreateModal();
    if (event.key === "Escape" && isAttachmentVisible()) closeAttachmentModal();
    if (event.key === "Escape" && state.messageMenuOpen) closeMessageMenu();
  });

  setupImageViewerEvents();

  // Refresh avatars app-wide after a profile image upload.
  window.addEventListener("vagmi-avatar-updated", async () => {
    const thread = activeThread(state);
    if (thread) {
      renderMessages(thread);
      updateInfoDrawer(thread);
      if (thread.kind === "room") {
        renderRoomAdminPanel?.(thread);
      }
    }
    renderThreads(state);
  });

  async function initialize() {
    try {
      const savedThreadKey = getSavedActiveThreadKey();
      await refreshConversations({ preserveSelection: false });

      if (savedThreadKey !== null && state.threads.some((thread) => thread.key === savedThreadKey)) {
        await openThread(savedThreadKey, { remember: false, markAsRead: false });
      } else {
        state.activeThreadId = null;
        state.activeThreadKey = null;
        saveActiveThreadKey(null);
        showConversationEmptyState(state);
        scrollMessagesToBottom();
      }
      
      startConversationPolling();

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

let refreshTimer = null;

function startConversationPolling() {

  if (refreshTimer) {
    clearInterval(refreshTimer);
  }

  refreshTimer = setInterval(async () => {

    

    try {

      await loadConversations({
        preserveSelection: true
      });

    } catch (error) {

      console.error(
        "Polling failed:",
        error
      );

    }

  }, 2000);

}

