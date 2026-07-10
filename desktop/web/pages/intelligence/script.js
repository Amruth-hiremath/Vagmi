import {
  AI_AGENT_OPTIONS,
  AI_MODE_OPTIONS,
  createAiSession,
  deleteAiSession,
  fetchAiDocuments,
  fetchAiSession,
  fetchAiSessionArtifacts,
  fetchAiSessionContext,
  fetchAiSessions,
  fetchAiStatus,
  getAiStorageState,
  runAiSession,
  setAiStorageState,
  updateAiSession,
  updateAiSessionDocuments
} from "../../services/ai.js";

const pageRoot = document.getElementById("page-root");
const hubView = document.getElementById("hub-view");
const workspaceView = document.getElementById("workspace-view");
const sessionGrid = document.getElementById("session-grid");
const sessionSearch = document.getElementById("session-search");
const sessionSort = document.getElementById("session-sort");
const createSessionBtn = document.getElementById("create-session-btn");
const hubTabs = Array.from(document.querySelectorAll("[data-hub-filter]"));

const backToSessionsBtn = document.getElementById("back-to-sessions-btn");
const docList = document.getElementById("doc-list");
const docSearch = document.getElementById("doc-search");
const docsSummary = document.getElementById("docs-summary");
const selectAllDocsBtn = document.getElementById("select-all-docs-btn");

const sessionTitle = document.getElementById("session-title");
const sessionKicker = document.getElementById("session-kicker");
const sessionModePill = document.getElementById("session-mode-pill");
const sessionAgentPill = document.getElementById("session-agent-pill");
const promptInput = document.getElementById("prompt-input");
const runBtn = document.getElementById("run-btn");
const outputBody = document.getElementById("output-body");
const routeHint = document.getElementById("route-hint");
const composerState = document.getElementById("composer-state");

const manualModeBtn = document.getElementById("manual-mode-btn");
const autoModeBtn = document.getElementById("auto-mode-btn");
const agentBox = document.getElementById("agent-box");
const agentSelectBtn = document.getElementById("agent-select-btn");
const agentSelectLabel = document.getElementById("agent-select-label");
const agentMenu = document.getElementById("agent-menu");
const navButtons = Array.from(document.querySelectorAll("[data-nav]"));

const sessionMenu = document.getElementById("session-menu");
const sessionActionsBtn = document.getElementById("session-actions-btn");

const dialogOverlay = document.getElementById("dialog-overlay");
const dialogTitle = document.getElementById("dialog-title");
const dialogBody = document.getElementById("dialog-body");
const dialogFieldWrap = document.getElementById("dialog-field-wrap");
const dialogInput = document.getElementById("dialog-input");
const dialogCloseBtn = document.getElementById("dialog-close-btn");
const dialogCancelBtn = document.getElementById("dialog-cancel-btn");
const dialogConfirmBtn = document.getElementById("dialog-confirm-btn");

const persisted = getAiStorageState();
const state = {
  status: null,
  sessions: [],
  documents: [],
  selectedSessionId: persisted.selectedSessionId || null,
  sessionDetail: null,
  sessionContext: null,
  sessionArtifacts: [],
  hubFilter: "all",
  sessionSearch: "",
  sessionSort: "recent",
  documentSearch: "",
  loading: false,
  menu: { type: null, sessionId: null, anchor: null },
  dialog: { type: null, sessionId: null, resolve: null },
};

const AGENT_LABELS = new Map(AI_AGENT_OPTIONS.map((item) => [item.value, item.label]));
const MODE_LABELS = new Map(AI_MODE_OPTIONS.map((item) => [item.value, item.label]));
const SPECIALIST_AGENTS = AI_AGENT_OPTIONS.filter((item) => item.value !== "master");

function navigate(page) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "navigate", page }, "*");
  } else {
    window.location.href = `../${page}/index.html`;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatRelativeTime(value) {
  if (!value) return "just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const units = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
    ["second", 1_000],
  ];
  for (const [label, size] of units) {
    if (abs >= size || label === "second") {
      const amount = Math.max(1, Math.round(abs / size));
      return diff >= 0 ? `${amount} ${label}${amount === 1 ? "" : "s"} ago` : `in ${amount} ${label}${amount === 1 ? "" : "s"}`;
    }
  }
  return "just now";
}

function setSelectedSessionId(sessionId) {
  state.selectedSessionId = sessionId;
  setAiStorageState({ ...getAiStorageState(), selectedSessionId: sessionId });
}

function getSelectedSession() {
  return state.sessionDetail || state.sessions.find((session) => session.id === state.selectedSessionId) || null;
}

function getSelectedDocumentIds(session) {
  return new Set((session?.selected_documents || []).filter((doc) => doc.selected).map((doc) => doc.id));
}

function getVisibleDocuments() {
  const search = state.documentSearch.trim().toLowerCase();
  return state.documents.filter((doc) => {
    if (!search) return true;
    return [doc.filename, doc.status]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });
}

function isSpecialistAgent(value) {
  return SPECIALIST_AGENTS.some((item) => item.value === value);
}

function sessionDisplayAgent(session) {
  const mode = session?.routing_mode || "manual";
  const agent = session?.selected_agent || "query";
  return mode === "manual" && !isSpecialistAgent(agent) ? "query" : agent;
}

function getVisibleSessions() {
  const search = state.sessionSearch.trim().toLowerCase();
  const filtered = state.sessions.filter((session) => {
    const mode = (session.routing_mode || "manual").toLowerCase();
    if (state.hubFilter !== "all" && mode !== state.hubFilter) return false;
    if (!search) return true;
    return [session.title, session.last_prompt, session.selected_agent]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });

  const sortKey = state.sessionSort;
  return [...filtered].sort((a, b) => {
    if (sortKey === "name") {
      return String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" });
    }
    const aTime = new Date(a.updated_at || a.created_at || 0).getTime();
    const bTime = new Date(b.updated_at || b.created_at || 0).getTime();
    return bTime - aTime;
  });
}

function sessionPreviewText(session) {
  if (session?.last_prompt) return session.last_prompt;
  if (session?.messages?.length) {
    const last = session.messages[session.messages.length - 1];
    return last?.content || "";
  }
  return "No prompt yet";
}

function renderHub() {
  pageRoot.classList.remove("workspace-open");
  hubView.classList.remove("hidden");
  workspaceView.classList.add("hidden");
  closeMenus();

  const sessions = getVisibleSessions();
  sessionGrid.innerHTML = "";

  const createCard = document.createElement("button");
  createCard.type = "button";
  createCard.className = "session-card session-card-add";
  createCard.innerHTML = `
    <div>
      <div class="session-icon session-icon-add">+</div>
      <div class="session-name">Create new session</div>
      <div class="session-card-subtle">Start a clean AI workspace</div>
    </div>
  `;
  createCard.addEventListener("click", handleCreateSession);
  sessionGrid.appendChild(createCard);

  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "doc-empty";
    empty.style.gridColumn = "1 / -1";
    empty.innerHTML = `
      <div class="empty-title">No sessions found</div>
      <div class="empty-subtle">Try a different filter or create a new session.</div>
    `;
    sessionGrid.appendChild(empty);
    return;
  }

  sessions.forEach((session) => {
    const isActive = session.id === state.selectedSessionId;
    const mode = session.routing_mode || "manual";
    const agent = sessionDisplayAgent(session);
    const card = document.createElement("article");
    card.className = `session-card${isActive ? " active" : ""}`;
    card.dataset.sessionId = String(session.id);
    card.innerHTML = `
      <div class="session-card-top">
        <div class="session-icon">${escapeHtml((session.title || "S").slice(0, 1).toUpperCase())}</div>
        <button class="icon-btn session-menu-btn" type="button" data-session-menu-btn="${session.id}" aria-label="Session actions">⋮</button>
      </div>
      <div class="session-card-body">
        <div class="session-name">${escapeHtml(session.title || "Session")}</div>
        <div class="session-meta">
          <span class="pill mono">${escapeHtml(MODE_LABELS.get(mode) || mode)}</span>
          <span class="pill mono">${escapeHtml(AGENT_LABELS.get(agent) || agent)}</span>
          <span class="pill mono">${session.selected_document_count || 0} docs</span>
          <span class="pill mono">${session.message_count || 0} msgs</span>
          <span class="pill mono">${session.artifact_count || 0} arts</span>
        </div>
        <div class="session-preview">${escapeHtml(sessionPreviewText(session))}</div>
      </div>
      <div class="session-updated mono">${escapeHtml(formatRelativeTime(session.updated_at || session.created_at))}</div>
    `;

    card.addEventListener("click", (event) => {
      if (event.target.closest(".session-menu-btn")) return;
      selectSession(session.id);
    });

    sessionGrid.appendChild(card);
  });
}

function renderDocuments() {
  const session = getSelectedSession();
  const selectedIds = getSelectedDocumentIds(session);
  const docs = getVisibleDocuments();

  docsSummary.textContent = `${selectedIds.size} selected`;
  docList.innerHTML = "";

  if (!docs.length) {
    const empty = document.createElement("div");
    empty.className = "doc-empty";
    empty.innerHTML = `
      <div class="empty-title">No documents found</div>
      <div class="empty-subtle">Try a different search or upload a document first.</div>
    `;
    docList.appendChild(empty);
    return;
  }

  docs.forEach((doc) => {
    const selected = selectedIds.has(doc.id);
    const item = document.createElement("label");
    item.className = `doc-item${selected ? " selected" : ""}`;
    item.innerHTML = `
      <div class="doc-top">
        <div>
          <div class="doc-title">${escapeHtml(doc.filename || "Untitled document")}</div>
          <div class="doc-status mono">${escapeHtml(doc.status || "uploaded")}</div>
        </div>
        <input class="doc-checkbox" type="checkbox" ${selected ? "checked" : ""} aria-label="Select document">
      </div>
    `;

    const checkbox = item.querySelector("input");
    checkbox.addEventListener("change", async (event) => {
      event.stopPropagation();
      await toggleDocument(doc.id, checkbox.checked);
    });

    item.addEventListener("click", async (event) => {
      if (event.target === checkbox) return;
      checkbox.checked = !checkbox.checked;
      await toggleDocument(doc.id, checkbox.checked);
    });

    docList.appendChild(item);
  });
}

function renderConversation(session) {
  const messages = session?.messages || [];
  outputBody.innerHTML = "";

  if (!messages.length) {
    outputBody.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Ready</div>
        <div class="empty-sub">Pick a prompt and run the session to see the output here.</div>
      </div>
    `;
    return;
  }

  messages.forEach((message) => {
    const row = document.createElement("div");
    row.className = `message ${message.role === "user" ? "user" : "assistant"}`;
    const label = message.role === "user" ? "You" : (message.agent_name || "Vāgmi");
    row.innerHTML = `
      <div class="message-meta">
        <span class="message-title">${escapeHtml(label)}</span>
        <span class="mono">${escapeHtml(formatRelativeTime(message.created_at))}</span>
      </div>
      <div class="bubble">${escapeHtml(message.content || "")}</div>
    `;
    outputBody.appendChild(row);
  });

  outputBody.scrollTop = outputBody.scrollHeight;
}

function renderSessionHeader(session) {
  sessionTitle.textContent = session?.title || "Session";
  sessionKicker.textContent = `Session ${session?.id || ""}`.trim().toUpperCase();
  sessionModePill.textContent = session?.routing_mode || "manual";
  sessionAgentPill.textContent = session?.routing_mode === "auto" ? "auto-route" : AGENT_LABELS.get(sessionDisplayAgent(session)) || "query";
}

function renderComposer(session) {
  const mode = session?.routing_mode || "manual";
  const agent = sessionDisplayAgent(session);
  const selectedDocCount = session?.selected_document_count || 0;
  const messageCount = session?.message_count || 0;
  const artifactCount = session?.artifact_count || 0;

  manualModeBtn.classList.toggle("active", mode === "manual");
  autoModeBtn.classList.toggle("active", mode === "auto");
  agentBox.classList.toggle("hidden", mode === "auto");
  agentSelectLabel.textContent = AGENT_LABELS.get(agent) || "Query";
  routeHint.textContent = mode === "auto"
    ? "Auto-route chooses the specialist when the request is clear."
    : "Manual mode uses a specialist agent.";
  composerState.textContent = state.status?.ready
    ? `${selectedDocCount} doc${selectedDocCount === 1 ? "" : "s"} selected • ${messageCount} message${messageCount === 1 ? "" : "s"} • ${artifactCount} artifact${artifactCount === 1 ? "" : "s"}`
    : "AI scaffold not ready";
}

function renderWorkspace(session) {
  const current = session || getSelectedSession() || {
    id: 0,
    title: "Session",
    routing_mode: "manual",
    selected_agent: "query",
    selected_documents: [],
    messages: []
  };

  pageRoot.classList.add("workspace-open");
  hubView.classList.add("hidden");
  workspaceView.classList.remove("hidden");

  renderSessionHeader(current);
  renderComposer(current);
  renderDocuments();
  renderConversation(current);
}

function updateSessionCache(updated) {
  state.sessionDetail = updated;
  state.sessions = state.sessions.map((item) => (item.id === updated.id ? updated : item));
  if (state.selectedSessionId === updated.id) setSelectedSessionId(updated.id);
}

async function refreshDocuments() {
  state.documents = await fetchAiDocuments();
}

async function refreshSessions() {
  state.sessions = await fetchAiSessions();
}

async function refreshSessionDetail(sessionId) {
  const session = await fetchAiSession(sessionId);
  setSelectedSessionId(sessionId);

  if ((session.routing_mode || "manual") === "manual" && !isSpecialistAgent(session.selected_agent)) {
    state.sessionDetail = await updateAiSession(sessionId, { selected_agent: "query" });
  } else {
    state.sessionDetail = session;
  }

  try {
    state.sessionContext = await fetchAiSessionContext(sessionId);
  } catch {
    state.sessionContext = null;
  }

  try {
    state.sessionArtifacts = await fetchAiSessionArtifacts(sessionId);
  } catch {
    state.sessionArtifacts = [];
  }
}

async function selectSession(sessionId) {
  state.loading = true;
  try {
    await refreshSessionDetail(sessionId);
    renderWorkspace(state.sessionDetail);
  } finally {
    state.loading = false;
  }
}

async function handleCreateSession() {
  const count = state.sessions.length + 1;
  const session = await createAiSession({
    title: `Session ${count}`,
    routing_mode: "manual",
    selected_agent: "query"
  });
  state.sessions = [session, ...state.sessions];
  await selectSession(session.id);
}

async function toggleMode(mode) {
  const session = getSelectedSession();
  if (!session || session.routing_mode === mode) return;

  const payload = { routing_mode: mode };
  if (mode === "manual" && (!session.selected_agent || session.selected_agent === "master")) {
    payload.selected_agent = "query";
  }

  const updated = await updateAiSession(session.id, payload);
  updateSessionCache(updated);
  renderWorkspace(updated);
  renderHub();
}

async function setAgent(agent) {
  const session = getSelectedSession();
  if (!session || session.routing_mode === "auto" || sessionDisplayAgent(session) === agent) return;

  const updated = await updateAiSession(session.id, { selected_agent: agent });
  updateSessionCache(updated);
  renderWorkspace(updated);
  renderHub();
}

async function toggleDocument(documentId, selected) {
  const session = getSelectedSession();
  if (!session) return;

  const currentIds = new Set((session.selected_documents || []).filter((doc) => doc.selected).map((doc) => doc.id));
  if (selected) currentIds.add(documentId);
  else currentIds.delete(documentId);

  const updated = await updateAiSessionDocuments(session.id, Array.from(currentIds));
  updateSessionCache(updated);
  renderWorkspace(updated);
  renderHub();
}

async function toggleSelectAllDocuments() {
  const session = getSelectedSession();
  if (!session) return;

  const visibleIds = getVisibleDocuments().map((doc) => doc.id);
  const selectedIds = getSelectedDocumentIds(session);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const nextIds = new Set(selectedIds);

  if (allSelected) {
    visibleIds.forEach((id) => nextIds.delete(id));
  } else {
    visibleIds.forEach((id) => nextIds.add(id));
  }

  const updated = await updateAiSessionDocuments(session.id, Array.from(nextIds));
  updateSessionCache(updated);
  renderWorkspace(updated);
  renderHub();
}

function buildRunPayload(session, prompt) {
  const payload = {
    prompt,
    routing_mode: session.routing_mode || "manual"
  };
  if ((session.routing_mode || "manual") === "manual") {
    payload.selected_agent = sessionDisplayAgent(session);
  }
  return payload;
}

async function runPrompt() {
  const session = getSelectedSession();
  if (!session) return;

  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    return;
  }

  runBtn.disabled = true;
  runBtn.textContent = "Running…";
  composerState.textContent = "Generating output…";

  try {
    const result = await runAiSession(session.id, buildRunPayload(session, prompt));
    updateSessionCache(result.session);
    promptInput.value = "";

    try {
      state.sessionArtifacts = await fetchAiSessionArtifacts(result.session.id);
    } catch {
      state.sessionArtifacts = [];
    }

    renderWorkspace(result.session);
    renderHub();
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Run";
  }
}

function closeMenus() {
  sessionMenu.classList.add("hidden");
  agentMenu.classList.add("hidden");
  agentSelectBtn?.setAttribute("aria-expanded", "false");
  state.menu = { type: null, sessionId: null, anchor: null };
}

function positionFloatingMenu(menu, anchor) {
  const rect = anchor.getBoundingClientRect();
  const margin = 10;
  menu.style.left = `${Math.min(window.innerWidth - 240, Math.max(margin, rect.right - 220))}px`;
  menu.style.top = `${rect.bottom + 8}px`;
}

function openSessionMenu(sessionId, anchor) {
  closeMenus();
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;

  sessionMenu.innerHTML = `
    <button type="button" class="menu-item" data-menu-action="rename">Rename session</button>
    <button type="button" class="menu-item danger" data-menu-action="delete">Delete session</button>
  `;
  positionFloatingMenu(sessionMenu, anchor);
  sessionMenu.classList.remove("hidden");
  state.menu = { type: "session", sessionId, anchor };
}

function openAgentMenu(anchor) {
  closeMenus();
  agentMenu.innerHTML = SPECIALIST_AGENTS.map((item) => `
    <button type="button" class="menu-item ${sessionDisplayAgent(getSelectedSession()) === item.value ? "active" : ""}" data-agent-choice="${item.value}">${escapeHtml(item.label)}</button>
  `).join("");
  positionFloatingMenu(agentMenu, anchor);
  agentMenu.classList.remove("hidden");
  agentSelectBtn.setAttribute("aria-expanded", "true");
  state.menu = { type: "agent", sessionId: state.selectedSessionId, anchor };
}

function openDialog(config) {
  return new Promise((resolve) => {
    state.dialog = { type: config.type, sessionId: config.sessionId, resolve };
    dialogTitle.textContent = config.title;
    dialogBody.textContent = config.body;
    dialogFieldWrap.classList.toggle("hidden", config.type !== "rename");
    dialogInput.value = config.value || "";
    dialogConfirmBtn.textContent = config.confirmLabel || "Save";
    dialogOverlay.classList.remove("hidden");
    dialogOverlay.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => dialogInput.focus());
  });
}

function closeDialog(result = null) {
  dialogOverlay.classList.add("hidden");
  dialogOverlay.setAttribute("aria-hidden", "true");
  const pending = state.dialog;
  state.dialog = { type: null, sessionId: null, resolve: null };
  if (typeof pending.resolve === "function") pending.resolve(result);
}

async function renameSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  const result = await openDialog({
    type: "rename",
    sessionId,
    title: "Rename session",
    body: "Give this workspace a clearer name.",
    value: session.title || "Session",
    confirmLabel: "Rename"
  });
  if (!result) return;
  const updated = await updateAiSession(sessionId, { title: result });
  updateSessionCache(updated);
  renderHub();
  renderWorkspace(updated);
}

async function confirmDeleteSession(sessionId) {
  const session = state.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  const result = await openDialog({
    type: "delete",
    sessionId,
    title: "Delete session",
    body: `Delete “${session.title || "Session"}”? This removes its messages, documents, and artifacts from the AI workspace.`,
    confirmLabel: "Delete"
  });
  if (!result) return;

  await deleteAiSession(sessionId);
  const nextSessions = state.sessions.filter((item) => item.id !== sessionId);
  state.sessions = nextSessions;

  if (state.selectedSessionId === sessionId) {
    if (nextSessions.length) {
      await selectSession(nextSessions[0].id);
    } else {
      const created = await createAiSession({ title: "Session 1", routing_mode: "manual", selected_agent: "query" });
      state.sessions = [created];
      await selectSession(created.id);
    }
  } else {
    renderHub();
  }
}

function applyHubFilters() {
  renderHub();
}

function applyWorkspaceState() {
  const session = getSelectedSession();
  if (!session) return;
  renderWorkspace(session);
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.nav));
});

hubTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    hubTabs.forEach((button) => button.classList.toggle("active", button === tab));
    state.hubFilter = tab.dataset.hubFilter || "all";
    applyHubFilters();
  });
});

sessionSearch.addEventListener("input", () => {
  state.sessionSearch = sessionSearch.value.trim();
  applyHubFilters();
});

sessionSort.addEventListener("change", () => {
  state.sessionSort = sessionSort.value;
  applyHubFilters();
});

createSessionBtn.addEventListener("click", handleCreateSession);
backToSessionsBtn.addEventListener("click", renderHub);

docSearch.addEventListener("input", () => {
  state.documentSearch = docSearch.value.trim();
  renderDocuments();
});

selectAllDocsBtn.addEventListener("click", toggleSelectAllDocuments);

manualModeBtn.addEventListener("click", () => toggleMode("manual"));
autoModeBtn.addEventListener("click", () => toggleMode("auto"));

agentSelectBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  const isOpen = !agentMenu.classList.contains("hidden");
  closeMenus();
  if (!isOpen) openAgentMenu(agentSelectBtn);
});

agentMenu.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-agent-choice]");
  if (!button) return;
  const agent = button.dataset.agentChoice;
  await setAgent(agent);
  closeMenus();
});

sessionGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-session-menu-btn]");
  if (!button) return;
  event.stopPropagation();
  openSessionMenu(Number(button.dataset.sessionMenuBtn), button);
});

sessionMenu.addEventListener("click", async (event) => {
  const action = event.target.closest("[data-menu-action]");
  if (!action) return;
  const menuAction = action.dataset.menuAction;
  const sessionId = state.menu.sessionId;
  closeMenus();
  if (menuAction === "rename") await renameSession(sessionId);
  if (menuAction === "delete") await confirmDeleteSession(sessionId);
});

sessionActionsBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  const session = getSelectedSession();
  if (!session) return;
  const isOpen = !sessionMenu.classList.contains("hidden");
  closeMenus();
  if (!isOpen) openSessionMenu(session.id, sessionActionsBtn);
});

runBtn.addEventListener("click", runPrompt);

promptInput.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    runPrompt();
  }
});

dialogCloseBtn.addEventListener("click", () => closeDialog(null));
dialogCancelBtn.addEventListener("click", () => closeDialog(null));
dialogConfirmBtn.addEventListener("click", () => {
  const type = state.dialog.type;
  if (type === "rename") {
    const value = dialogInput.value.trim();
    if (!value) {
      dialogInput.focus();
      return;
    }
    closeDialog(value);
    return;
  }
  if (type === "delete") {
    closeDialog(true);
  }
});

dialogInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && state.dialog.type === "rename") {
    event.preventDefault();
    const value = dialogInput.value.trim();
    if (value) closeDialog(value);
  }
  if (event.key === "Escape") closeDialog(null);
});

window.addEventListener("click", (event) => {
  if (
    event.target.closest("#session-menu") ||
    event.target.closest("#agent-menu") ||
    event.target.closest("#session-actions-btn") ||
    event.target.closest("#agent-select-btn") ||
    event.target.closest("[data-session-menu-btn]")
  ) {
    return;
  }
  closeMenus();
});

window.addEventListener("scroll", closeMenus, true);
window.addEventListener("resize", closeMenus);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenus();
    if (!dialogOverlay.classList.contains("hidden")) closeDialog(null);
  }
});

hydrate().catch((error) => {
  console.error("Failed to load intelligence workspace", error);
  pageRoot.classList.remove("workspace-open");
  hubView.classList.remove("hidden");
  workspaceView.classList.add("hidden");
  sessionGrid.innerHTML = `
    <div class="doc-empty" style="grid-column: 1 / -1;">
      <div class="empty-title">Unable to load sessions</div>
      <div class="empty-subtle">Check the backend connection and try again.</div>
    </div>
  `;
});

async function hydrate() {
  try {
    state.status = await fetchAiStatus();
  } catch {
    state.status = null;
  }

  await Promise.all([refreshDocuments(), refreshSessions()]);

  if (!state.sessions.length) {
    const created = await createAiSession({
      title: "Session 1",
      routing_mode: "manual",
      selected_agent: "query"
    });
    state.sessions = [created];
  }

  if (!state.selectedSessionId || !state.sessions.some((session) => session.id === state.selectedSessionId)) {
    setSelectedSessionId(state.sessions[0].id);
  }

  await refreshSessionDetail(state.selectedSessionId);
  renderHub();
}
