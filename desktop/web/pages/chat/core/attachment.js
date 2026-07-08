// desktop/web/pages/chat/core/attachment.js

import { escapeHTML, formatFileSize } from "./utils.js";
import { iconMap } from "./icons.js";
import { apiRequest } from "../../../services/api.js";
import { getDesktopBridge } from "../../../services/desktop.js";
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

function fallbackAttachmentName(message) {
  const raw =
    message?.originalFilename ||
    message?.fileMeta ||
    message?.attachmentName ||
    (typeof message?.attachmentPath === "string" ? message.attachmentPath.split(/[\\/]/).pop() : "") ||
    "";
  return raw || "attachment";
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

export async function saveBlobToDownloads(blob, filename) {
  const safeName = filename || "attachment";

  const bridge = getDesktopBridge();

  if (bridge?.save_chat_download) {
    try {
      const dataUrl = await blobToDataUrl(blob);

      const savedPath = await bridge.save_chat_download(
        dataUrl,
        safeName
      );

      if (savedPath === "") {
        return;
      }

      console.log("File saved to:", savedPath);
      return;

    } catch (error) {
      console.error("PyWebView save failed:", error);
    }
  }

  // Browser fallback continues below...

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

/**
 * Save a URL that is already loaded in the viewer (object/data URL) without
 * re-fetching it from the backend.
 */
export async function saveLoadedUrl(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    await saveBlobToDownloads(blob, filename || "image");
  } catch (error) {
    console.error("Save failed", error);
    alert(error?.message || "Failed to save the file.");
  }
}

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

export function openAttachmentModal(attachmentModal = document.getElementById("attachment-modal")) {
  if (!attachmentModal) return;
  attachmentModal.classList.remove("hidden");
  attachmentModal.setAttribute("aria-hidden", "false");
}

export function attachmentDownloadName(message) {
  return fallbackAttachmentName(message);
}

export function buildAttachmentUrl(thread, message) {
  if (!thread || !message) return "";

  if (message.attachmentUrl) {
    return message.attachmentUrl;
  }

  // Voice messages use a dedicated endpoint
  if (message.type === "VOICE") {
    if (thread.kind === "dm" || thread.type === "dm") {
      return `/api/dm/voice/${message.id}`;
    }

    return `/api/rooms/voice/${message.id}`;
  }

  if (message.attachmentId) {
    return `/attachments/${message.attachmentId}`;
  }

  if (message.attachmentPath) {
    if (thread.kind === "dm" || thread.type === "dm") {
      return `/dm/${thread.id}/messages/${message.id}/attachment`;
    }

    return `/rooms/${thread.id}/messages/${message.id}/attachment`;
  }

  if (thread.kind === "dm" || thread.type === "dm") {
    return `/dm/${thread.id}/messages/${message.id}/attachment`;
  }

  return `/rooms/${thread.id}/messages/${message.id}/attachment`;
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
  const displayName = fallbackAttachmentName(message);
  const name = escapeHTML(displayName);
  const meta = message.type === "IMAGE" ? "Image attachment" : "File attachment";
  const icon = message.type === "IMAGE" ? iconMap.imageSmall : iconMap.file;
  const attachmentUrl = buildAttachmentUrl(thread, message);
  const hasRemoteAttachment = Boolean(attachmentUrl);
  const fileSize = message.fileSize ? formatFileSize(message.fileSize) : "";
  const subtitle = fileSize ? `${meta} • ${fileSize}` : meta;

  return `
    <div
      class="attachment-card${hasRemoteAttachment ? " clickable" : ""}"
      data-attachment-thread-key="${thread.key || `${thread.kind}:${thread.id}`}"
      data-attachment-message-id="${message.id}"
      data-attachment-id="${message.attachmentId ?? ""}"
      data-attachment-kind="${message.type}"
      data-attachment-filename="${escapeHTML(displayName)}"
      data-attachment-url="${escapeHTML(attachmentUrl)}"
      ${hasRemoteAttachment ? 'role="button" tabindex="0"' : ""}
      aria-label="${hasRemoteAttachment ? `Open attachment ${name}` : `Attachment ${name}`}"
    >
      <div class="attachment-card-icon">${icon}</div>
      <div class="attachment-card-main">
        <div class="attachment-card-title">${name}</div>
        <div class="attachment-card-subtitle">${subtitle}</div>
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
  
  const title = fallbackAttachmentName(message);
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

  if (attachmentModalOpen) {
    attachmentModalOpen.onclick = () => {
      if (!attachmentPreview?.objectUrl) return;
      window.open(attachmentPreview.objectUrl, "_blank", "noopener,noreferrer");
    };
  }

  if (attachmentModalDownload) {
    attachmentModalDownload.onclick = async () => {
      if (!attachmentPreview?.objectUrl) return;
      await saveBlobToDownloads(
        blob,
        attachmentPreview.filename || "attachment"
      );
    };
  }
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
  const showDownloadProgress = window.showDownloadProgress;
  const hideDownloadProgress = window.hideDownloadProgress;

  if (showDownloadProgress) showDownloadProgress();

  try {
    const { blob, filename } = await fetchAttachmentBlob(thread, message);
    await saveBlobToDownloads(blob, filename || "attachment");
  } catch (error) {
    console.error("Attachment download failed", error);
    alert(error?.message || "Failed to download the attachment.");
  } finally {
    if (hideDownloadProgress) hideDownloadProgress();
  }
}
