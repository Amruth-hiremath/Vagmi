// desktop/web/pages/chat/core/attachment.js

import { escapeHTML } from "./utils.js";
import { iconMap } from "./icons.js";
import { apiRequest } from "../../../services/api.js";

let attachmentPreview = null;

export function clearAttachmentPreview() {
  if (attachmentPreview?.objectUrl) {
    URL.revokeObjectURL(attachmentPreview.objectUrl);
  }
  attachmentPreview = null;
}

export function closeAttachmentModal() {
  const attachmentModal = document.getElementById("attachment-modal");
  const attachmentModalBody = document.getElementById("attachment-modal-body");
  const attachmentModalTitle = document.getElementById("attachment-modal-title");
  
  if (!attachmentModal) return;
  clearAttachmentPreview();
  attachmentModal.classList.add("hidden");
  attachmentModal.setAttribute("aria-hidden", "true");
  if (attachmentModalBody) attachmentModalBody.innerHTML = "";
  if (attachmentModalTitle) attachmentModalTitle.textContent = "Preview";
}

let imgViewerZoom = 1;

export function openImageViewer(src, filename, thread, message) {
  const modal = document.getElementById("image-viewer-modal");
  const img = document.getElementById("img-viewer-el");
  if (!modal || !img) return;
  imgViewerZoom = 1;
  img.src = src;
  img.alt = filename || "image";
  img.style.transform = "scale(1)";
  if (thread?.key) {
    img.dataset.threadKey = thread.key;
  } else if (thread?.id !== undefined && thread?.type) {
    img.dataset.threadKey = `${thread.type}:${String(thread.id)}`;
  }
  if (message?.id !== undefined) {
    img.dataset.messageId = String(message.id);
  }
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

export function closeImageViewer() {
  const modal = document.getElementById("image-viewer-modal");
  const img = document.getElementById("img-viewer-el");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  if (img) {
    img.src = "";
    img.dataset.threadKey = "";
    img.dataset.messageId = "";
  }
}

export function openAttachmentModal(attachmentModal) {
  if (!attachmentModal) return;
  attachmentModal.classList.remove("hidden");
  attachmentModal.setAttribute("aria-hidden", "false");
}

export function attachmentDownloadName(message) {
  return message?.originalFilename || "attachment";
}

export function buildAttachmentUrl(thread, message) {
  if (!thread || !message) return "";
  if (message.attachmentId) {
    return `/attachments/${message.attachmentId}`;
  }
  if (message.attachmentPath) {
    if (thread.kind === "dm") {
      return `/dm/${thread.id}/messages/${message.id}/attachment`;
    }
    return `/rooms/${thread.id}/messages/${message.id}/attachment`;
  }
  return "";
}

export async function fetchAttachmentBlob(thread, message) {
  const url = buildAttachmentUrl(thread, message);
  if (!url) {
    throw new Error("Attachment is not available.");
  }

  const response = await apiRequest(url);
  const blob = await response.blob();
  return {
    blob,
    contentType: response.headers.get("content-type") || blob.type || "application/octet-stream",
    filename: attachmentDownloadName(message)
  };
}

export function buildAttachmentCard(thread, message) {
  const name = escapeHTML(message.originalFilename || "Attachment");
  const meta = message.type === "IMAGE" ? "Image attachment" : "File attachment";
  const icon = message.type === "IMAGE" ? iconMap.imageSmall : iconMap.file;
  const attachmentUrl = buildAttachmentUrl(thread, message);
  const hasRemoteAttachment = Boolean(attachmentUrl);

  return `
    <div
      class="attachment-card${hasRemoteAttachment ? " clickable" : ""}"
      data-attachment-thread-key="${thread.key || `${thread.kind}:${thread.id}`}"
      data-attachment-message-id="${message.id}"
      data-attachment-kind="${message.type}"
      ${hasRemoteAttachment ? 'role="button" tabindex="0"' : ""}
      aria-label="${hasRemoteAttachment ? `Open attachment ${name}` : `Attachment ${name}`}"
    >
      <div class="attachment-card-icon">${icon}</div>
      <div class="attachment-card-main">
        <div class="attachment-card-title">${name}</div>
        <div class="attachment-card-subtitle">${meta}</div>
      </div>
      <div class="attachment-card-actions">
        ${
          hasRemoteAttachment
            ? `
               <button class="attachment-action-btn" data-attachment-action="download" type="button">Download</button>`
            : `<span class="attachment-local-label">Stored locally</span>`
        }
      </div>
    </div>
  `;
}

export function renderAttachmentModalView(thread, message, blob, contentType) {
  const attachmentModalTitle = document.getElementById("attachment-modal-title");
  const attachmentModalBody = document.getElementById("attachment-modal-body");
  const attachmentModalOpen = document.getElementById("attachment-modal-open");
  const attachmentModalDownload = document.getElementById("attachment-modal-download");
  
  const title = message.originalFilename || "Attachment";
  const objectUrl = URL.createObjectURL(blob);
  clearAttachmentPreview();
  attachmentPreview = { objectUrl, filename: title, contentType };

  if (attachmentModalTitle) attachmentModalTitle.textContent = title;

  const isImage = contentType.startsWith("image/") || message.type === "IMAGE";
  const isPdf = contentType.includes("pdf") || /\.pdf$/i.test(title);
  const isText = contentType.startsWith("text/") || /\.(txt|md|json|csv|log)$/i.test(title);

  if (!attachmentModalBody) return;

  if (isImage) {
    attachmentModalBody.innerHTML = `
      <div class="attachment-preview">
        <img class="attachment-preview-image" src="${objectUrl}" alt="${escapeHTML(title)}" />
      </div>
    `;
  } else if (isPdf) {
    attachmentModalBody.innerHTML = `
      <div class="attachment-preview">
        <iframe class="attachment-preview-frame" src="${objectUrl}" title="${escapeHTML(title)}"></iframe>
      </div>
    `;
  } else if (isText) {
    attachmentModalBody.innerHTML = `
      <div class="attachment-preview">
        <iframe class="attachment-preview-frame" src="${objectUrl}" title="${escapeHTML(title)}"></iframe>
      </div>
    `;
  } else {
    attachmentModalBody.innerHTML = `
      <div class="attachment-preview">
        <div class="attachment-preview-card">
          <div class="avatar-large" style="margin:0 auto;">${iconMap.file}</div>
          <div class="attachment-preview-name">${escapeHTML(title)}</div>
          <div class="attachment-preview-copy">This file can be opened in a new tab or downloaded locally.</div>
        </div>
      </div>
    `;
  }

  attachmentModalOpen.onclick = () => {
    if (!attachmentPreview?.objectUrl) return;
    window.open(attachmentPreview.objectUrl, "_blank", "noopener,noreferrer");
  };

  attachmentModalDownload.onclick = () => {
    if (!attachmentPreview?.objectUrl) return;
    const link = document.createElement("a");
    link.href = attachmentPreview.objectUrl;
    link.download = attachmentPreview.filename || "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
}

export async function openAttachmentViewer(thread, message) {
  try {
    const { blob, contentType, filename } = await fetchAttachmentBlob(thread, message);
    renderAttachmentModalView(thread, { ...message, originalFilename: filename }, blob, contentType);
    openAttachmentModal();
  } catch (error) {
    console.error("Attachment open failed", error);
  }
}

export async function downloadAttachment(thread, message) {
  try {
    const { blob, filename } = await fetchAttachmentBlob(thread, message);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename || "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  } catch (error) {
    console.error("Attachment download failed", error);
  }
}
