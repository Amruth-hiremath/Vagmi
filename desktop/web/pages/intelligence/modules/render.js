import { els, state, escapeHTML, truncate, agentLabel, modeLabel, sessionDisplayTime, normalizeDocument, getFilteredSessions, getSelectedDocIds, getActiveSession } from "./context.js";
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

function renderDocumentCard(doc, { selected = false, badge = "", emptyLabel = "" } = {}) {
  // Clean up filename - remove extension for cleaner display
  const cleanName = doc.filename.replace(/\.[^/.]+$/, "");
  // Map status to simple visual indicator
  const statusClass = doc.status === 'indexed' ? 'status-ready' : 'status-processing';
  const statusIcon = doc.status === 'indexed'
    ? '<svg class="icon"><path d="M20 6L9 17l-5-5"/></svg>'
    : '<svg class="icon animate-spin"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>';

  return `
    <button class="doc-item ${selected ? "selected" : ""}" type="button" data-doc-id="${doc.id}">
      <div class="doc-top">
        <div class="doc-main">
          <div class="doc-icon" aria-hidden="true">${selected ? "✓" : "▢"}</div>
          <div class="doc-copy">
            <div class="doc-title">${escapeHTML(doc.filename)}</div>
            <div class="doc-status mono">${escapeHTML(doc.status || emptyLabel || "indexed")}</div>
          </div>
        </div>
        <span class="doc-badge mono">${escapeHTML(badge || (selected ? "session" : "library"))}</span>
      </div>
    </button>
  `;
}

function renderSourceSection(title, subtitle, docs, { selected = false, emptyTitle = "", emptySubtitle = "", emptyIcon = "◎", emptyButton = "" } = {}) {
  if (!docs.length) {
    return `
      <section class="source-section">
        <div class="source-section-head">
          <div>
            <div class="source-section-title">${escapeHTML(title)}</div>
            <div class="sidebar-sub mono">${escapeHTML(subtitle)}</div>
          </div>
        </div>
        <div class="doc-empty compact">
          <div class="doc-empty-icon" aria-hidden="true">${escapeHTML(emptyIcon)}</div>
          <div class="empty-title">${escapeHTML(emptyTitle)}</div>
          <div class="empty-subtle">${escapeHTML(emptySubtitle)}</div>
          ${emptyButton ? `<button class="ghost-mini-btn" type="button" id="doc-empty-upload-btn">${escapeHTML(emptyButton)}</button>` : ""}
        </div>
      </section>
    `;
  }

  return `
    <section class="source-section">
      <div class="source-section-head">
        <div>
          <div class="source-section-title">${escapeHTML(title)}</div>
          <div class="sidebar-sub mono">${escapeHTML(subtitle)}</div>
        </div>
      </div>
      <div class="doc-list-group">
        ${docs.map((doc) => renderDocumentCard(doc, { selected, badge: selected ? "session" : "library" })).join("")}
      </div>
    </section>
  `;
}

export function renderDocumentList() {
  if (!els.docList) return;
  const session = getActiveSession();
  const selectedIds = new Set(getSelectedDocIds(session));
  const query = state.docSearch.trim().toLowerCase();
  const allDocs = state.documents
    .map((doc) => normalizeDocument(doc))
    .filter((doc) => Number.isFinite(Number(doc.id)));
  const selectedDocs = allDocs.filter((doc) => selectedIds.has(Number(doc.id)));
  const libraryDocs = allDocs.filter((doc) => !selectedIds.has(Number(doc.id)) && (!query || doc.filename.toLowerCase().includes(query) || doc.status.toLowerCase().includes(query)));
  const selectedCount = selectedDocs.length;
  const totalCount = allDocs.length;

  els.docsSummary.textContent = session
    ? `${selectedCount} in session • ${libraryDocs.length} in library`
    : `${totalCount} documents`;

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

  if (!allDocs.length) {
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

  const sections = [
    renderSourceSection(
      "Session Sources",
      `${selectedDocs.length} attached to this session`,
      selectedDocs,
      {
        selected: true,
        emptyTitle: "No session sources",
        emptySubtitle: "Select documents from the library to keep this session isolated.",
        emptyIcon: "◇"
      }
    ),
    renderSourceSection(
      "Library",
      `${libraryDocs.length} available for selection`,
      libraryDocs,
      {
        selected: false,
        emptyTitle: "Library filtered out",
        emptySubtitle: "Nothing matches the current search.",
        emptyIcon: "⌁",
        emptyButton: "Upload document"
      }
    )
  ];

  els.docList.innerHTML = sections.join("");
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

export function renderComposerToolbar() {
  if (!els.toolbarToggleBtn || !els.composerToolbar) return;
  els.toolbarToggleBtn.setAttribute("aria-expanded", String(state.toolbarOpen));
  els.composerToolbar.classList.toggle("hidden", !state.toolbarOpen);
}

export function renderSourcesPanel() {
  if (!els.sourcesPanelToggle) return;
  const sourcesPanel = document.querySelector(".sources-panel");
  if (!sourcesPanel) return;
  els.sourcesPanelToggle.setAttribute("aria-expanded", String(state.sourcesPanelOpen));
  sourcesPanel.classList.toggle("collapsed", !state.sourcesPanelOpen);
  const toggleLabel = els.sourcesPanelToggle.querySelector(".toggle-label");
  if (toggleLabel) {
    toggleLabel.textContent = toggleLabel.textContent = "Collapse";
  }
}


function renderMessageWithCitations(text) {
  return escapeHTML(text)
    .replace(
      /\[(\d+)\]/g,
      (_, number) => `
        <button class="citation-chip" data-citation="${number}" type="button">[${number}]</button>
      `
    );
}

function renderMessage(message) {
  const role = String(message.role || "assistant").toLowerCase();
  const isUser = role === "user";
  const content = String(message.content || "").trim();
  const body = renderMessageWithCitations(content);
  const sender = isUser
    ? "You"
    : (message.agent_name ? agentLabel(message.agent_name) : "Assistant");

  return `
    <article class="message-row ${isUser ? "user" : "assistant"}" aria-label="${escapeHTML(role)} message">
      <div class="message-stack">
        <div class="message-label ${isUser ? "user" : "assistant"}">${escapeHTML(sender)}</div>
        <div class="message-bubble">
          <div class="message-text">${body || "<span class='empty-subtle'>No content</span>"}</div>
        </div>
      </div>
    </article>
  `;
}

export function renderMessages() {
  const session = getActiveSession();
  if (!session || !els.outputBody) {
    return;
  }

  const messages = Array.isArray(session.messages) ? session.messages : [];
  if (!messages.length) {
    els.outputBody.innerHTML = `
      <div class="empty-state empty-state-card conversation-empty">
        <div class="empty-state-icon" aria-hidden="true">✦</div>
        <div class="empty-title">Ready to run</div>
        <div class="empty-sub">Choose the sources on the left, write a prompt, and run the session.</div>
      </div>
    `;
    return;
  }

  const previousMessageCount = els.outputBody.querySelectorAll(".message-row").length;
  const hasNewMessages = messages.length > previousMessageCount;

  els.outputBody.innerHTML = messages.map(renderMessage).join("");

  els.outputBody.querySelectorAll(".citation-chip").forEach((button) => {
    button.addEventListener("click", () => {
      const citation = button.dataset.citation || "";
      console.log("Citation", citation);
    });
  });

  // Always scroll to bottom when new messages are added
  if (hasNewMessages) {
    requestAnimationFrame(() => {
      els.outputBody.scrollTop = els.outputBody.scrollHeight;
    });
  }
}
export function renderWorkspaceChrome() {
  const session = getActiveSession();
  if (!session) return;

  els.sessionKicker.textContent = `SESSION ${session.id}`;
  els.sessionTitle.textContent = session.title;
  els.manualModeBtn.classList.toggle("active", session.routing_mode === "manual");
  els.autoModeBtn.classList.toggle("active", session.routing_mode === "auto");

  els.manualModeBtn.title = "Manual mode uses the selected specialist agent";
  els.autoModeBtn.title = "Auto-route chooses the specialist when the request is clear";

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
  renderComposerToolbar();
  renderSourcesPanel();
  renderMessages();
  renderAgentPicker();
}

export function renderAll() {
  renderHub();
  renderWorkspace();
}
