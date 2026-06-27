// desktop/web/pages/chat/core/conversation.js

import { saveActiveThreadKey, makeThreadKey } from "./state.js";
import {
  openConversationView,
  closeOverlays,
  updateConversationMeta,
  updateInfoDrawer,
  renderThreads,
  showConversationEmptyState
} from "./ui.js";
import { formatTime } from "./utils.js";
import { closeAttachmentModal } from "./attachment.js";

export function activeThread(state) {
  return state.threads.find((thread) => thread.key === state.activeThreadKey) || null;
}

export async function openThread(threadRef, { remember = true } = {}) {
  const state = window.chatState;

  let thread = null;
  let requestedKey = null;

  if (typeof threadRef === "string" && threadRef.includes(":")) {
    requestedKey = threadRef;
    thread = state.threads.find((item) => item.key === requestedKey) || null;
  } else if (typeof threadRef === "object" && threadRef) {
    requestedKey = makeThreadKey(threadRef);
    thread = state.threads.find((item) => item.key === requestedKey) || null;
  } else {
    const numericId = Number(threadRef);
    if (Number.isFinite(numericId)) {
      thread = state.threads.find((item) => item.id === numericId) || null;
      requestedKey = thread ? (thread.key || makeThreadKey(thread)) : null;
    }
  }

  if (!thread || !requestedKey) return;

  state.activeThreadId = thread.id;
  state.activeThreadKey = requestedKey;
  if (remember) {
    saveActiveThreadKey(requestedKey);
  }

  state.convoSearch = "";
  const searchInput = document.getElementById("conversation-search");
  if (searchInput) searchInput.value = "";

  closeAttachmentModal();
  closeOverlays(state);
  openConversationView();
  updateConversationMeta(thread);
  updateInfoDrawer(thread);
  renderThreads(state);

  window.loadSequence += 1;
  const currentSequence = window.loadSequence;

  const loadMessages = window.loadMessages;
  const getRoomMembers = window.getRoomMembers;

  await loadMessages(requestedKey, currentSequence);
  if (currentSequence !== window.loadSequence) return;

  if (thread.type === "room" && typeof getRoomMembers === "function") {
    try {
      const members = await getRoomMembers(thread.id);
      thread.members = Array.isArray(members) ? members : [];
      updateConversationMeta(thread);
      updateInfoDrawer(thread);
    } catch (error) {
      console.error("Failed loading room members", error);
    }
  } else {
    try {
      const markConversationRead = window.markConversationRead;
      await markConversationRead(thread.id);
      thread.unread = 0;
      renderThreads(state);
    } catch (error) {
      console.error("Failed marking conversation as read", error);
    }
  }
}

export function closeConversationAndShowEmptyState() {
  const state = window.chatState;
  window.loadSequence += 1;
  state.activeThreadId = null;
  state.activeThreadKey = null;
  saveActiveThreadKey(null);
  state.convoSearch = "";
  const searchInput = document.getElementById("conversation-search");
  if (searchInput) searchInput.value = "";
  closeAttachmentModal();
  closeOverlays(state);
  renderThreads(state);
  showConversationEmptyState(state);
}

export async function loadConversations({ preserveSelection = true } = {}) {
  const state = window.chatState;
  const getConversations = window.getConversations;
  const getRooms = window.getRooms;

  const [conversations, rooms] = await Promise.all([
    getConversations(),
    getRooms()
  ]);

  const preservedActiveKey = preserveSelection ? state.activeThreadKey : null;

  const dmThreads = (conversations || []).map((conversation) => ({
    id: Number(conversation.conversation_id),
    key: makeThreadKey("dm", conversation.conversation_id),
    type: "dm",
    kind: "dm",
    title: conversation.username || "Conversation",
    initials: (conversation.username || "VA").substring(0, 2).toUpperCase(),
    status: "Direct Message",
    unread: conversation.unread_count || 0,
    lastMessage: conversation.last_message || "",
    lastMessageSender: conversation.last_message_sender || "",
    lastMessageType: conversation.last_message_type || "TEXT",
    lastMessageTime: formatTime(conversation.last_message_time),
    members: [conversation.username],
    messages: []
  }));

  const roomThreads = (rooms || []).map((room) => ({
    id: Number(room.id),
    key: makeThreadKey("room", room.id),
    type: "room",
    kind: "room",
    title: room.name,
    initials: (room.name || "RM").substring(0, 2).toUpperCase(),
    status: "Group",
    unread: 0,
    lastMessage: "",
    lastMessageSender: "",
    lastMessageType: "TEXT",
    lastMessageTime: "",
    members: [],
    messages: []
  }));

  state.threads = [...dmThreads, ...roomThreads];
  renderThreads(state);

  if (preservedActiveKey && state.threads.some((thread) => thread.key === preservedActiveKey)) {
    await openThread(preservedActiveKey, { remember: false });
    return;
  }

  state.activeThreadId = null;
  state.activeThreadKey = null;
  saveActiveThreadKey(null);
  showConversationEmptyState(state);
}
