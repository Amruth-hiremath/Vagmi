// desktop/web/pages/chat/core/message.js

import { escapeHTML, formatTime, formatDate, getDateKey, formatFileSize } from "./utils.js";
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
import { apiRequest } from "../../../services/api.js";




function attachmentLabel(message) {
  return message?.originalFilename || message?.fileMeta || "Attachment";
}



function getMessageReceiptState(message) {
  if (!message || message.sender !== "self") return null;

  if (!message.deliveredAt && !message.delivered_at) {
    return "pending";
  }

  if (message.seenAt || message.seen_at) {
    return "seen";
  }

  return "delivered";
}

function messageReceiptIconHTML(state) {
  if (state === "pending") {
    return `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12.5l4 4L19 7"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.8 12.3l3.7 3.7L15.6 8.9"></path>
      <path d="M8.8 12.3l3.7 3.7L19.6 8.9"></path>
    </svg>
  `;
}

function messageFooterHTML(message) {
  const timeHTML = `<span class="message-time mono">${escapeHTML(message.time || "")}</span>`;
  const state = getMessageReceiptState(message);

  if (!state) {
    return `<div class="message-footer">${timeHTML}</div>`;
  }

  const label = state === "pending"
    ? "Not delivered"
    : state === "delivered"
      ? "Delivered and not read"
      : "Delivered and read";

  return `
    <div class="message-footer">
      ${timeHTML}
      <span class="message-receipt ${state}" aria-label="${label}">
        ${messageReceiptIconHTML(state)}
      </span>
    </div>
  `;
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
          ${messageMenuButtonHTML(message)}
          ${senderLine ? `<div class="message-meta">${senderLine}</div>` : ""}
          <div class="message-text">${escapeHTML(message.text || "")}</div>
          ${messageFooterHTML(message)}
        </div>
      </div>
    `;
  }

  if (message.type === "VOICE") {
    const audioUrl = message.attachmentUrl || buildAttachmentUrl(thread, message);
    const subtitleParts = [];
    if (message.fileSize) subtitleParts.push(formatFileSize(message.fileSize));
    if (message.time) subtitleParts.push(message.time);

    return `
      <div class="message-row ${sideClass}">
        <div class="message-bubble voice-message-bubble">
          ${messageMenuButtonHTML(message)}
          ${senderLine ? `<div class="message-meta">${senderLine}</div>` : ""}

          <div class="voice-card">
            <div class="voice-card-top">
              <div class="voice-card-icon" aria-hidden="true">
                <span class="icon" data-icon="mic"></span>
              </div>
              <div class="voice-card-copy">
                <div class="voice-card-title">Voice message</div>
                <div class="voice-card-subtitle">${escapeHTML(subtitleParts.join(" • "))}</div>
              </div>
            </div>

            <audio controls preload="metadata" class="voice-player">
              <source src="${audioUrl}" type="audio/wav">
            </audio>
          </div>

          ${messageFooterHTML(message)}
        </div>
      </div>
    `;
  }

  if (message.type === "IMAGE") {
    const caption = message.caption ? escapeHTML(message.caption) : "";

    return `
      <div class="message-row ${sideClass}">
        <div class="message-bubble">

          ${messageMenuButtonHTML(message)}

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

          ${caption ? `<div class="message-caption">${caption}</div>` : ""}

          ${messageFooterHTML(message)}

        </div>
      </div>
    `;
  }

  if (message.type === "FILE") {

    const filename = (message.originalFilename || "").toLowerCase();

    const isVideo =
      /\.(mp4|webm|mov|m4v|avi|mkv|ts)$/i.test(filename);

    const caption = message.caption ? escapeHTML(message.caption) : "";

    if (isVideo) {
        return `
            <div class="message-row ${sideClass}">
                <div class="message-bubble">

                    ${messageMenuButtonHTML(message)}

                    ${senderLine ? `<div class="message-meta">${senderLine}</div>` : ""}

                    ${buildAttachmentCard(thread, {
                        ...message,
                        type: "VIDEO"
                    })}

                    ${caption ? `<div class="message-caption">${caption}</div>` : ""}

                    ${messageFooterHTML(message)}

                </div>
            </div>
        `;
    }

    return `
      <div class="message-row ${sideClass}">
        <div class="message-bubble">

          ${messageMenuButtonHTML(message)}

          ${senderLine ? `<div class="message-meta">${senderLine}</div>` : ""}

          ${buildAttachmentCard(thread, message)}

          ${caption ? `<div class="message-caption">${caption}</div>` : ""}
          ${messageFooterHTML(message)}
        </div>
      </div>
    `;
  }

  return "";
}

function messageMenuButtonHTML(message) {
  return `
    <button
      class="message-menu-btn"
      data-message-id="${message.id}"
      title="Message options"
      aria-label="Message options"
      type="button"
    >
      ⋮
    </button>
  `;
}

export function messageMenuContentHTML(message) {
  return `
    ${message.type === "TEXT" ? `
      <button
        class="message-menu-item"
        data-action="copy"
        data-message-id="${message.id}"
        type="button"
      >
        Copy
      </button>
    ` : ""}

    <button
      class="message-menu-item"
      data-action="delete-me"
      data-message-id="${message.id}"
      type="button"
    >
      Delete for Me
    </button>

    ${message.sender === "self" ? `
      <button
        class="message-menu-item danger"
        data-action="delete-all"
        data-message-id="${message.id}"
        type="button"
      >
        Delete for Everyone
      </button>
    ` : ""}
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
    dayChip.hidden = true;
  }
  
  if (messagesScroll) {
    // Group messages by date and insert date chips
    let html = "";
    let lastDateKey = "";
    
    for (const message of filtered) {
      const currentDateKey = getDateKey(message);
      
      if (currentDateKey !== lastDateKey) {
        const timestamp = message?.createdAt || message?.created_at || message?.timestamp || message?.sentAt;
        const dateLabel = formatDate(timestamp) || "";
        html += `<div class="day-chip">${dateLabel}</div>`;
        lastDateKey = currentDateKey;
      }
      
      html += messageHTML(thread, message);
    }
    
    messagesScroll.innerHTML = html;
  }

  loadInlineImages();
  decorateAvatars(messagesScroll);

  scrollMessagesToBottom();
}


async function loadVoiceBlobUrl(thread, message) {

  const endpoint =
    thread.type === "room"
      ? `/rooms/voice/${message.id}`
      : `/dm/voice/${message.id}`;

  try {

    const response = await apiRequest(endpoint);

    const blob = await response.blob();

    return URL.createObjectURL(blob);

  } catch (error) {

    console.error(
      "Failed loading voice",
      message.id,
      error
    );

    return "";

  }

}


export async function loadMessages(conversationId, loadToken = 0, options = {}) {
  const state = window.chatState;
  const getMessages = window.getMessages;
  const getRoomMessages = window.getRoomMessages;
  const currentUser = window.currentUser;
  const formatTime = window.formatTime;
  const scrollMessagesToBottom = window.scrollMessagesToBottom;
  const preserveScroll = Boolean(options?.preserveScroll);
  const autoScroll = options?.autoScroll !== false;

  try {
    const messagesScroll = document.getElementById("messages-scroll");
    const previousScrollTop = messagesScroll ? messagesScroll.scrollTop : 0;
    const previousScrollHeight = messagesScroll ? messagesScroll.scrollHeight : 0;
    const previousClientHeight = messagesScroll ? messagesScroll.clientHeight : 0;
    const wasNearBottom = messagesScroll
      ? (previousScrollHeight - (previousScrollTop + previousClientHeight)) < 96
      : true;

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

    thread.messages = await Promise.all((messages || []).map(async (message) => {
      const senderName = message.sender_username || "Unknown";
      const isSelf = senderName === (currentUser?.username || "");

      const attachmentName =
        message.original_filename ||
        message.originalFilename ||
        (typeof message.attachment_path === "string"
          ? message.attachment_path.split(/[\\/]/).pop()
          : "") ||
        "";

      const mapped = {
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
          fileSize: message.file_size || null,
          caption: message.caption || "",
          createdAt: message.created_at,
          deliveredAt: message.delivered_at || message.deliveredAt || null,
          seenAt: message.seen_at || message.seenAt || null,
          time: formatTime(message.created_at)
      };
      if (mapped.type === "VOICE") {

          mapped.attachmentUrl =
              await loadVoiceBlobUrl(
                  thread,
                  mapped
              );

      }
      return mapped;
    })
    );

    updateConversationMeta(thread);
    updateInfoDrawer(thread);

    state.autoScrollMessages = autoScroll;
    renderMessages(thread);

    requestAnimationFrame(() => {
      const messagesScrollEl = document.getElementById("messages-scroll");
      if (preserveScroll && messagesScrollEl) {
        const nextScrollHeight = messagesScrollEl.scrollHeight;
        const nextTarget = wasNearBottom
          ? nextScrollHeight
          : Math.max(0, previousScrollTop + (nextScrollHeight - previousScrollHeight));
        messagesScrollEl.scrollTop = nextTarget;
      } else if (autoScroll) {
        scrollMessagesToBottom();
      }
      state.autoScrollMessages = false;
    });

  } catch (error) {
    state.autoScrollMessages = false;
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
    thread.lastMessageTimestamp = new Date().toISOString();
    thread.unread = 0;

    await loadMessages(thread.key);

    renderThreads(state);

    // Scroll immediately, then again after layout settles
    // (loadInlineImages is async and not awaited — images can push
    //  scroll height after the rAF-based scroll fires).
    scrollMessagesToBottom();
    setTimeout(() => {
      if (window.chatState?.activeThreadKey) {
        window.scrollMessagesToBottom?.();
      }
    }, 300);

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

/**
 * Surgically patch receipt icons in the DOM without a full re-render.
 * Only updates message-row.self elements whose receipt state has changed,
 * avoiding scroll jumps, image reloads, and layout shifts.
 */
export function patchMessageReceipts(thread) {
  if (!thread?.messages) return;

  const rows = document.querySelectorAll(".message-row.self");
  for (const row of rows) {
    const menuBtn = row.querySelector(".message-menu-btn");
    if (!menuBtn) continue;
    const messageId = Number(menuBtn.dataset.messageId);
    const message = thread.messages.find((m) => Number(m.id) === messageId);
    if (!message) continue;

    const receiptEl = row.querySelector(".message-receipt");
    if (!receiptEl) continue;

    const newState = getMessageReceiptState(message);
    if (!newState) continue;

    const currentClass = receiptEl.classList.contains("seen") ? "seen"
      : receiptEl.classList.contains("delivered") ? "delivered"
      : "pending";

    if (currentClass !== newState) {
      const label = newState === "pending"
        ? "Not delivered"
        : newState === "delivered"
          ? "Delivered and not read"
          : "Delivered and read";
      receiptEl.className = `message-receipt ${newState}`;
      receiptEl.setAttribute("aria-label", label);
      receiptEl.innerHTML = messageReceiptIconHTML(newState);
    }
  }
}

export async function handleAttachment(file, forceType = null, caption = null) {
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
      await uploader(thread.id, file, caption);
    } else {
      const uploader = thread.type === "room" ? uploadRoomAttachment : uploadDmAttachment;
      if (typeof uploader !== "function") throw new Error("Attachment upload is not available.");
      await uploader(thread.id, file, caption);
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