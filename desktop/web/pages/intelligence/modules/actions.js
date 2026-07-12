import {
  fetchAiSessions,
  createAiSession,
  fetchAiSession,
  updateAiSession,
  deleteAiSession,
  updateAiSessionDocuments,
  fetchAiSessionArtifacts,
  deleteAiSessionArtifact,
  runAiSession,
  regenerateAiSession,
  uploadAiDocument
} from "./api.js";
import {
  els,
  state,
  persistUi,
  normalizeSession,
  normalizeDocument,
  normalizeAgent,
  agentLabel,
  getStorageUi,
  getActiveSession,
  getSessionSummary,
  upsertSession,
  getSelectedDocIds,
  truncate
} from "./context.js";
import { showToast, openDialog, closeDialog, clearSessionMenu, openSessionMenu, positionMenu } from "./ui.js";
import { renderAll, renderHub, renderDocumentList, renderArtifactsStrip, renderMessages, renderWorkspace, renderWorkspaceChrome } from "./render.js";

export async function loadBootstrapData() {
  if (state.loading) return;
  state.loading = true;

  try {
    const sessions = await fetchAiSessions();
    state.sessions = Array.isArray(sessions) ? sessions.map(normalizeSession) : [];
    state.documents = [];

    const saved = getStorageUi();
    state.ui = {
      activeSessionId: saved.activeSessionId ?? null,
      hubFilter: saved.hubFilter || "all",
      hubSort: saved.hubSort || "recent",
      hubSearch: saved.hubSearch || "",
      docSearch: saved.docSearch || "",
      artifactsOpen: Boolean(saved.artifactsOpen),
      drafts: saved.drafts && typeof saved.drafts === "object" ? { ...saved.drafts } : {}
    };
    state.hubFilter = state.ui.hubFilter;
    state.hubSort = state.ui.hubSort;
    state.hubSearch = state.ui.hubSearch;
    state.docSearch = state.ui.docSearch;
    state.artifactsOpen = state.ui.artifactsOpen;
    state.drafts = { ...state.ui.drafts };

    if (els.sessionSearch) els.sessionSearch.value = state.hubSearch;
    if (els.sessionSort) els.sessionSort.value = state.hubSort;
    if (els.docSearch) els.docSearch.value = state.docSearch;

    const savedActive = saved.activeSessionId ? Number(saved.activeSessionId) : null;
    const initialSessionId = state.sessions.some((session) => Number(session.id) === Number(savedActive))
      ? savedActive
      : state.sessions[0]?.id || null;

    state.booted = true;

    if (initialSessionId) {
      await openSession(initialSessionId, { fromBootstrap: true });
    } else {
      state.activeSessionId = null;
      state.activeSession = null;
      renderAll();
      setBusy(false, "Ready");
    }
  } catch (error) {
    console.error(error);
    state.booted = true;
    renderAll();
    showToast(error?.message || "Failed to load AI workspace", "error");
    setBusy(false, "Ready");
  } finally {
    state.loading = false;
  }
}

export async function openSession(sessionId, { fromBootstrap = false } = {}) {
  const id = Number(sessionId);
  if (!id) return;

  clearSessionMenu();
  state.activeSessionId = id;
  persistUi({
    activeSessionId: id,
    hubFilter: state.hubFilter,
    hubSort: state.hubSort,
    hubSearch: state.hubSearch,
    docSearch: state.docSearch,
    artifactsOpen: state.artifactsOpen,
    drafts: state.drafts
  });

  const seq = ++state.loadSeq;
  state.loadingSession = true;
  setBusy(true, "Opening session…");

  try {
    const [session, artifacts] = await Promise.all([
      fetchAiSession(id),
      fetchAiSessionArtifacts(id)
    ]);

    if (seq !== state.loadSeq) return;

    state.activeSession = normalizeSession(session);
    state.documents = Array.isArray(session?.selected_documents) ? session.selected_documents.map(normalizeDocument) : [];
    state.sessionArtifacts = Array.isArray(artifacts) ? artifacts : [];
    state.agentMenuOpen = false;
    state.artifactsOpen = Boolean(state.ui.artifactsOpen && state.sessionArtifacts.length > 0);
    persistUi({
      activeSessionId: id,
      hubFilter: state.hubFilter,
      hubSort: state.hubSort,
      hubSearch: state.hubSearch,
      docSearch: state.docSearch,
      artifactsOpen: state.artifactsOpen,
      drafts: state.drafts
    });
    upsertSession(state.activeSession);
    renderAll();
    setBusy(false, "Ready");
  } catch (error) {
    if (seq !== state.loadSeq) return;
    console.error(error);
    showToast(error?.message || "Could not open session", "error");
    state.activeSession = null;
    state.documents = [];
    state.sessionArtifacts = [];
    state.artifactsOpen = false;
    state.activeSessionId = null;
    renderHub();
    setBusy(false, "Ready");
  } finally {
    state.loadingSession = false;
  }
}

export function showHub() {
  clearSessionMenu();
  state.activeSessionId = null;
  state.activeSession = null;
  state.documents = [];
  state.sessionArtifacts = [];
  state.artifactsOpen = false;
  state.agentMenuOpen = false;
  persistUi({
    activeSessionId: null,
    hubFilter: state.hubFilter,
    hubSort: state.hubSort,
    hubSearch: state.hubSearch,
    docSearch: state.docSearch,
    artifactsOpen: false,
    drafts: state.drafts
  });
  renderAll();
}

export async function handleCreateSession() {
  const suggested = `Session ${state.sessions.length + 1}`;
  openDialog({
    title: "Create session",
    body: "Give the new intelligence session a name, or leave it as the default.",
    confirmText: "Create",
    showInput: true,
    inputValue: suggested,
    onConfirm: async (value) => {
      const title = String(value || "").trim();
      closeDialog();
      setBusy(true, "Creating session…");
      try {
        const created = await createAiSession({
          title: title || undefined,
          routing_mode: "manual",
          selected_agent: "query"
        });
        const normalized = normalizeSession(created);
        upsertSession(normalized);
        state.activeSessionId = normalized.id;
        persistUi({
          activeSessionId: normalized.id,
          hubFilter: state.hubFilter,
          hubSort: state.hubSort,
          hubSearch: state.hubSearch,
          docSearch: state.docSearch,
          artifactsOpen: false,
          drafts: state.drafts
        });
        await openSession(normalized.id);
        showToast("Session created");
      } catch (error) {
        console.error(error);
        showToast(error?.message || "Failed to create session", "error");
        setBusy(false, "Ready");
      }
    }
  });
}

export async function renameSession(sessionId, nextTitle) {
  const session = getSessionSummary(sessionId) || getActiveSession();
  if (!session) return;
  const title = String(nextTitle || "").trim();
  if (!title) return;

  setBusy(true, "Renaming…");
  try {
    const updated = await updateAiSession(sessionId, { title });
    const normalized = normalizeSession(updated);
    upsertSession(normalized);
    if (state.activeSessionId && Number(state.activeSessionId) === Number(sessionId)) {
      state.activeSession = normalized;
    }
    renderAll();
    showToast("Session renamed");
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Rename failed", "error");
  } finally {
    setBusy(false, "Ready");
  }
}

export async function deleteSession(sessionId) {
  const session = getSessionSummary(sessionId) || getActiveSession();
  if (!session) return;

  openDialog({
    title: "Delete session",
    body: `Delete “${session.title}”? This removes its messages and artifacts from this device.`,
    confirmText: "Delete",
    showInput: false,
    danger: true,
    onConfirm: async () => {
      closeDialog();
      setBusy(true, "Deleting…");
      try {
        await deleteAiSession(sessionId);
        state.sessions = state.sessions.filter((item) => Number(item.id) !== Number(sessionId));
        state.sessionArtifacts = [];
        state.activeSession = null;
        state.activeSessionId = null;
        state.artifactsOpen = false;
        persistUi({
          activeSessionId: null,
          hubFilter: state.hubFilter,
          hubSort: state.hubSort,
          hubSearch: state.hubSearch,
          docSearch: state.docSearch,
          artifactsOpen: false,
          drafts: state.drafts
        });
        renderAll();
        showToast("Session deleted");
      } catch (error) {
        console.error(error);
        showToast(error?.message || "Delete failed", "error");
      } finally {
        setBusy(false, "Ready");
      }
    }
  });
}

export async function updateSessionModeAndAgent(payload) {
  const session = getActiveSession();
  if (!session || state.busy) return;

  setBusy(true, "Saving settings…");
  try {
    const updated = await updateAiSession(session.id, payload);
    const normalized = normalizeSession(updated);
    state.agentMenuOpen = false;
    state.activeSession = normalized;
    upsertSession(normalized);
    renderAll();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not update session", "error");
  } finally {
    setBusy(false, "Ready");
  }
}

export async function toggleDocumentSelection(documentId) {
  const session = getActiveSession();
  if (!session || state.busy) return;

  const currentIds = new Set(getSelectedDocIds(session));
  if (currentIds.has(Number(documentId))) currentIds.delete(Number(documentId));
  else currentIds.add(Number(documentId));

  setBusy(true, "Updating sources…");
  try {
    const updated = await updateAiSessionDocuments(session.id, Array.from(currentIds));
    const normalized = normalizeSession(updated);
    state.agentMenuOpen = false;
    state.activeSession = normalized;
    upsertSession(normalized);
    renderAll();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not update documents", "error");
  } finally {
    setBusy(false, "Ready");
  }
}

export async function toggleSelectAllDocuments() {
  const session = getActiveSession();
  if (!session || state.busy) return;

  const selected = getSelectedDocIds(session);
  const allIds = state.documents.map((doc) => Number(doc.id));
  const selectAll = selected.length !== allIds.length;
  const nextIds = selectAll ? allIds : [];

  setBusy(true, "Updating sources…");
  try {
    const updated = await updateAiSessionDocuments(session.id, nextIds);
    const normalized = normalizeSession(updated);
    state.agentMenuOpen = false;
    state.activeSession = normalized;
    upsertSession(normalized);
    renderAll();
    showToast(selectAll ? "All documents selected" : "All documents cleared");
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not update documents", "error");
  } finally {
    setBusy(false, "Ready");
  }
}

function getArtifactById(artifactId) {
  return (state.sessionArtifacts || []).find((artifact) => Number(artifact.id) === Number(artifactId)) || null;
}

function artifactFileName(artifact) {
  const base = String(artifact?.title || "artifact")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artifact";
  const type = String(artifact?.artifact_type || "txt").toLowerCase();
  const ext = type.includes("mermaid") ? "mmd" : type.includes("document") || type.includes("summary") ? "md" : "txt";
  return `${base}.${ext}`;
}

export async function copyArtifactContent(artifactId) {
  const artifact = getArtifactById(artifactId);
  if (!artifact) return;
  try {
    const text = String(artifact.content || "");
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
    } else {
      const fallback = document.createElement("textarea");
      fallback.value = text;
      fallback.setAttribute("readonly", "true");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      fallback.select();
      document.execCommand("copy");
      fallback.remove();
    }
    showToast("Artifact copied");
  } catch (error) {
    console.error(error);
    showToast("Copy failed", "error");
  }
}

export async function downloadArtifact(artifactId) {
  const artifact = getArtifactById(artifactId);
  if (!artifact) return;
  try {
    const blob = new Blob([String(artifact.content || "")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = artifactFileName(artifact);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Download started");
  } catch (error) {
    console.error(error);
    showToast("Download failed", "error");
  }
}

export async function removeArtifact(artifactId) {
  const session = getActiveSession();
  if (!session || state.busy) return;

  setBusy(true, "Deleting artifact…");
  try {
    await deleteAiSessionArtifact(session.id, artifactId);
    const artifacts = await fetchAiSessionArtifacts(session.id);
    state.sessionArtifacts = Array.isArray(artifacts) ? artifacts : [];
    state.artifactsOpen = true;
    const updatedSession = { ...session, artifact_count: state.sessionArtifacts.length };
    state.activeSession = normalizeSession(updatedSession);
    upsertSession(updatedSession);
    renderAll();
    showToast("Artifact deleted");
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not delete artifact", "error");
  } finally {
    setBusy(false, "Ready");
  }
}

export async function handleRun() {
  const session = getActiveSession();
  const prompt = getPromptValue().trim();
  if (!session || !prompt || state.busy) return;

  setBusy(true, "Running…");
  try {
    const response = await runAiSession(session.id, {
      prompt,
      routing_mode: session.routing_mode,
      selected_agent: session.selected_agent
    });

    state.activeSession = normalizeSession(response.session);
    state.activeSessionId = Number(response.session.id);
    upsertSession(response.session);

    const artifacts = await fetchAiSessionArtifacts(session.id).catch(() => []);
    state.sessionArtifacts = Array.isArray(artifacts) ? artifacts : [];
    state.artifactsOpen = state.sessionArtifacts.length > 0;

    const shouldKeepPrompt = Boolean(response.needs_clarification);
    if (shouldKeepPrompt) {
      state.drafts[String(session.id)] = prompt;
      els.promptInput.value = prompt;
      showToast("Clarification needed", "info");
    } else {
      state.drafts[String(session.id)] = "";
      els.promptInput.value = "";
      showToast("Response saved");
    }

    persistUi({
      activeSessionId: state.activeSessionId,
      hubFilter: state.hubFilter,
      hubSort: state.hubSort,
      hubSearch: state.hubSearch,
      docSearch: state.docSearch,
      artifactsOpen: state.artifactsOpen,
      drafts: state.drafts
    });

    renderAll();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Run failed", "error");
  } finally {
    setBusy(false, "Ready");
    updateComposerCharacterCount();
    updateRunControls();
  }
}

export async function handleRegenerate() {
  const session = getActiveSession();
  if (!session || state.busy) return;

  setBusy(true, "Regenerating…");
  try {
    const response = await regenerateAiSession(session.id, {
      routing_mode: session.routing_mode,
      selected_agent: session.selected_agent
    });

    state.activeSession = normalizeSession(response.session);
    upsertSession(response.session);

    const artifacts = await fetchAiSessionArtifacts(session.id).catch(() => []);
    state.sessionArtifacts = Array.isArray(artifacts) ? artifacts : [];
    state.artifactsOpen = state.sessionArtifacts.length > 0;

    renderAll();
    showToast("Regenerated");
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Regenerate failed", "error");
  } finally {
    setBusy(false, "Ready");
  }
}

export async function applyClarificationChoice(agent) {
  const session = getActiveSession();
  if (!session || state.busy) return;
  await updateSessionModeAndAgent({ routing_mode: "manual", selected_agent: normalizeAgent(agent) });
  showToast(`Switched to ${agentLabel(agent)}`);
  els.promptInput.focus();
}

export async function handleUploadDocuments(fileList) {
  const session = getActiveSession();
  if (!session) {
    showToast("Open a session first to upload documents.", "error");
    return;
  }

  const files = Array.from(fileList || []).filter(Boolean);
  if (!files.length || state.busy) return;

  setBusy(true, "Uploading…");
  try {
    for (const file of files) {
      await uploadAiDocument(file, session.id);
    }

    const refreshed = await fetchAiSession(session.id);
    state.activeSession = normalizeSession(refreshed);
    state.documents = Array.isArray(refreshed?.selected_documents) ? refreshed.selected_documents.map(normalizeDocument) : [];
    upsertSession(state.activeSession);
    renderAll();
    showToast(files.length === 1 ? "Document attached to this session" : `${files.length} documents attached to this session`);
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Upload failed", "error");
  } finally {
    if (els.uploadDocsInput) els.uploadDocsInput.value = "";
    setBusy(false, "Ready");
  }
}

export function handleHubFilterClick(filter) {
  state.hubFilter = filter;
  persistUi({
    activeSessionId: state.activeSessionId,
    hubFilter: state.hubFilter,
    hubSort: state.hubSort,
    hubSearch: state.hubSearch,
    docSearch: state.docSearch,
    artifactsOpen: state.artifactsOpen,
    drafts: state.drafts
  });
  renderHub();
}

export async function handleSessionMenuAction(action) {
  const sessionId = Number(state.selectedSessionMenuId);
  if (!sessionId) return;

  clearSessionMenu();

  if (action === "rename") {
    const session = getSessionSummary(sessionId) || getActiveSession();
    if (!session) return;
    openDialog({
      title: "Rename session",
      body: "Give this session a clearer name.",
      confirmText: "Rename",
      showInput: true,
      inputValue: session.title,
      onConfirm: async (value) => {
        const next = String(value || "").trim();
        closeDialog();
        if (!next) return;
        await renameSession(sessionId, next);
      }
    });
    return;
  }

  if (action === "delete") {
    await deleteSession(sessionId);
  }
}

export function autoResizePrompt() {
  if (!els.promptInput) return;
  els.promptInput.style.height = "auto";
  const nextHeight = Math.max(52, Math.min(180, els.promptInput.scrollHeight));
  els.promptInput.style.height = `${nextHeight}px`;
}

export function getPromptValue() {
  return String(els.promptInput?.value || "");
}

export function updateComposerCharacterCount() {
  if (!els.composerCharCount) return;
  const count = getPromptValue().length;
  els.composerCharCount.textContent = `${count} / 4000`;
  els.composerCharCount.classList.toggle("near-limit", count >= 3600);
}

export function updateRunControls() {
  const session = getActiveSession();
  const prompt = getPromptValue().trim();
  if (els.runBtn) els.runBtn.disabled = state.busy || !session || !prompt;
  if (els.regenerateBtn) {
    const hasMessages = Boolean(session && ((session.message_count || 0) > 0 || (session.messages || []).length > 0));
    els.regenerateBtn.disabled = state.busy || !hasMessages;
  }
}

export function syncPromptFromDraft() {
  const session = getActiveSession();
  if (!session || !els.promptInput) return;
  const key = String(session.id);
  els.promptInput.value = state.drafts[key] ?? "";
  autoResizePrompt();
  updateComposerCharacterCount();
  updateRunControls();
}

export function hydrateUi() {
  if (!els.sessionSearch || !els.sessionSort || !els.docSearch || !els.promptInput) return;
  els.sessionSearch.value = state.hubSearch;
  els.sessionSort.value = state.hubSort;
  els.docSearch.value = state.docSearch;
  syncPromptFromDraft();
}

export function bindEvents() {
  els.createSessionBtn?.addEventListener("click", handleCreateSession);
  els.backBtn?.addEventListener("click", () => showHub());

  els.hubTabs.forEach((button) => {
    button.addEventListener("click", () => handleHubFilterClick(button.dataset.hubFilter || "all"));
  });

  els.sessionSearch?.addEventListener("input", () => {
    state.hubSearch = els.sessionSearch.value;
    persistUi({ activeSessionId: state.activeSessionId, hubFilter: state.hubFilter, hubSort: state.hubSort, hubSearch: state.hubSearch, docSearch: state.docSearch, artifactsOpen: state.artifactsOpen, drafts: state.drafts });
    renderHub();
  });

  els.sessionSort?.addEventListener("change", () => {
    state.hubSort = els.sessionSort.value || "recent";
    persistUi({ activeSessionId: state.activeSessionId, hubFilter: state.hubFilter, hubSort: state.hubSort, hubSearch: state.hubSearch, docSearch: state.docSearch, artifactsOpen: state.artifactsOpen, drafts: state.drafts });
    renderHub();
  });

  els.docSearch?.addEventListener("input", () => {
    state.docSearch = els.docSearch.value;
    persistUi({ activeSessionId: state.activeSessionId, hubFilter: state.hubFilter, hubSort: state.hubSort, hubSearch: state.hubSearch, docSearch: state.docSearch, artifactsOpen: state.artifactsOpen, drafts: state.drafts });
    renderDocumentList();
  });

  els.uploadDocsBtn?.addEventListener("click", () => {
    els.uploadDocsInput?.click();
  });

  els.uploadDocsInput?.addEventListener("change", () => {
    if (els.uploadDocsInput.files && els.uploadDocsInput.files.length) {
      handleUploadDocuments(els.uploadDocsInput.files);
    }
  });

  els.selectAllDocsBtn?.addEventListener("click", () => toggleSelectAllDocuments());
  els.manualModeBtn?.addEventListener("click", () => updateSessionModeAndAgent({ routing_mode: "manual" }));
  els.autoModeBtn?.addEventListener("click", () => updateSessionModeAndAgent({ routing_mode: "auto" }));
  els.runBtn?.addEventListener("click", () => handleRun());
  els.regenerateBtn?.addEventListener("click", () => handleRegenerate());

  els.promptInput?.addEventListener("input", () => {
    const session = getActiveSession();
    if (!session) return;
    state.drafts[String(session.id)] = els.promptInput.value;
    autoResizePrompt();
    updateComposerCharacterCount();
    updateRunControls();
    persistUi({ activeSessionId: state.activeSessionId, hubFilter: state.hubFilter, hubSort: state.hubSort, hubSearch: state.hubSearch, docSearch: state.docSearch, artifactsOpen: state.artifactsOpen, drafts: state.drafts });
  });

  els.promptInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleRun();
    }
  });

  els.agentPicker?.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-agent-toggle]");
    const option = event.target.closest("[data-agent-option]");
    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      state.agentMenuOpen = !state.agentMenuOpen;
      renderAgentPicker();
      return;
    }
    if (option) {
      event.preventDefault();
      event.stopPropagation();
      const agent = normalizeAgent(option.dataset.agentOption);
      state.agentMenuOpen = false;
      updateSessionModeAndAgent({ routing_mode: "manual", selected_agent: agent });
    }
  });

  els.sessionGrid?.addEventListener("click", (event) => {
    const create = event.target.closest("#create-session-card");
    if (create) {
      handleCreateSession();
      return;
    }
    const clear = event.target.closest("#clear-session-filters-btn");
    if (clear) {
      state.hubFilter = "all";
      state.hubSearch = "";
      state.hubSort = "recent";
      if (els.sessionSearch) els.sessionSearch.value = "";
      if (els.sessionSort) els.sessionSort.value = "recent";
      persistUi({ activeSessionId: state.activeSessionId, hubFilter: state.hubFilter, hubSort: state.hubSort, hubSearch: state.hubSearch, docSearch: state.docSearch, artifactsOpen: state.artifactsOpen, drafts: state.drafts });
      renderHub();
      return;
    }
    const menuBtn = event.target.closest("[data-session-menu-btn]");
    if (menuBtn) {
      event.preventDefault();
      event.stopPropagation();
      openSessionMenu(Number(menuBtn.dataset.sessionMenuBtn), menuBtn);
      return;
    }
    const sessionBtn = event.target.closest("[data-session-id]");
    if (sessionBtn) {
      openSession(Number(sessionBtn.dataset.sessionId));
    }
  });


  els.sessionGrid?.addEventListener("keydown", (event) => {
    const card = event.target.closest?.("[data-session-id]");
    if (!card) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openSession(Number(card.dataset.sessionId));
    }
  });

  els.docList?.addEventListener("click", (event) => {
    const uploadBtn = event.target.closest("#doc-empty-upload-btn");
    if (uploadBtn) {
      els.uploadDocsBtn?.click();
      return;
    }
    const item = event.target.closest("[data-doc-id]");
    if (item) {
      toggleDocumentSelection(Number(item.dataset.docId));
    }
  });

  els.artifactsStrip?.addEventListener("click", (event) => {
    const copyBtn = event.target.closest("[data-copy-artifact]");
    const downloadBtn = event.target.closest("[data-download-artifact]");
    const deleteBtn = event.target.closest("[data-delete-artifact]");
    if (copyBtn) return copyArtifactContent(Number(copyBtn.dataset.copyArtifact));
    if (downloadBtn) return downloadArtifact(Number(downloadBtn.dataset.downloadArtifact));
    if (deleteBtn) return removeArtifact(Number(deleteBtn.dataset.deleteArtifact));
  });

  els.sessionMenu?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-session-action]");
    if (!button) return;
    handleSessionMenuAction(button.dataset.sessionAction);
  });

  els.dialogCloseBtn?.addEventListener("click", closeDialog);
  els.dialogCancelBtn?.addEventListener("click", closeDialog);
  els.dialogConfirmBtn?.addEventListener("click", async () => {
    const confirm = state.dialog.onConfirm;
    if (typeof confirm === "function") {
      await confirm(els.dialogInput?.value || "");
    } else {
      closeDialog();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!els.sessionMenu?.classList.contains("hidden")) clearSessionMenu();
      if (state.agentMenuOpen) {
        state.agentMenuOpen = false;
        renderAgentPicker();
      }
      if (state.dialog.open) closeDialog();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!els.sessionMenu?.classList.contains("hidden")) {
      const clickedMenu = els.sessionMenu.contains(event.target);
      const clickedAnchor = state.selectedSessionMenuAnchor && state.selectedSessionMenuAnchor.contains(event.target);
      if (!clickedMenu && !clickedAnchor) clearSessionMenu();
    }
    const agentBox = els.agentPicker?.querySelector(".agent-box");
    if (state.agentMenuOpen && agentBox && !agentBox.contains(event.target)) {
      state.agentMenuOpen = false;
      renderAgentPicker();
    }
    if (state.dialog.open && event.target === els.dialogOverlay) {
      closeDialog();
    }
  });

  window.addEventListener("resize", () => {
    if (!els.sessionMenu?.classList.contains("hidden") && state.selectedSessionMenuAnchor) {
      positionMenu(els.sessionMenu, state.selectedSessionMenuAnchor);
    }
  });
}

export function setBusy(value, message = "") {
  state.busy = Boolean(value);
  if (els.runBtn) els.runBtn.disabled = state.busy || !getPromptValue().trim();
  if (els.regenerateBtn) {
    const hasMessages = Boolean(getActiveSession()?.message_count > 0 || (getActiveSession()?.messages || []).length > 0);
    els.regenerateBtn.disabled = state.busy || !hasMessages;
  }
  if (els.manualModeBtn) els.manualModeBtn.disabled = state.busy;
  if (els.autoModeBtn) els.autoModeBtn.disabled = state.busy;
  if (els.createSessionBtn) els.createSessionBtn.disabled = state.busy;
  if (els.selectAllDocsBtn) els.selectAllDocsBtn.disabled = state.busy || !state.documents.length;
  if (els.uploadDocsBtn) els.uploadDocsBtn.disabled = state.busy || !getActiveSession();
  if (els.artifactsToggleBtn) els.artifactsToggleBtn.disabled = state.busy && !state.sessionArtifacts.length;
  if (els.promptInput) {
    els.promptInput.readOnly = false;
    els.promptInput.disabled = false;
  }
  if (els.composerState) els.composerState.textContent = message || (state.busy ? "Working…" : "Ready");
}
