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
import { getDesktopBridge } from "../../../services/desktop.js";
export function activeThread(state) {
  return state.threads.find((thread) => thread.key === state.activeThreadKey) || null;
}

function broadcastUnreadCount(threads) {
  const totalUnread = Array.isArray(threads)
    ? threads.reduce((total, thread) => total + (Number(thread?.unread) || 0), 0)
    : 0;

  const payload = {
    type: "chat-unread-count",
    count: totalUnread
  };

  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, window.location.origin);
    }
  } catch (error) {
    console.warn("Failed to broadcast unread count:", error);
  }
}

export async function openThread(threadRef, { remember = true, markAsRead = true, preserveScroll = false } = {}) {
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
  broadcastUnreadCount(state.threads);

  window.loadSequence += 1;
  const currentSequence = window.loadSequence;

  const loadMessages = window.loadMessages;
  const getRoomMembers = window.getRoomMembers;

  await loadMessages(requestedKey, currentSequence, { preserveScroll });
  if (currentSequence !== window.loadSequence) return;

  if (thread.type === "room" && typeof getRoomMembers === "function") {
    try {
      const members = await getRoomMembers(thread.id);
      thread.members = Array.isArray(members) ? members : [];
      if (markAsRead) {
        const markRoomRead = window.markRoomRead;
        try {
          if (typeof markRoomRead === "function") {
            await markRoomRead(thread.id);
          }
        } catch (markError) {
          console.error("Failed marking room as read", markError);
        }

        const lastVisible = thread.messages?.[thread.messages.length - 1];
        const lastVisibleId = Number(lastVisible?.id ?? lastVisible?.message_id);
        const lastVisibleTimestamp = lastVisible?.createdAt || lastVisible?.created_at || lastVisible?.timestamp || lastVisible?.sentAt || "";
        if (Number.isFinite(lastVisibleId)) {
          setRoomReadMarker(thread.id, String(lastVisibleId));
        } else if (lastVisibleTimestamp) {
          setRoomReadMarker(thread.id, lastVisibleTimestamp);
        } else {
          setRoomReadMarker(thread.id, new Date().toISOString());
        }
        thread.unread = 0;
      }
      updateConversationMeta(thread);
      updateInfoDrawer(thread);
      renderThreads(state);
      broadcastUnreadCount(state.threads);
    } catch (error) {
      console.error("Failed loading room members", error);
    }
  } else {
    try {
      if (markAsRead) {
        const markConversationRead = window.markConversationRead;
        await markConversationRead(thread.id);
        thread.unread = 0;
        renderThreads(state);
        broadcastUnreadCount(state.threads);
      }
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

export async function loadConversations({ preserveSelection = true, preserveMessageScroll = false } = {}) {
  const state = window.chatState;
  const getConversations = window.getConversations;
  const getRooms = window.getRooms;
  const getMessages = window.getMessages;
  const getRoomMessages = window.getRoomMessages;
  const currentUser = window.currentUser;
  const activeKey = preserveSelection ? state.activeThreadKey : null;
  const previousThreads = Array.isArray(state.threads) ? [...state.threads] : [];
  const previousThreadMap = new Map(previousThreads.map((thread) => [thread.key, thread]));

  const [conversations, rooms] = await Promise.all([
    typeof getConversations === "function" ? getConversations() : Promise.resolve([]),
    typeof getRooms === "function" ? getRooms() : Promise.resolve([])
  ]);

  const dmThreads = await Promise.all((conversations || []).map(async (conversation) => {
    const key = makeThreadKey("dm", conversation.conversation_id);
    const previous = previousThreadMap.get(key);
    
    // Fetch messages to calculate last message locally (like rooms)
    let messages = [];
    let last = null;
    let lastMessage = "";
    let lastMessageType = "TEXT";
    let lastMessageTime = "";
    let lastMessageTimestamp = "";
    
    try {
      if (typeof getMessages === "function") {
        messages = await getMessages(conversation.conversation_id);
      }
    } catch (error) {
      console.error(`Failed loading DM preview for conversation ${conversation.conversation_id}`, error);
    }

    if (Array.isArray(messages) && messages.length > 0) {
      last = messages[messages.length - 1];
      const kind = String(last.message_type || last.messageType || "TEXT").toUpperCase();
      const lastTimestamp = last.createdAt || last.created_at || last.timestamp || last.sentAt || "";
      lastMessageType = kind;
      if (kind === "IMAGE") {
        lastMessage = "Image";
      } else if (kind === "FILE") {
        lastMessage = last.original_filename || last.originalFilename || "File";
      } else if (kind === "VOICE") {
        lastMessage = "Voice message";
      } else {
        lastMessage = last.message_text || last.messageText || "Message";
      }
      lastMessageTime = formatTime(lastTimestamp);
      lastMessageTimestamp = lastTimestamp;

    }
    const hasNewMessage =
      previous &&
      (conversation.unread_count || 0) > (previous.unread || 0);

    return {
      id: Number(conversation.conversation_id),
      key,
      type: "dm",
      kind: "dm",
      title: conversation.username || "Conversation",
      peerId: conversation.user_id != null ? Number(conversation.user_id) : null,
      initials: (conversation.username || "VA").substring(0, 2).toUpperCase(),
      status: "Direct Message",
      lastMessageTimestamp,
      unread: conversation.unread_count || 0,
      lastMessage,
      lastMessageSender: "",
      lastMessageType,
      lastMessageTime,
      members: previous?.members || [conversation.username],
      messages: Array.isArray(previous?.messages) ? previous.messages : [],
      is_online: conversation.is_online,
      last_seen: conversation.last_seen,
      hasNewMessage
    };
  }));

  const roomThreads = await Promise.all((rooms || []).map(async (room) => {
    const roomKey = makeThreadKey("room", room.id);
    const previous = previousThreadMap.get(roomKey);
    let messages = [];
    let last = null;
    let lastMessage = "";
    let lastMessageType = "TEXT";
    let unread = Number(room.unread_count ?? 0) || 0;
    let lastMessageTime = "";
    let lastMessageTimestamp = "";

    try {
      if (typeof getRoomMessages === "function") {
        messages = await getRoomMessages(room.id);
      }
    } catch (error) {
      console.error(`Failed loading room preview for room ${room.id}`, error);
    }

    if (Array.isArray(messages) && messages.length > 0) {
      last = messages[messages.length - 1];
      const kind = String(last.message_type || last.messageType || "TEXT").toUpperCase();
      const lastTimestamp = last.createdAt || last.created_at || last.timestamp || last.sentAt || "";
      lastMessageType = kind;
      if (kind === "IMAGE") {
        lastMessage = "Image";
      } else if (kind === "FILE") {
        lastMessage = last.original_filename || last.originalFilename || "File";
      } else if (kind === "VOICE") {
        lastMessage = "Voice message";
      } else {
        lastMessage = last.message_text || last.messageText || "Message";
      }
      lastMessageTime = formatTime(lastTimestamp);
      lastMessageTimestamp = lastTimestamp;

      if (!Number.isFinite(Number(room.unread_count))) {
        const readMarker = getRoomReadMarker(room.id);
        const readMessageId = Number(readMarker);
        if (Number.isFinite(readMessageId) && readMessageId > 0) {
          unread = messages.filter((message) => {
            const messageId = Number(message.id ?? message.message_id ?? 0);
            const senderId = Number(message.sender_id ?? message.senderId ?? 0);
            return Number.isFinite(messageId) && messageId > readMessageId && senderId !== currentUser.id;
          }).length;
        } else {
          const readTs = readMarker ? Date.parse(readMarker) : 0;
          unread = messages.filter((message) => {
            const ts = Date.parse(message.createdAt || message.created_at || message.timestamp || message.sentAt || "");
            const senderId = Number(message.sender_id ?? message.senderId ?? 0);
            return Number.isFinite(ts) && ts > readTs && senderId !== currentUser.id;
          }).length;
        }
      }
    }
    const hasNewMessage =
      previous &&
      unread > (previous.unread || 0);

    if (activeKey === roomKey) {
      unread = 0;
    }

    return {
      id: Number(room.id),
      key: roomKey,
      type: "room",
      kind: "room",
      title: room.name,
      createdBy: Number(room.created_by ?? room.createdBy ?? 0),
      initials: (room.name || "RM").substring(0, 2).toUpperCase(),
      status: "Room",
      unread,
      lastMessage,
      lastMessageSender: "",
      lastMessageType,
      lastMessageTime,
      lastMessageTimestamp,
      members: Array.isArray(previous?.members) ? previous.members : [],
      messages: Array.isArray(previous?.messages) ? previous.messages : [],
      hasNewMessage
    };
  }));

  const bridge = getDesktopBridge();

  for (const thread of [...dmThreads, ...roomThreads]) {

    if (
      thread.hasNewMessage &&
      !document.hasFocus() &&
      bridge?.show_notification
    ) {

      try {

        await bridge.show_notification(
          thread.title,
          thread.lastMessage || "New message"
        );

      } catch (error) {

        console.error(
          "Failed to show desktop notification:",
          error
        );

      }

    }

  }

  state.threads = [...dmThreads, ...roomThreads];
  state.threads.sort((a, b) => {
    const ta = Date.parse(a.lastMessageTimestamp || "") || 0;
    const tb = Date.parse(b.lastMessageTimestamp || "") || 0;
    return tb - ta;
  });

  const activeThreadChanged = (() => {
    if (!activeKey) {
      return false;
    }

    const previous = previousThreadMap.get(activeKey);
    const current = state.threads.find((thread) => thread.key === activeKey);

    if (!previous || !current) {
      return true;
    }

    return (
      previous.lastMessageTimestamp !== current.lastMessageTimestamp ||
      previous.unread !== current.unread ||
      previous.lastMessage !== current.lastMessage
    );
  })();

  renderThreads(state);
  broadcastUnreadCount(state.threads);

  if (activeKey && state.threads.some((thread) => thread.key === activeKey)) {
    if (activeThreadChanged) {
      await openThread(activeKey, { remember: false, preserveScroll: preserveMessageScroll });
    } else {
      state.activeThreadKey = activeKey;
      state.activeThreadId = state.threads.find((thread) => thread.key === activeKey)?.id ?? null;
      renderThreads(state);
    }
    return;
  }

  state.activeThreadId = null;
  state.activeThreadKey = null;
  saveActiveThreadKey(null);
  showConversationEmptyState(state);
}
