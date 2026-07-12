import { els, state, escapeHTML, truncate, agentLabel, modeLabel, sessionDisplayTime, getFilteredSessions, getFilteredDocuments, getSelectedDocIds, getActiveSession } from "./context.js";
import { renderAgentPicker } from "./ui.js";

export function renderHubTabs() {
  els.hubTabs.forEach((button) => {
    button.classList.toggle("active", button.dataset.hubFilter === state.hubFilter);
  });
}

export function renderHub() {
  if (!els.sessionGrid) return;
  renderHubTabs();
  const filteredSessions = getFilteredSessions();
  const createCard = `
    <button class="session-card session-card-add" id="create-session-card" type="button">
      <div class="session-card-top">
        <div class="session-icon">+</div>
      </div>
      <div class="session-card-body">
        <div>
          <div class="session-name">Create new session</div>
          <div class="session-preview">Start a clean AI workspace.</div>
        </div>
      </div>
    </button>
  `;

  const cards = filteredSessions.map((session) => {
    const preview = session.last_prompt ? truncate(session.last_prompt, 92) : "No prompt yet";
    const isActive = Number(session.id) === Number(state.activeSessionId);
    const agentText = session.routing_mode === "auto" ? "auto" : agentLabel(session.selected_agent);
    return `
      <div class="session-card ${isActive ? "active" : ""}" role="button" tabindex="0" data-session-id="${session.id}">
        <div class="session-card-top">
          <div class="session-icon">${escapeHTML((session.title || "S").trim().charAt(0).toUpperCase() || "S")}</div>
          <button class="icon-btn session-card-menu-btn" type="button" data-session-menu-btn="${session.id}" aria-label="Session actions">⋮</button>
        </div>
        <div class="session-card-body">
          <div>
            <div class="session-name">${escapeHTML(session.title)}</div>
            <div class="session-meta">
              <span class="pill mono">${escapeHTML(modeLabel(session.routing_mode))}</span>
              <span class="pill mono">${escapeHTML(agentText)}</span>
            </div>
          </div>
          <div class="session-meta">
            <span class="pill mono">${session.selected_document_count || 0} docs</span>
            <span class="pill mono">${session.message_count || 0} msgs</span>
            <span class="pill mono">${session.artifact_count || 0} arts</span>
          </div>
          <div class="session-preview">${escapeHTML(preview)}</div>
          <div class="session-updated">${escapeHTML(sessionDisplayTime(session))}</div>
        </div>
      </div>
    `;
  }).join("");

  const emptyCard = filteredSessions.length === 0
    ? `
      <div class="session-card session-card-empty" style="grid-column: 1 / -1;">
        <div class="session-card-body">
          <div class="empty-state empty-state-card">
            <div class="empty-state-icon" aria-hidden="true">◌</div>
            <div class="empty-title">No sessions found</div>
            <div class="empty-sub">Try another filter, adjust the search, or create a fresh workspace.</div>
            <button class="ghost-mini-btn" type="button" id="clear-session-filters-btn">Clear filters</button>
          </div>
        </div>
      </div>
    `
    : "";

  els.sessionGrid.innerHTML = createCard + emptyCard + cards;
}

export function renderDocumentList() {
  if (!els.docList) return;
  const session = getActiveSession();
  const docs = getFilteredDocuments();
  const selectedIds = new Set(getSelectedDocIds(session));
  const selectedCount = selectedIds.size;
  const attachedCount = state.documents.length;

  els.docsSummary.textContent = `${selectedCount} selected • ${attachedCount} in this session`;

  if (!session) {
    els.docList.innerHTML = `
      <div class="doc-empty">
        <div class="doc-empty-icon" aria-hidden="true">◎</div>
        <div class="empty-title">Open a session</div>
        <div class="empty-subtle">Select a workspace first so sources stay isolated per session.</div>
      </div>
    `;
    return;
  }

  if (!docs.length) {
    els.docList.innerHTML = `
      <div class="doc-empty">
        <div class="doc-empty-icon" aria-hidden="true">⌁</div>
        <div class="empty-title">No sources yet</div>
        <div class="empty-subtle">Upload a document to attach it to this session.</div>
        <button class="ghost-mini-btn" type="button" id="doc-empty-upload-btn">Upload document</button>
      </div>
    `;
    return;
  }

  els.docList.innerHTML = docs.map((doc) => {
    const checked = selectedIds.has(Number(doc.id));
    return `
      <button class="doc-item ${checked ? "selected" : ""}" type="button" data-doc-id="${doc.id}">
        <div class="doc-top">
          <div class="doc-main">
            <div class="doc-icon" aria-hidden="true">${checked ? "✓" : "▢"}</div>
            <div class="doc-copy">
              <div class="doc-title">${escapeHTML(doc.filename)}</div>
              <div class="doc-status mono">${escapeHTML(doc.status || "indexed")}</div>
            </div>
          </div>
          <span class="doc-badge mono">${checked ? "selected" : "attached"}</span>
        </div>
      </button>
    `;
  }).join("");
}

export function renderArtifactsStrip() {
  const artifacts = Array.isArray(state.sessionArtifacts) ? state.sessionArtifacts : [];
  els.sessionArtifactCount.textContent = String(artifacts.length);
  els.artifactsToggleBtn.setAttribute("aria-expanded", String(state.artifactsOpen));
  els.artifactsStrip.classList.toggle("hidden", !state.artifactsOpen);

  if (!state.artifactsOpen) {
    els.artifactsStrip.innerHTML = "";
    return;
  }

  if (!artifacts.length) {
    els.artifactsStrip.innerHTML = `
      <div class="artifact-card artifact-card-empty">
        <div class="artifact-card-type">Artifacts</div>
        <div class="artifact-card-title">No artifacts yet</div>
        <div class="artifact-card-preview">Run a document, summary, or diagram turn to generate one.</div>
      </div>
    `;
    return;
  }

  els.artifactsStrip.innerHTML = artifacts.map((artifact) => {
    const preview = truncate(artifact.content || "Saved artifact", 120);
    return `
      <div class="artifact-card" data-artifact-id="${artifact.id}">
        <div class="artifact-card-type">${escapeHTML(artifact.artifact_type || "artifact")}</div>
        <div class="artifact-card-title">${escapeHTML(artifact.title || "Artifact")}</div>
        <div class="artifact-card-preview">${escapeHTML(preview)}</div>
        <div class="artifact-card-actions">
          <button class="artifact-card-action" type="button" data-copy-artifact="${artifact.id}">Copy</button>
          <button class="artifact-card-action" type="button" data-download-artifact="${artifact.id}">Download</button>
          <button class="artifact-card-remove" type="button" data-delete-artifact="${artifact.id}">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderMessage(message) {
  const role = String(message.role || "assistant");
  const body = escapeHTML(message.content || "");
  const agent = message.agent_name ? `<div class="message-agent mono">${escapeHTML(message.agent_name)}</div>` : "";
  return `
    <article class="message ${role === "user" ? "user" : "assistant"}">
      <div class="message-bubble">
        ${agent}
        <div class="message-text">${body || "<span class='empty-subtle'>No content</span>"}</div>
      </div>
    </article>
  `;
}

export function renderMessages() {
  const session = getActiveSession();
  if (!session) {
    els.outputBody.innerHTML = "";
    return;
  }

  const messages = Array.isArray(session.messages) ? session.messages : [];
  if (!messages.length) {
    els.outputBody.innerHTML = `
      <div class="empty-state empty-state-card">
        <div class="empty-state-icon" aria-hidden="true">✦</div>
        <div class="empty-title">Ready to run</div>
        <div class="empty-sub">Choose the sources on the left, write a prompt, and run the session.</div>
      </div>
    `;
    return;
  }

  els.outputBody.innerHTML = messages.map((message) => renderMessage(message)).join("");
}

export function renderWorkspaceChrome() {
  const session = getActiveSession();
  if (!session) return;

  els.sessionKicker.textContent = `SESSION ${session.id}`;
  els.sessionTitle.textContent = session.title;
  els.sessionModePill.textContent = session.routing_mode === "auto" ? "auto-route" : "manual";
  els.sessionAgentPill.textContent = session.routing_mode === "auto" ? "auto" : agentLabel(session.selected_agent);
  els.manualModeBtn.classList.toggle("active", session.routing_mode === "manual");
  els.autoModeBtn.classList.toggle("active", session.routing_mode === "auto");

  els.routeHint.textContent = session.routing_mode === "auto"
    ? "Auto-route chooses the specialist when the request is clear."
    : "Manual mode uses the selected specialist agent.";

  els.promptInput.placeholder = "Ask a question, request a summary, draft a document, or generate a diagram...";
  els.composerState.textContent = session.status === "active" ? "Updated" : "Ready";
}

export function renderWorkspace() {
  if (!els.pageRoot || !els.hubView || !els.workspaceView) return;
  const session = getActiveSession();
  if (!session) {
    els.pageRoot.classList.remove("workspace-open");
    els.hubView.classList.remove("hidden");
    els.workspaceView.classList.add("hidden");
    return;
  }

  els.pageRoot.classList.add("workspace-open");
  els.hubView.classList.add("hidden");
  els.workspaceView.classList.remove("hidden");

  if (els.docSearch) els.docSearch.value = state.docSearch;
  if (els.promptInput && state.drafts[String(session.id)] !== undefined) {
    els.promptInput.value = state.drafts[String(session.id)];
  }

  renderWorkspaceChrome();
  renderDocumentList();
  renderArtifactsStrip();
  renderMessages();
  renderAgentPicker();
}

export function renderAll() {
  renderHub();
  renderWorkspace();
}
