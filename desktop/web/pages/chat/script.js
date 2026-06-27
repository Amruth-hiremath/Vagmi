// desktop/web/pages/chat/script.js
import {
  getConversations,
  getMessages,
  sendMessage,
  sendImage,
  sendVoice,
  markConversationRead,
  startConversation,
  clearConversation,
  deleteMessage
} from "../../services/dm.js";
import {
  
  sendRoomMessage,
  sendRoomImage,
  sendRoomVoice,
  
} from "../../services/rooms.js";
import { searchUsers } from "../../services/users.js";
import { apiRequest } from "../../services/api.js";
import { getUser } from "../../services/auth.js";
import {
  getRooms,
  getRoom,
  getRoomMessages,
  sendRoomMessage,
  createRoom,
  getRoomMembers,
  addRoomMember,
  removeRoomMember,
  deleteRoom
} from "../../services/rooms.js";

import { escapeHTML, formatTime, formatFileSize } from "./core/utils.js";
import { saveActiveThreadId, getSavedActiveThreadId } from "./core/state.js";
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
  loadConversations,
  
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
import {
  currentSearchUpdate,
  searchRegisteredUsers,
  startChatWithUser
} from "./core/search.js";

document.addEventListener("DOMContentLoaded", () => {
  const currentUser = getUser();
  
  const state = {
  activeThreadId: null,
  threadFilter: "all",
  chatSearch: "",
  convoSearch: "",
  menuOpen: false,
  infoOpen: false,
  newChatOpen: false,
  threads: [],
  rooms: [],
  activeRoomId: null,
  chatMode: "direct"
};

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;



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

// Make necessary variables globally accessible for core functions
window.loadSequence = 0;
window.getConversations = getConversations;
window.getRooms = getRooms;
window.scrollMessagesToBottom = scrollMessagesToBottom;
window.sendMessage = sendMessage;
window.sendImage = sendImage;
window.formatTime = formatTime;
window.formatFileSize = formatFileSize;
window.renderThreads = renderThreads;
window.markConversationRead = markConversationRead;
window.loadMessages = loadMessages;
window.getMessages = getMessages;
window.fetchAttachmentBlob = fetchAttachmentBlob;
window.openImageViewer = openImageViewer;
window.loadInlineImages = loadInlineImages;
window.currentUser = currentUser;
window.chatState = state;
window.updateConversationMeta = updateConversationMeta;
window.updateInfoDrawer = updateInfoDrawer;
window.activeThread = activeThread;
window.sendVoice = sendVoice;
window.clearConversation = clearConversation;
window.deleteMessage = deleteMessage;
window.apiRequest = apiRequest;
window.getRoomMessages = getRoomMessages;
window.sendRoomMessage = sendRoomMessage;

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
const createRoomBtn = document.getElementById("create-room-btn");

document.querySelectorAll("[data-icon]").forEach((el) => {
  const iconName = el.dataset.icon;
  el.innerHTML = iconMap[iconName] || "";
});

threadList.addEventListener("click", (event) => {
  const btn = event.target.closest(".thread-item");
  if (!btn) return;
  const threadId = Number(btn.dataset.threadId);
  if (!Number.isFinite(threadId)) return;
  openThread(threadId, { remember: true });
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

threadNewChatBtn?.addEventListener("click", () => openNewChatModal());

attachBtn?.addEventListener("click", () => fileInput?.click());
imageBtn?.addEventListener("click", () => imageInput?.click());

createRoomBtn?.addEventListener("click",async () => {

    const roomName = prompt(
      "Enter group name"
    );

    if (!roomName?.trim()) {
      return;
    }

    try {

      const room = await createRoom(roomName.trim());

      await loadConversations({
          preserveSelection: false
      });
      await openThread(room.id);

    } catch (error) {

      alert(
        error.message ||
        "Failed to create group."
      );

    }

  }
);

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

    const thread = activeThread(state);

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

        mediaRecorder.onstop = async () => {

          try {

              const blob = new Blob(recordedChunks, {
                  type: "audio/webm"
              });

              const file = new File(
                  [blob],
                  `voice-${Date.now()}.webm`,
                  {
                      type: "audio/webm"
                  }
              );

              await sendVoice(thread.id, file);

              await loadMessages(thread.id);

              requestAnimationFrame(() =>
                  scrollMessagesToBottom()
              );

          } catch (error) {

              console.error(
                  "Voice upload failed",
                  error
              );

          } finally {

              mediaRecorder?.stream
                  ?.getTracks()
                  .forEach(track => track.stop());

              mediaRecorder = null;

              isRecording = false;

              micBtn.classList.remove("recording");
          }
      };

          

       
      }

    } catch (error) {

      console.error(
        "Voice recording failed",
        error
      );
    }
  }
);

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
  conversationSearch.focus();
});

closeSearch?.addEventListener("click", () => {
  conversationSearchRow.classList.add("hidden");
  state.convoSearch = "";
  conversationSearch.value = "";
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
    target.closest("#attachment-modal") ||
    target.closest(".menu-popover") 
  ) {
    return;
  }
  closeOverlays(state);
});

menuPopover?.addEventListener("click", async (event)=> {
  event.stopPropagation();
  const btn = event.target.closest(".menu-item");
  if (!btn) return;

  const action = btn.dataset.menu;
  closeOverlays(state);

  if (action === "search") {
    conversationSearchRow.classList.remove("hidden");
    conversationSearch.focus();
  }

  if (action === "clear") {

    const thread = activeThread(state);

    if (!thread) return;

    const confirmed = confirm(
      "Clear this conversation? This only removes it from your view."
    );

    if (!confirmed) {
      return;
    }

    try {

      await clearConversation(thread.id);

      const id = thread.id;

      await loadConversations({ preserveSelection: false });

      await openThread(id);

    } catch (error) {

      alert(
        error.message ||
        "Failed to clear conversation."
      );

    }
  }

  if (action === "info") {
    state.infoOpen = !state.infoOpen;
    infoDrawer.classList.toggle("hidden", !state.infoOpen);
  }
});

newChatClose?.addEventListener("click", () => closeNewChatModal());
newChatBackdrop?.addEventListener("click", () => closeNewChatModal());

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

messagesScroll.addEventListener("click", async (event) => {
  const deleteBtn = event.target.closest(".delete-message-btn");

  if (deleteBtn) {

    const messageId = Number(deleteBtn.dataset.messageId);

    if (
      !confirm(
        "Delete this message?"
      )
    ) {
      return;
    }

    try {

      await deleteMessage(messageId);

      const thread = activeThread(state);

      if (!thread) return;

      await loadMessages(thread.id);

      await loadConversations({ preserveSelection: true });

    } catch (error) {

      alert(
        error.message ||
        "Failed to delete message."
      );

    }

    return;
  }
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

attachmentModalBackdrop?.addEventListener("click", () => closeAttachmentModal());
attachmentModalClose?.addEventListener("click", () => closeAttachmentModal());

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.newChatOpen) {
    closeNewChatModal();
  }
  if (event.key === "Escape" && attachmentModal && !attachmentModal.classList.contains("hidden")) {
    closeAttachmentModal();
  }
});

setupImageViewerEvents();



async function initialize() {
  try {
    const savedThreadId = getSavedActiveThreadId();

    await loadConversations({ preserveSelection: false });
    


    if (savedThreadId !== null && state.threads.some((thread) => thread.id === savedThreadId)) {
      await openThread(savedThreadId, { remember: false });
    } else {
      state.activeThreadId = null;
      saveActiveThreadId(null);
      showConversationEmptyState(state);
      scrollMessagesToBottom();
    }
  } catch (error) {
    console.error("Conversation load failed", error);
    state.activeThreadId = null;
    saveActiveThreadId(null);
    showConversationEmptyState(state);
  }
}

initialize();
});
