import { getDesktopBridge } from "../../services/desktop.js";

const STORAGE_KEY = "vagmi-diagram-studio";
const SAMPLE_DIAGRAM = `flowchart TD
  A[Start] --> B{Need data?}
  B -->|Yes| C[Fetch sources]
  B -->|No| D[Write logic]
  C --> E[Render diagram]
  D --> E
  E --> F[Export SVG/PNG]`;

const els = {
  input: document.getElementById("diagram-input"),
  previewSurface: document.getElementById("preview-surface"),
  previewEmpty: document.getElementById("preview-empty"),
  previewError: document.getElementById("preview-error"),
  status: document.getElementById("render-status"),
  renderBtn: document.getElementById("render-btn"),
  sampleBtn: document.getElementById("sample-btn"),
  clearBtn: document.getElementById("clear-btn"),
  copyBtn: document.getElementById("copy-btn"),
  downloadMmdBtn: document.getElementById("download-mmd-btn"),
  exportSvgBtn: document.getElementById("export-svg-btn"),
  exportPngBtn: document.getElementById("export-png-btn"),
  openFileBtn: document.getElementById("open-file-btn"),
  fileInput: document.getElementById("file-input"),
  navButtons: Array.from(document.querySelectorAll("[data-nav]"))
};

let renderTimer = null;
let lastRenderedSvg = "";
let lastRenderedCode = "";

const MERMAID_SRC = "mermaid.min.js";
let mermaidLoadPromise = null;

function loadMermaidLibrary() {
  if (window.mermaid) return Promise.resolve(window.mermaid);
  if (mermaidLoadPromise) return mermaidLoadPromise;
  mermaidLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-mermaid-runtime="true"]');
    if (existing && window.mermaid) {
      resolve(window.mermaid);
      return;
    }
    const script = document.createElement('script');
    script.src = MERMAID_SRC;
    script.async = true;
    script.dataset.mermaidRuntime = 'true';
    script.onload = () => window.mermaid ? resolve(window.mermaid) : reject(new Error('Mermaid loaded but runtime is unavailable.'));
    script.onerror = () => reject(new Error('Mermaid library could not be loaded.'));
    document.head.appendChild(script);
  });
  return mermaidLoadPromise;
}

function navigate(page) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "navigate", page }, "*");
  } else {
    window.location.href = `../${page}/index.html`;
  }
}

function setStatus(text, kind = "") {
  if (!els.status) return;
  els.status.textContent = text;
  els.status.dataset.kind = kind;
}

function showError(message) {
  if (!els.previewError) return;
  if (!message) {
    els.previewError.classList.add("hidden");
    els.previewError.textContent = "";
    return;
  }
  els.previewError.textContent = message;
  els.previewError.classList.remove("hidden");
}

function getMermaidThemeVariables() {
  const style = getComputedStyle(document.documentElement);
  const getVar = (name, fallback) => (style.getPropertyValue(name).trim() || fallback);
  return {
    background: getVar("--surface", "#111111"),
    primaryColor: getVar("--surface-soft", "#1a1a1a"),
    primaryTextColor: getVar("--text-primary", "#f4f4f5"),
    primaryBorderColor: getVar("--border-subtle", "rgba(255,255,255,0.08)"),
    secondaryColor: getVar("--surface-hover", "#262626"),
    secondaryTextColor: getVar("--text-primary", "#f4f4f5"),
    tertiaryColor: getVar("--surface-hover", "#262626"),
    tertiaryTextColor: getVar("--text-primary", "#f4f4f5"),
    noteBkgColor: getVar("--surface-soft", "#1a1a1a"),
    noteTextColor: getVar("--text-primary", "#f4f4f5"),
    lineColor: getVar("--border-subtle", "rgba(255,255,255,0.08)"),
    clusterBkg: getVar("--surface-soft", "#1a1a1a"),
    clusterBorder: getVar("--border-subtle", "rgba(255,255,255,0.08)")
  };
}

async function configureMermaid() {
  const mermaid = await loadMermaidLibrary();
  if (!mermaid || typeof mermaid.initialize !== "function") return null;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "base",
    themeVariables: getMermaidThemeVariables(),
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: "basis"
    },
    sequence: {
      useMaxWidth: true,
      wrap: true
    }
  });
  return mermaid;
}

async function renderDiagram({ silent = false } = {}) {
  const code = (els.input?.value || "").trim();
  if (!code) {
    lastRenderedSvg = "";
    lastRenderedCode = "";
    if (els.previewSurface) {
      els.previewSurface.innerHTML = `
        <div class="preview-empty" id="preview-empty">
          <div class="empty-title">No diagram rendered yet</div>
          <div class="empty-sub">Press Render to preview your Mermaid diagram.</div>
        </div>
      `;
    }
    showError("");
    setStatus("Ready");
    return;
  }

  let mermaidReady = null;
  try {
    mermaidReady = await configureMermaid();
  } catch (error) {
    showError(error?.message || "Mermaid could not be loaded in this browser. The editor is still usable, but live preview requires the Mermaid library.");
    setStatus("Library unavailable", "error");
    return;
  }
  if (!mermaidReady) {
    showError("Mermaid could not be loaded in this browser. The editor is still usable, but live preview requires the Mermaid library.");
    setStatus("Library unavailable", "error");
    return;
  }

  try {
    const id = `mermaid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    setStatus("Rendering…");
    showError("");
    const result = await window.mermaid.render(id, code);
    lastRenderedSvg = result.svg;
    lastRenderedCode = code;
    if (els.previewSurface) {
      els.previewSurface.innerHTML = result.svg;
      els.previewSurface.scrollTop = 0;
      els.previewSurface.scrollLeft = 0;
      if (typeof result.bindFunctions === "function") {
        result.bindFunctions(els.previewSurface);
      }
    }
    if (!silent) setStatus("Rendered");
  } catch (error) {
    lastRenderedSvg = "";
    lastRenderedCode = "";
    const message = error?.str || error?.message || String(error || "Failed to render diagram");
    showError(message);
    setStatus("Render failed", "error");
  }
}

function debounceRender() {
  window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => {
    renderDiagram({ silent: true }).catch(() => {});
  }, 350);
}

function persistDraft() {
  try {
    localStorage.setItem(STORAGE_KEY, els.input?.value || "");
  } catch {
    // ignore storage errors
  }
}

function textToDataUrl(text, mime = "text/plain;charset=utf-8") {
  const bytes = new TextEncoder().encode(String(text ?? ""));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:${mime};base64,${btoa(binary)}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

function getDesktopSaveBridge() {
  return (
    window.pywebview?.api ??
    window.parent?.pywebview?.api ??
    window.top?.pywebview?.api ??
    getDesktopBridge()
  );
}

async function saveDataUrlWithDialog(dataUrl, filename, fallbackDownload = true) {
  const bridge = getDesktopSaveBridge();
  const safeName = filename || "diagram";

  if (bridge?.save_chat_download) {
    try {
      const savedPath = await bridge.save_chat_download(dataUrl, safeName);
      if (savedPath === "") return false;
      setStatus(`Saved ${safeName}`);
      return true;
    } catch (error) {
      console.error("PyWebView save failed:", error);
    }
  }

  if (!fallbackDownload) return false;

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = safeName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

function getSafeFileBaseName(value = "diagram") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "diagram";
}

async function downloadSource() {
  const code = els.input?.value || SAMPLE_DIAGRAM;
  const name = `${getSafeFileBaseName("mermaid-diagram")}.mmd`;
  const dataUrl = textToDataUrl(code, "text/plain;charset=utf-8");
  const saved = await saveDataUrlWithDialog(dataUrl, name);
  if (saved) setStatus("Saved source");
}

function copyCode() {
  const text = els.input?.value || "";
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => setStatus("Code copied"), () => setStatus("Copy failed", "error"));
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "true");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    setStatus("Code copied");
  } catch {
    setStatus("Copy failed", "error");
  }
  ta.remove();
}

async function exportSvg() {
  if (!lastRenderedSvg) {
    await renderDiagram();
    if (!lastRenderedSvg) return;
  }

  const svgDataUrl = textToDataUrl(lastRenderedSvg, "image/svg+xml;charset=utf-8");
  const saved = await saveDataUrlWithDialog(svgDataUrl, `${getSafeFileBaseName("diagram")}.svg`);
  if (saved) setStatus("SVG exported");
}

async function exportPng() {
  if (!lastRenderedSvg) {
    await renderDiagram();
    if (!lastRenderedSvg) return;
  }

  const svgDataUrl = textToDataUrl(lastRenderedSvg, "image/svg+xml;charset=utf-8");
  const image = new Image();
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#111111";

  image.onload = async () => {
    try {
      const canvas = document.createElement("canvas");
      
      // Try to get dimensions from the SVG
      let width = image.width || 1600;
      let height = image.height || 1200;
      
      // If image dimensions are 0, try to parse from SVG
      if (width === 0 || height === 0) {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(lastRenderedSvg, "image/svg+xml");
        const svgElement = svgDoc.querySelector("svg");
        if (svgElement) {
          const viewBox = svgElement.getAttribute("viewBox");
          if (viewBox) {
            const parts = viewBox.split(/\s+/).map(Number);
            if (parts.length === 4) {
              width = parts[2] || 1600;
              height = parts[3] || 1200;
            }
          }
          const svgWidth = svgElement.getAttribute("width");
          const svgHeight = svgElement.getAttribute("height");
          if (svgWidth && svgHeight) {
            width = parseFloat(svgWidth) || width;
            height = parseFloat(svgHeight) || height;
          }
        }
      }
      
      width = Math.max(1, width);
      height = Math.max(1, height);
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setStatus("PNG export failed", "error");
        return;
      }
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) {
        setStatus("PNG export failed", "error");
        return;
      }
      const pngDataUrl = await blobToDataUrl(blob);
      const saved = await saveDataUrlWithDialog(pngDataUrl, `${getSafeFileBaseName("diagram")}.png`);
      if (saved) setStatus("PNG exported");
    } catch (error) {
      console.error(error);
      setStatus("PNG export failed", "error");
    }
  };

  image.onerror = () => {
    setStatus("PNG export failed", "error");
  };

  image.src = svgDataUrl;
}

function loadSample() {
  if (els.input) {
    els.input.value = SAMPLE_DIAGRAM;
    persistDraft();
    renderDiagram().catch(() => {});
  }
}

function clearEditor() {
  if (!els.input) return;
  els.input.value = "";
  persistDraft();
  lastRenderedSvg = "";
  lastRenderedCode = "";
  renderDiagram({ silent: true }).catch(() => {});
  setStatus("Cleared");
}

function openFilePicker() {
  els.fileInput?.click();
}

function handleFileUpload(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (!els.input) return;
    els.input.value = String(reader.result || "");
    persistDraft();
    renderDiagram().catch(() => {});
  };
  reader.readAsText(file);
}

function bootstrap() {
  els.navButtons.forEach((button) => {
    button.addEventListener("click", () => navigate(button.dataset.nav));
  });

  const saved = (() => {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
  })();

  if (els.input) {
    els.input.value = saved || SAMPLE_DIAGRAM;
    els.input.addEventListener("input", () => {
      persistDraft();
      debounceRender();
    });
    els.input.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        renderDiagram().catch(() => {});
      }
    });
  }

  els.renderBtn?.addEventListener("click", () => renderDiagram().catch(() => {}));
  els.sampleBtn?.addEventListener("click", loadSample);
  els.clearBtn?.addEventListener("click", clearEditor);
  els.copyBtn?.addEventListener("click", copyCode);
  els.downloadMmdBtn?.addEventListener("click", () => downloadSource().catch(() => {}));
  els.exportSvgBtn?.addEventListener("click", () => exportSvg().catch(() => {}));
  els.exportPngBtn?.addEventListener("click", () => exportPng().catch(() => {}));
  els.openFileBtn?.addEventListener("click", openFilePicker);
  els.fileInput?.addEventListener("change", () => {
    handleFileUpload(els.fileInput.files?.[0]);
    els.fileInput.value = "";
  });

  renderDiagram({ silent: true }).catch(() => {});
}

document.addEventListener("DOMContentLoaded", bootstrap);
