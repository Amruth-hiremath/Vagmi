// desktop/web/pages/chat/core/conversation.js

import { saveActiveThreadKey, makeThreadKey, getRoomReadMarker, setRoomReadMarker } from "./state.js";
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
      const lastVisible = thread.messages?.[thread.messages.length - 1];
      if (lastVisible?.createdAt || lastVisible?.created_at) {
        setRoomReadMarker(thread.id, lastVisible.createdAt || lastVisible.created_at);
      } else {
        setRoomReadMarker(thread.id, new Date().toISOString());
      }
      thread.unread = 0;
      updateConversationMeta(thread);
      updateInfoDrawer(thread);
      renderThreads(state);
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
  const getRoomMessages = window.getRoomMessages;
  const currentUser = window.currentUser;
  const activeKey = preserveSelection ? state.activeThreadKey : null;

  const [conversations, rooms] = await Promise.all([
    typeof getConversations === "function" ? getConversations() : Promise.resolve([]),
    typeof getRooms === "function" ? getRooms() : Promise.resolve([])
  ]);

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

  const roomThreads = await Promise.all((rooms || []).map(async (room) => {
    const roomKey = makeThreadKey("room", room.id);
    let messages = [];
    let lastMessage = "";
    let lastMessageType = "TEXT";
    let lastMessageTime = "";
    let unread = 0;

    try {
      if (typeof getRoomMessages === "function") {
        messages = await getRoomMessages(room.id);
      }
    } catch (error) {
      console.error(`Failed loading room preview for room ${room.id}`, error);
    }

    if (Array.isArray(messages) && messages.length > 0) {
      const last = messages[messages.length - 1];
      const kind = String(last.message_type || "TEXT").toUpperCase();
      lastMessageType = kind;
      if (kind === "IMAGE") {
        lastMessage = "Image";
      } else if (kind === "FILE") {
        lastMessage = last.original_filename || "File";
      } else if (kind === "VOICE") {
        lastMessage = "Voice message";
      } else {
        lastMessage = last.message_text || "Message";
      }
      lastMessageTime = formatTime(last.created_at);

      const readMarker = getRoomReadMarker(room.id);
      const readTs = readMarker ? Date.parse(readMarker) : 0;
      unread = messages.filter((message) => {
        const ts = Date.parse(message.created_at || "");
        const senderId = Number(message.sender_id ?? 0);
        return Number.isFinite(ts) && ts > readTs && senderId !== currentUser.id;
      }).length;
    }

    if (activeKey === roomKey) {
      unread = 0;
    }

    return {
      id: Number(room.id),
      key: roomKey,
      type: "room",
      kind: "room",
      title: room.name,
      initials: (room.name || "RM").substring(0, 2).toUpperCase(),
      status: "Room",
      unread,
      lastMessage,
      lastMessageSender: "",
      lastMessageType,
      lastMessageTime,
      members: [],
      messages: []
    };
  }));

  state.threads = [...dmThreads, ...roomThreads];
  renderThreads(state);

  if (activeKey && state.threads.some((thread) => thread.key === activeKey)) {
    await openThread(activeKey, { remember: false });
    return;
  }

  state.activeThreadId = null;
  state.activeThreadKey = null;
  saveActiveThreadKey(null);
  showConversationEmptyState(state);
}

