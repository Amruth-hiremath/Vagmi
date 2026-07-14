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

const MERMAID_SRC = "https://cdnjs.cloudflare.com/ajax/libs/mermaid/11.12.0/mermaid.min.js";
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

function downloadText(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getSafeFileBaseName(value = "diagram") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "diagram";
}

function downloadSource() {
  const name = `diagram-${Date.now().toString(36)}.mmd`;
  downloadText(name, els.input?.value || SAMPLE_DIAGRAM, "text/plain;charset=utf-8");
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
  downloadText("diagram.svg", lastRenderedSvg, "image/svg+xml;charset=utf-8");
  setStatus("SVG exported");
}

async function exportPng() {
  if (!lastRenderedSvg) {
    await renderDiagram();
    if (!lastRenderedSvg) return;
  }

  const svgBlob = new Blob([lastRenderedSvg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  const image = new Image();
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#111111";

  image.onload = () => {
    const canvas = document.createElement("canvas");
    const width = Math.max(1, image.width || 1600);
    const height = Math.max(1, image.height || 1200);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(svgUrl);
      setStatus("PNG export failed", "error");
      return;
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0);
    canvas.toBlob((blob) => {
      URL.revokeObjectURL(svgUrl);
      if (!blob) {
        setStatus("PNG export failed", "error");
        return;
      }
      const pngUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = "diagram.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(pngUrl);
      setStatus("PNG exported");
    }, "image/png");
  };

  image.onerror = () => {
    URL.revokeObjectURL(svgUrl);
    setStatus("PNG export failed", "error");
  };

  image.src = svgUrl;
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
  els.downloadMmdBtn?.addEventListener("click", downloadSource);
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
