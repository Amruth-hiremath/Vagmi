import { escapeHTML, formatFileSize } from "./utils.js";
import { iconMap } from "./icons.js";
import { apiRequest } from "../../../services/api.js";
import { getDesktopBridge } from "../../../services/desktop.js";

let attachmentPreview = null;
let previewLoading = false;
let previewRequestId = 0;
let activeVideoFallbackTimeoutId = null;
let imageViewerObjectUrl = null;
const inlineImageBlobUrls = new Set();

const MAX_INLINE_PREVIEW_BYTES = 100 * 1024 * 1024; // 100 MB

function revokeBlobUrl(url) {
  if (!url || typeof url !== "string" || !url.startsWith("blob:")) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // no-op
  }
}

function clearActiveVideoFallbackTimeout() {
  if (activeVideoFallbackTimeoutId !== null) {
    clearTimeout(activeVideoFallbackTimeoutId);
    activeVideoFallbackTimeoutId = null;
  }
}

function registerInlineImageBlobUrl(url) {
  if (url && typeof url === "string" && url.startsWith("blob:")) {
    inlineImageBlobUrls.add(url);
  }
}

function clearInlineImageBlobUrls() {
  for (const url of inlineImageBlobUrls) {
    revokeBlobUrl(url);
  }
  inlineImageBlobUrls.clear();
}

function cleanupAttachmentBody(container) {
  if (!container) return;

  container.querySelectorAll("video").forEach((video) => {
    try {
      video.pause();
    } catch {
      // no-op
    }
    try {
      video.removeAttribute("src");
      video.querySelectorAll("source").forEach((source) => {
        source.removeAttribute("src");
      });
      video.load();
    } catch {
      // no-op
    }
  });

  container.querySelectorAll("iframe").forEach((frame) => {
    try {
      frame.src = "about:blank";
    } catch {
      // no-op
    }
  });

  container.querySelectorAll("img").forEach((img) => {
    try {
      img.removeAttribute("src");
    } catch {
      // no-op
    }
  });
}

export function clearAttachmentPreview() {
  if (attachmentPreview?.objectUrl) {
    revokeBlobUrl(attachmentPreview.objectUrl);
  }
  attachmentPreview = null;
}

export function closeAttachmentModal() {
  const attachmentModal = document.getElementById("attachment-modal");
  const attachmentModalBody = document.getElementById("attachment-modal-body");
  const attachmentModalTitle = document.getElementById("attachment-modal-title");
  const attachmentModalOpen = document.getElementById("attachment-modal-open");
  const attachmentModalDownload = document.getElementById("attachment-modal-download");

  previewRequestId += 1;
  previewLoading = false;
  clearActiveVideoFallbackTimeout();

  if (!attachmentModal) return;

  cleanupAttachmentBody(attachmentModalBody);
  clearAttachmentPreview();

  if (attachmentModalOpen) attachmentModalOpen.onclick = null;
  if (attachmentModalDownload) attachmentModalDownload.onclick = null;

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
    (typeof message?.attachmentPath === "string"
      ? message.attachmentPath.split(/[\\/]/).pop()
      : "") ||
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

      const savedPath = await bridge.save_chat_download(dataUrl, safeName);

      if (savedPath === "") {
        return;
      }

      console.log("File saved to:", savedPath);
      return;
    } catch (error) {
      console.error("PyWebView save failed:", error);
    }
  }

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

  if (imageViewerObjectUrl && imageViewerObjectUrl !== src) {
    revokeBlobUrl(imageViewerObjectUrl);
  }

  imageViewerObjectUrl = typeof src === "string" && src.startsWith("blob:") ? src : null;

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

  if (imageViewerObjectUrl) {
    revokeBlobUrl(imageViewerObjectUrl);
    imageViewerObjectUrl = null;
  }
}

export function openAttachmentModal(
  attachmentModal = document.getElementById("attachment-modal")
) {
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
    filename: attachmentDownloadName(message),
  };
}

export function buildAttachmentCard(thread, message) {
  const displayName = fallbackAttachmentName(message);
  const name = escapeHTML(displayName);
  const meta =
    message.type === "IMAGE"
      ? "Image attachment"
      : message.type === "VIDEO"
        ? "Video attachment"
        : "File attachment";

  const icon =
    message.type === "IMAGE"
      ? iconMap.imageSmall
      : message.type === "VIDEO"
        ? "🎥"
        : iconMap.file;

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

export function renderAttachmentModalView(thread, message, blob, contentType, requestId = previewRequestId) {
  if (requestId !== previewRequestId) {
    return;
  }

  clearActiveVideoFallbackTimeout();

  const attachmentModalTitle = document.getElementById("attachment-modal-title");
  const attachmentModalBody = document.getElementById("attachment-modal-body");
  const attachmentModalOpen = document.getElementById("attachment-modal-open");
  const attachmentModalDownload = document.getElementById("attachment-modal-download");

  const title = fallbackAttachmentName(message);
  const extension = title.includes(".")
      ? title.split(".").pop().toLowerCase()
      : "";

  const unsupportedVideoExtensions = new Set([
      "ts",
      "mkv",
      "avi"
  ]);

  const isImage =
      contentType.startsWith("image/") ||
      message.type === "IMAGE";

  const isVideo =
      contentType.startsWith("video/") &&
      !unsupportedVideoExtensions.has(extension);

  const isPdf =
      contentType.includes("pdf") ||
      extension === "pdf";

  const isText =
      contentType.startsWith("text/") ||
      ["txt", "md", "json", "csv", "log"].includes(extension);

  const unsupportedVideo =
    contentType.startsWith("video/") &&
    unsupportedVideoExtensions.has(extension);
  const previewTooLarge = Number(blob?.size || 0) > MAX_INLINE_PREVIEW_BYTES;
  const previewSupported =
    isImage ||
    isVideo ||
    isPdf ||
    isText;
  const canInlinePreview = previewSupported && !previewTooLarge;
  const objectUrl = canInlinePreview ? URL.createObjectURL(blob) : null;

  clearAttachmentPreview();
  attachmentPreview = { objectUrl, filename: title, contentType };

  if (attachmentModalTitle) attachmentModalTitle.textContent = title;

  if (!attachmentModalBody) return;

  if (canInlinePreview && isImage) {
    attachmentModalBody.innerHTML = `
      <div class="attachment-preview">
        <img class="attachment-preview-image" src="${objectUrl}" alt="${escapeHTML(title)}" />
      </div>
    `;
  } else if (canInlinePreview && isPdf) {
    attachmentModalBody.innerHTML = `
      <div class="attachment-preview">
        <iframe class="attachment-preview-frame" src="${objectUrl}" title="${escapeHTML(title)}"></iframe>
      </div>
    `;
  } else if (canInlinePreview && isVideo) {
    attachmentModalBody.innerHTML = `
      <div class="attachment-preview">
        <video
          id="attachment-video-preview"
          class="attachment-preview-video"
          controls
          preload="metadata"
          playsinline
          src="${objectUrl}"
        ></video>

        <div
          id="video-preview-error"
          class="attachment-preview-card"
          style="display:none;"
        >
          <div class="avatar-large" style="margin:0 auto;">
            ${iconMap.file}
          </div>

          <div class="attachment-preview-name">
            ${escapeHTML(title)}
          </div>

          <div class="attachment-preview-copy">
            This video format isn't supported for preview.<br>
            Please download it to view it in an external player.
          </div>
        </div>
      </div>
    `;

    const video = attachmentModalBody.querySelector("#attachment-video-preview");
    const errorCard = attachmentModalBody.querySelector("#video-preview-error");

    let playbackStarted = false;

    const showVideoFallback = () => {
      if (requestId !== previewRequestId) return;
      try {
        video.pause();
      } catch {
        // no-op
      }
      video.style.display = "none";
      errorCard.style.display = "block";
    };

    video.addEventListener("playing", () => {
      playbackStarted = true;
    }, { once: true });

    video.addEventListener("error", () => {
      showVideoFallback();
    }, { once: true });

    video.addEventListener("stalled", () => {
      showVideoFallback();
    }, { once: true });

    video.addEventListener("abort", () => {
      showVideoFallback();
    }, { once: true });

    activeVideoFallbackTimeoutId = setTimeout(() => {
      if (requestId !== previewRequestId) return;
      if (!playbackStarted) {
        showVideoFallback();
      }
    }, 10000);
  } else if (canInlinePreview && isText) {
    attachmentModalBody.innerHTML = `
      <div class="attachment-preview">
        <iframe class="attachment-preview-frame" src="${objectUrl}" title="${escapeHTML(title)}"></iframe>
      </div>
    `;
  } else {
    const previewMessage = unsupportedVideo
        ? "Preview is not available for this video format.<br>Please download it to view it in an external player."
        : "This file type cannot be previewed.<br>Please download it to open locally.";

    attachmentModalBody.innerHTML = `
      <div
        class="attachment-preview"
        style="
          width:100%;
          height:100%;
          display:flex;
          justify-content:center;
          align-items:center;
        "
      >
        <div class="attachment-preview-card">
          <div class="avatar-large" style="margin:0 auto;">${iconMap.file}</div>
          <div class="attachment-preview-name">${escapeHTML(title)}</div>
          <div class="attachment-preview-copy">${previewMessage}</div>
        </div>
      </div>
    `;
  }

  if (attachmentModalOpen) {
    attachmentModalOpen.onclick = async () => {
      if (!attachmentPreview) return;
      await saveBlobToDownloads(blob, attachmentPreview.filename);
    };
  }

  if (attachmentModalDownload) {
    attachmentModalDownload.onclick = async () => {
      if (!attachmentPreview?.objectUrl && !blob) return;
      await saveBlobToDownloads(blob, attachmentPreview.filename || "attachment");
    };
  }
}

export async function openAttachmentViewer(thread, message) {
  if (previewLoading) return;

  previewLoading = true;
  const requestId = ++previewRequestId;

  const attachmentModalBody = document.getElementById("attachment-modal-body");

  try {
    openAttachmentModal();

    if (attachmentModalBody) {
      attachmentModalBody.innerHTML = `
        <div class="attachment-loading">
          <div class="spinner"></div>
          <div>Loading preview...</div>
        </div>
      `;
    }

    await new Promise((resolve) => requestAnimationFrame(() => resolve()));

    const { blob, contentType, filename } = await fetchAttachmentBlob(thread, message);

    if (requestId !== previewRequestId) {
      return;
    }

    renderAttachmentModalView(
      thread,
      {
        ...message,
        originalFilename: filename,
      },
      blob,
      contentType,
      requestId
    );
  } catch (error) {
    if (requestId !== previewRequestId) {
      return;
    }

    console.error("Attachment open failed", error);

    if (attachmentModalBody) {
      attachmentModalBody.innerHTML = `
        <div
          style="
            width:100%;
            height:100%;
            display:flex;
            justify-content:center;
            align-items:center;
            color:red;
          "
        >
          Failed to load preview.
        </div>
      `;
    }
  } finally {
    if (requestId === previewRequestId) {
      previewLoading = false;
    }
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