// desktop/web/pages/chat/core/message.js

import { escapeHTML, formatTime } from "./utils.js";
import { iconMap } from "./icons.js";
import { buildAttachmentUrl, buildAttachmentCard } from "./attachment.js";

import {
  clearConversationCanvas,
  updateConversationMeta,
  updateInfoDrawer,
  renderThreads,
  decorateAvatars
} from "./ui.js";

import {
  activeThread
} from "./conversation.js";





function attachmentLabel(message) {
  return message?.originalFilename || message?.fileMeta || "Attachment";
}

export function messageHTML(thread, message) {
  const sideClass = message.sender === "self" ? "self" : "other";
  const senderLine =
    message.sender === "other"
      ? `<div class="message-sender">
           <span class="message-sender-name">${escapeHTML(message.senderName || "Sender")}</span>
         </div>`
      : "";

  if (message.type === "TEXT") {
    return `
      <div class="message-row ${sideClass}">
        <div class="message-bubble">

          ${messageMenuHTML(message)}

          ${senderLine ? `<div class="message-meta">${senderLine}</div>` : ""}
          <div class="message-text">${escapeHTML(message.text || "")}</div>
          <div class="message-time mono">${escapeHTML(message.time || "")}</div>
        </div>
      </div>
    `;
  }

    if (message.type === "VOICE") {

      const audioUrl = buildAttachmentUrl(thread, message) || `/api/dm/voice/${message.id}`;

      return `
        <div class="message-row ${sideClass}">
          <div class="message-bubble">

            ${messageMenuHTML(message)}

            ${
              senderLine
                ? `<div class="message-meta">${senderLine}</div>`
                : ""
            }

            <div class="voice-card">

              <audio
                controls
                preload="metadata"
                class="voice-player"
              >
                <source
                  src="${audioUrl}"
                  type="audio/webm"
                >
              </audio>

            </div>

            <div class="message-time mono">
              ${escapeHTML(message.time)}
            </div>

          </div>
        </div>
      `;
    }


  if (message.type === "IMAGE") {
  const imageUrl = buildAttachmentUrl(thread, message);
  
  return `
    <div class="message-row ${sideClass}">
      <div class="message-bubble">

        ${messageMenuHTML(message)}
        ${senderLine ? `<div class="message-meta">${senderLine}</div>` : ""}
        
        <img
    class="chat-image-preview"
    data-thread-key="${thread.key || `${thread.type}:${String(thread.id)}`}"
    data-message-id="${message.id}"
    data-attachment-url="${escapeHTML(buildAttachmentUrl(thread, message))}"
    data-attachment-filename="${escapeHTML(attachmentLabel(message) || "Image")}"
    alt="${escapeHTML(attachmentLabel(message) || "Image")}"
    style="
        max-width:240px;
        max-height:240px;
        width:auto;
        height:auto;
        border-radius:10px;
        cursor:pointer;
        display:block;
        object-fit:cover;
    "
/>
        <div class="message-time mono">${escapeHTML(message.time || "")}</div>
      </div>
    </div>
  `;
  }

  if (message.type === "FILE") {
    return `
      <div class="message-row ${sideClass}">
        <div class="message-bubble">

         ${messageMenuHTML(message)}

          ${senderLine ? `<div class="message-meta">${senderLine}</div>` : ""}
          ${buildAttachmentCard(thread, message)}
          <div class="message-time mono">${escapeHTML(message.time || "")}</div>
        </div>
      </div>
    `;
  }
  return "";
}


function messageMenuHTML(message) {

  return `
    <button
      class="message-menu-btn"
      data-message-id="${message.id}"
      title="Message options"
    >
      ⋮
    </button>

    <div
      class="message-menu hidden"
      data-message-menu="${message.id}"
    >

      ${
        message.type === "TEXT"
          ? `
          <button
            class="message-menu-item"
            data-action="copy"
            data-message-id="${message.id}"
          >
            Copy
          </button>
          `
          : ""
      }

      <button
        class="message-menu-item"
        data-action="delete-me"
        data-message-id="${message.id}"
      >
        Delete for Me
      </button>

      ${
        message.sender === "self"
          ? `
          <button
            class="message-menu-item danger"
            data-action="delete-all"
            data-message-id="${message.id}"
          >
            Delete for Everyone
          </button>
          `
          : ""
      }

    </div>
  `;
}



export async function loadInlineImages() {
  const state = window.chatState;
  const fetchAttachmentBlob = window.fetchAttachmentBlob;
  const openImageViewer = window.openImageViewer;

  const images = document.querySelectorAll(".chat-image-preview");

  for (const img of images) {
    const threadKey = img.dataset.threadKey;
    const messageId = Number(img.dataset.messageId);
    const attachmentUrl = img.dataset.attachmentUrl || "";
    const attachmentName = img.dataset.attachmentFilename || "Image";

    const thread = state.threads.find((t) => t.key === threadKey);
    const message = thread?.messages?.find((m) => Number(m.id) === messageId) || null;

    try {
      let blob;

      if (thread && message) {
        ({ blob } = await fetchAttachmentBlob(thread, message));
      } else if (attachmentUrl) {
        const response = await window.apiRequest(attachmentUrl);
        if (!response.ok) {
          throw new Error("Failed to load image");
        }
        blob = await response.blob();
      } else {
        continue;
      }

      const blobUrl = URL.createObjectURL(blob);
      img.src = blobUrl;
      img.onclick = () => {
        openImageViewer(
          blobUrl,
          message?.originalFilename || attachmentName,
          thread,
          message || { id: messageId, originalFilename: attachmentName }
        );
      };
    } catch (err) {
      console.error("Image load failed:", err);
    }
  }
}

export function renderMessages(thread) {
  const state = window.chatState;
  const messagesScroll = document.getElementById("messages-scroll");
  const dayChip = document.getElementById("day-chip");
  const scrollMessagesToBottom = window.scrollMessagesToBottom;
  const loadInlineImages = window.loadInlineImages;
  
  if (!thread || state.activeThreadKey !== thread.key) {
    clearConversationCanvas(messagesScroll, dayChip);
    return;
  }

  const messages = thread.messages.filter((msg) => msg.type !== "DAY");
  const term = state.convoSearch.trim().toLowerCase();

  const filtered = !term
    ? messages
    : messages.filter((msg) => {
        const haystack = [
          msg.senderName || "",
          msg.text || "",
          msg.originalFilename || "",
          msg.fileMeta || ""
        ].join(" ").toLowerCase();
        return haystack.includes(term);
      });

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
    dayChip.hidden = true;
    return;
  }

  if (dayChip) {
    dayChip.hidden = false;
    dayChip.textContent = "Today";
  }
  if (messagesScroll) {
    messagesScroll.innerHTML = filtered.map((message) => messageHTML(thread, message)).join("");
  }

  loadInlineImages();
  decorateAvatars(messagesScroll);

  scrollMessagesToBottom();
}

export async function loadMessages(conversationId, loadToken = 0) {
  const state = window.chatState;
  const getMessages = window.getMessages;
  const getRoomMessages = window.getRoomMessages;
  const currentUser = window.currentUser;
  const formatTime = window.formatTime;
  const scrollMessagesToBottom = window.scrollMessagesToBottom;

  try {
    const lookupKey = typeof conversationId === "string" && conversationId.includes(":")
      ? conversationId
      : null;

    const numericConversationId = Number(conversationId);
    const thread = state.threads.find((t) => (
      lookupKey ? t.key === lookupKey : t.id === numericConversationId
    ));

    if (!thread) return;

    const messages =
      thread.type === "room"
        ? await getRoomMessages(thread.id)
        : await getMessages(thread.id);

    // Ignore stale requests
    if (loadToken !== 0 && loadToken !== window.loadSequence) {
      return;
    }

    thread.messages = (messages || []).map((message) => {
      const senderName = message.sender_username || "Unknown";
      const isSelf = senderName === (currentUser?.username || "");

      const attachmentName =
        message.original_filename ||
        message.originalFilename ||
        (typeof message.attachment_path === "string"
          ? message.attachment_path.split(/[\\/]/).pop()
          : "") ||
        "";

      return {
        id: message.id,
        sender: isSelf ? "self" : "other",
        senderName,
        senderId: message.sender_id,
        type: (message.message_type || "TEXT").toUpperCase(),
        text: message.message_text || "",
        originalFilename: attachmentName,
        attachmentPath: message.attachment_path || "",
        attachmentId: message.attachment_id || null,
        fileMeta: attachmentName,
        createdAt: message.created_at,
        time: formatTime(message.created_at)
      };
    });

    updateConversationMeta(thread);
    updateInfoDrawer(thread);
    renderMessages(thread);

    requestAnimationFrame(() => {
      scrollMessagesToBottom();
    });

  } catch (error) {
    console.error("Failed loading messages", error);
  }
}

export async function handleSend() {
  const state = window.chatState;
  const inputField = document.getElementById("message-input");
  const sendMessage = window.sendMessage;
  const sendRoomMessage = window.sendRoomMessage;
  const scrollMessagesToBottom = window.scrollMessagesToBottom;

  const thread = activeThread(state);
  if (!thread) return;

  const text = inputField?.value?.trim();
  if (!text) return;

  try {
    if (inputField) {
      inputField.value = "";
      inputField.style.height = "44px";
      inputField.style.overflowY = "hidden";
    }

    if (thread.type === "room") {
      await sendRoomMessage(thread.id, text);
    } else {
      await sendMessage(thread.id, text);
    }

    thread.lastMessage = text;
    thread.lastMessageType = "TEXT";
    thread.lastMessageTime = formatTime(new Date());
    thread.unread = 0;

    await loadMessages(thread.key);

    renderThreads(state);

    requestAnimationFrame(() => {
      scrollMessagesToBottom();
    });

  } catch (error) {
    console.error("Message send failed", error);
    setComposerText(inputField, text);
  }
}

export function setComposerText(inputField, text) {
  if (inputField) {
    inputField.value = text;
    inputField.dispatchEvent(new Event("input"));
  }
}

export async function handleAttachment(file, forceType = null) {
  const state = window.chatState;
  const sendImage = window.sendImage;
  const sendRoomImage = window.sendRoomImage;
  const uploadRoomAttachment = window.uploadRoomAttachment;
  const uploadDmAttachment = window.uploadDmAttachment;
  const loadMessages = window.loadMessages;
  const renderThreads = window.renderThreads;
  const scrollMessagesToBottom = window.scrollMessagesToBottom;
  const formatTime = window.formatTime;
  const thread = activeThread(state);
  if (!thread) return;

  const type = forceType || (file.type.startsWith("image/") ? "IMAGE" : "FILE");

  try {
    if (type === "IMAGE") {
      const uploader = thread.type === "room" ? sendRoomImage : sendImage;
      if (typeof uploader !== "function") throw new Error("Image upload is not available.");
      await uploader(thread.id, file);
    } else {
      const uploader = thread.type === "room" ? uploadRoomAttachment : uploadDmAttachment;
      if (typeof uploader !== "function") throw new Error("Attachment upload is not available.");
      await uploader(thread.id, file);
    }

    await loadMessages(thread.key);
    thread.lastMessage = file.type.startsWith("image/") ? "Image" : file.name;
    thread.lastMessageType = file.type.startsWith("image/") ? "IMAGE" : "FILE";
    thread.lastMessageTime = formatTime(new Date());
    renderThreads(state);
    requestAnimationFrame(() => scrollMessagesToBottom());
  } catch (error) {
    console.error("Attachment send failed", error);
    alert(error?.message || "Failed to send attachment.");
  }
}

