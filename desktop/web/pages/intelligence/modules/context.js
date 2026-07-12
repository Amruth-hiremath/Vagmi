import { AI_AGENT_OPTIONS, getAiStorageState, patchAiStorageState } from "../../../services/ai.js";

export const MANUAL_AGENT_OPTIONS = AI_AGENT_OPTIONS.filter((option) => option.value !== "master");
export const STORAGE_KEY = "intelligenceUi";

export const els = {
  pageRoot: document.getElementById("page-root"),
  pageHead: document.getElementById("page-head"),
  hubView: document.getElementById("hub-view"),
  workspaceView: document.getElementById("workspace-view"),
  sessionGrid: document.getElementById("session-grid"),
  createSessionBtn: document.getElementById("create-session-btn"),
  hubTabs: Array.from(document.querySelectorAll("[data-hub-filter]")),
  sessionSearch: document.getElementById("session-search"),
  sessionSort: document.getElementById("session-sort"),
  backBtn: document.getElementById("back-to-sessions-btn"),
  docSearch: document.getElementById("doc-search"),
  docList: document.getElementById("doc-list"),
  docsSummary: document.getElementById("docs-summary"),
  selectAllDocsBtn: document.getElementById("select-all-docs-btn"),
  uploadDocsBtn: document.getElementById("upload-docs-btn"),
  uploadDocsInput: document.getElementById("upload-docs-input"),
  sessionKicker: document.getElementById("session-kicker"),
  sessionTitle: document.getElementById("session-title"),
  sessionModePill: document.getElementById("session-mode-pill"),
  sessionAgentPill: document.getElementById("session-agent-pill"),
  artifactsToggleBtn: document.getElementById("artifacts-toggle-btn"),
  sessionArtifactCount: document.getElementById("session-artifact-count"),
  artifactsStrip: document.getElementById("artifacts-strip"),
  outputBody: document.getElementById("output-body"),
  composerState: document.getElementById("composer-state"),
  promptInput: document.getElementById("prompt-input"),
  composerCharCount: document.getElementById("composer-char-count"),
  manualModeBtn: document.getElementById("manual-mode-btn"),
  autoModeBtn: document.getElementById("auto-mode-btn"),
  agentPicker: document.getElementById("agent-picker"),
  routeHint: document.getElementById("route-hint"),
  regenerateBtn: document.getElementById("regenerate-btn"),
  runBtn: document.getElementById("run-btn"),
  sessionMenu: document.getElementById("session-menu"),
  dialogOverlay: document.getElementById("dialog-overlay"),
  dialogTitle: document.getElementById("dialog-title"),
  dialogBody: document.getElementById("dialog-body"),
  dialogFieldWrap: document.getElementById("dialog-field-wrap"),
  dialogInput: document.getElementById("dialog-input"),
  dialogCloseBtn: document.getElementById("dialog-close-btn"),
  dialogCancelBtn: document.getElementById("dialog-cancel-btn"),
  dialogConfirmBtn: document.getElementById("dialog-confirm-btn"),
  toastStack: document.getElementById("toast-stack")
};

export const state = {
  booted: false,
  loading: false,
  loadingSession: false,
  busy: false,
  sessions: [],
  documents: [],
  activeSessionId: null,
  activeSession: null,
  sessionArtifacts: [],
  selectedSessionMenuId: null,
  selectedSessionMenuAnchor: null,
  hubFilter: "all",
  hubSort: "recent",
  hubSearch: "",
  docSearch: "",
  artifactsOpen: false,
  agentMenuOpen: false,
  drafts: {},
  ui: {
    activeSessionId: null,
    hubFilter: "all",
    hubSort: "recent",
    hubSearch: "",
    docSearch: "",
    artifactsOpen: false,
    agentMenuOpen: false,
    drafts: {}
  },
  loadSeq: 0,
  dialog: {
    open: false,
    title: "",
    body: "",
    confirmText: "Save",
    showInput: true,
    inputValue: "",
    danger: false,
    onConfirm: null
  }
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeLabel(value) {
  const text = String(value ?? "").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

export function formatRelativeTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "just now";
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const units = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
    ["second", 1000]
  ];
  for (const [unit, unitMs] of units) {
    if (abs >= unitMs || unit === "second") {
      const valueInt = Math.round(abs / unitMs);
      const suffix = valueInt <= 1 ? unit : `${unit}s`;
      return diffMs < 0 ? `${valueInt} ${suffix} ago` : `in ${valueInt} ${suffix}`;
    }
  }
  return "just now";
}

export function formatClock(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

export function truncate(text, max = 84) {
  const value = String(text || "");
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function getStorageUi() {
  const full = getAiStorageState() || {};
  return full[STORAGE_KEY] || {};
}

export function persistUi(patch) {
  const next = { ...getStorageUi(), ...(patch || {}) };
  patchAiStorageState({ [STORAGE_KEY]: next });
  state.ui = next;
}

export function normalizeAgent(value) {
  const raw = String(value ?? "query").toLowerCase();
  const allowed = new Set(MANUAL_AGENT_OPTIONS.map((item) => item.value));
  return allowed.has(raw) ? raw : "query";
}

export function agentLabel(value) {
  const found = AI_AGENT_OPTIONS.find((option) => option.value === value);
  if (found) return found.label;
  return normalizeLabel(value || "Query");
}

export function modeLabel(value) {
  return String(value || "manual").toLowerCase() === "auto" ? "Auto-route" : "Manual";
}

export function getSessionSummary(sessionId) {
  return state.sessions.find((session) => Number(session.id) === Number(sessionId)) || null;
}

export function getActiveSession() {
  if (state.activeSession && Number(state.activeSession.id) === Number(state.activeSessionId)) {
    return state.activeSession;
  }
  return getSessionSummary(state.activeSessionId);
}

export function upsertSession(nextSession) {
  if (!nextSession) return;
  const normalized = normalizeSession(nextSession);
  const index = state.sessions.findIndex((item) => Number(item.id) === Number(normalized.id));
  if (index >= 0) {
    state.sessions[index] = { ...state.sessions[index], ...normalized };
  } else {
    state.sessions.unshift(normalized);
  }
}

export function normalizeSession(session) {
  const selectedDocuments = Array.isArray(session?.selected_documents) ? session.selected_documents : [];
  const messages = Array.isArray(session?.messages) ? session.messages : [];
  return {
    id: Number(session?.id),
    title: String(session?.title || "Session"),
    routing_mode: String(session?.routing_mode || "manual").toLowerCase() === "auto" ? "auto" : "manual",
    selected_agent: normalizeAgent(session?.selected_agent || "query"),
    status: String(session?.status || "idle"),
    last_prompt: session?.last_prompt ? String(session.last_prompt) : "",
    created_at: session?.created_at || null,
    updated_at: session?.updated_at || null,
    last_used_at: session?.last_used_at || null,
    selected_document_count: Number(session?.selected_document_count || selectedDocuments.filter((doc) => doc?.selected).length || 0),
    message_count: Number(session?.message_count || messages.length || 0),
    artifact_count: Number(session?.artifact_count || 0),
    selected_documents: selectedDocuments.map((doc) => ({
      id: Number(doc.id),
      filename: String(doc.filename || "Document"),
      status: String(doc.status || "unknown"),
      created_at: doc.created_at || null,
      selected: Boolean(doc.selected)
    })),
    messages: messages.map((message) => ({
      id: message.id ?? null,
      role: String(message.role || "assistant"),
      content: String(message.content || ""),
      agent_name: message.agent_name ? String(message.agent_name) : null,
      created_at: message.created_at || null
    }))
  };
}

export function normalizeDocument(doc) {
  return {
    id: Number(doc?.id),
    filename: String(doc?.filename || "Document"),
    status: String(doc?.status || "available"),
    created_at: doc?.created_at || null,
    selected: Boolean(doc?.selected)
  };
}

export function sessionDisplayTime(session) {
  return formatRelativeTime(session.last_used_at || session.updated_at || session.created_at);
}

export function getSelectedDocIds(session = getActiveSession()) {
  const docs = session?.selected_documents || [];
  return docs.filter((doc) => doc.selected).map((doc) => Number(doc.id));
}

export function getFilteredDocuments() {
  const active = getActiveSession();
  const selectedIds = new Set(getSelectedDocIds(active));
  const query = state.docSearch.trim().toLowerCase();
  return state.documents
    .map((doc) => ({
      ...normalizeDocument(doc),
      selected: selectedIds.has(Number(doc.id))
    }))
    .filter((doc) => !query || doc.filename.toLowerCase().includes(query) || doc.status.toLowerCase().includes(query));
}

export function getFilteredSessions() {
  const query = state.hubSearch.trim().toLowerCase();
  const filter = state.hubFilter;
  const source = state.sessions.filter((session) => {
    if (filter !== "all" && session.routing_mode !== filter) return false;
    if (!query) return true;
    const haystack = [session.title, session.last_prompt, session.selected_agent, session.status]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });

  return source.sort((a, b) => {
    if (state.hubSort === "name") {
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    }
    if (state.hubSort === "activity") {
      const scoreA = Number(a.message_count || 0) + Number(a.artifact_count || 0) * 0.5;
      const scoreB = Number(b.message_count || 0) + Number(b.artifact_count || 0) * 0.5;
      if (scoreA !== scoreB) return scoreB - scoreA;
    }
    const timeA = new Date(a.last_used_at || a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.last_used_at || b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });
}
