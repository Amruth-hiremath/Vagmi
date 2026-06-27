// desktop/web/pages/chat/core/conversation.js

import { saveActiveThreadId } from "./state.js";
import { openConversationView, closeOverlays, updateConversationMeta, updateInfoDrawer, renderThreads, showConversationEmptyState } from "./ui.js";
import { formatTime } from "./utils.js";
import {
  closeAttachmentModal
} from "./attachment.js";
export function activeThread(state) {
  return state.threads.find((thread) => thread.id === state.activeThreadId) || null;
}

export async function openThread(threadId, { remember = true } = {}) {
  const state = window.chatState;
  const numericId = Number(threadId);
  if (!Number.isFinite(numericId)) return;

  const thread = state.threads.find((item) => item.id === numericId);
  if (!thread) return;

  state.activeThreadId = numericId;
  if (remember) {
    saveActiveThreadId(numericId);
  }

  state.convoSearch = "";
  document.getElementById("conversation-search").value = "";
  closeAttachmentModal();
  closeOverlays(state);
  openConversationView();
  updateConversationMeta(thread);
  updateInfoDrawer(thread);
  renderThreads(state);

  window.loadSequence += 1;
  const currentSequence = window.loadSequence;

  const loadMessages = window.loadMessages;
  await loadMessages(numericId, currentSequence);
  if (currentSequence !== window.loadSequence) return;

  try {
    const markConversationRead = window.markConversationRead;
    await markConversationRead(numericId);
    thread.unread = 0;
    renderThreads(state);
  } catch (error) {
    console.error("Failed marking conversation as read", error);
  }
}

export function closeConversationAndShowEmptyState() {
  const state = window.chatState;
  window.loadSequence += 1;
  state.activeThreadId = null;
  saveActiveThreadId(null);
  state.convoSearch = "";
  document.getElementById("conversation-search").value = "";
  closeAttachmentModal();
  closeOverlays(state);
  renderThreads(state);
  showConversationEmptyState(state);
}

export async function loadConversations({ preserveSelection = true } = {}) {
  const state = window.chatState;
  const getConversations = window.getConversations;
  const getRooms = window.getRooms;
  
  const [
    conversations,
    rooms
  ] = await Promise.all([
    getConversations(),
    getRooms()
  ]);
  const preservedActiveId = preserveSelection ? state.activeThreadId : null;

  const dmThreads = (conversations || []).map((conversation) => ({
    id: Number(conversation.conversation_id),
    type: "dm",
    kind: "dm",
    title: conversation.username || "Conversation",
    initials: (conversation.username || "VA")
      .substring(0, 2)
      .toUpperCase(),
    status: "Direct Message",
    unread: conversation.unread_count || 0,
    lastMessage: conversation.last_message || "",
    lastMessageSender: conversation.last_message_sender || "",
    lastMessageType: conversation.last_message_type || "TEXT",
    lastMessageTime: formatTime(
      conversation.last_message_time
    ),
    members: [conversation.username],
    messages: []
  }));

  const roomThreads = (rooms || []).map((room) => ({
    id: Number(room.id),
    type: "room",
    kind: "room",
    title: room.name,
    initials: room.name
      .substring(0, 2)
      .toUpperCase(),
    status: "Group",
    unread: 0,
    lastMessage: "",
    lastMessageSender: "",
    lastMessageType: "TEXT",
    lastMessageTime: "",
    members: [],
    messages: []
  }));

  state.threads = [
    ...dmThreads,
    ...roomThreads
  ];

  renderThreads(state);

  if (
    preservedActiveId !== null &&
    state.threads.some((thread) => thread.id === preservedActiveId)
  ) {
    await openThread(preservedActiveId, { remember: false });
    return;
  }

  state.activeThreadId = null;
  saveActiveThreadId(null);

  state.activeThreadId = null;
  saveActiveThreadId(null);
  showConversationEmptyState(state);
}


