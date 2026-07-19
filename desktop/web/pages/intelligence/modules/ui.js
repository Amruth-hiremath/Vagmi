import { els, state, escapeHTML, normalizeAgent, agentLabel } from "./context.js";

export function clearSessionMenu() {
  if (!els.sessionMenu) return;
  els.sessionMenu.classList.add("hidden");
  els.sessionMenu.innerHTML = "";
  state.selectedSessionMenuId = null;
  state.selectedSessionMenuAnchor = null;
}

export function positionMenu(menu, anchor) {
  const rect = anchor.getBoundingClientRect();
  const menuWidth = 220;
  const menuHeight = 122;
  const gap = 8;
  const top = Math.max(12, Math.min(window.innerHeight - menuHeight - 12, rect.bottom + gap));
  let left = rect.right - menuWidth;
  if (left < 12) left = rect.left;
  left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, left));
  menu.style.top = `${Math.round(top)}px`;
  menu.style.left = `${Math.round(left)}px`;
}

export function openSessionMenu(sessionId, anchor) {
  if (!els.sessionMenu || !anchor) return;
  state.selectedSessionMenuId = Number(sessionId);
  state.selectedSessionMenuAnchor = anchor;

  els.sessionMenu.innerHTML = `
    <button type="button" class="menu-item" data-session-action="rename">Rename</button>
    <button type="button" class="menu-item danger" data-session-action="delete">Delete</button>
  `;
  els.sessionMenu.classList.remove("hidden");
  positionMenu(els.sessionMenu, anchor);
}

export function showToast(message, tone = "info") {
  if (!els.toastStack) return;
  const toast = document.createElement("div");
  toast.className = `toast ${tone === "error" ? "error" : ""}`.trim();
  toast.textContent = message;
  els.toastStack.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(6px)";
    toast.style.transition = "opacity 0.2s ease, transform 0.2s ease";
    window.setTimeout(() => toast.remove(), 220);
  }, 2500);
}

export function openDialog({
  title,
  body,
  confirmText = "Save",
  showInput = true,
  inputValue = "",
  danger = false,
  onConfirm
}) {
  state.dialog = {
    open: true,
    title,
    body,
    confirmText,
    showInput,
    inputValue,
    danger,
    onConfirm: typeof onConfirm === "function" ? onConfirm : null
  };

  els.dialogTitle.textContent = title;
  els.dialogBody.textContent = body;
  els.dialogConfirmBtn.textContent = confirmText;
  els.dialogConfirmBtn.classList.toggle("danger", Boolean(danger));
  els.dialogFieldWrap.classList.toggle("hidden", !showInput);
  els.dialogInput.value = inputValue || "";
  els.dialogOverlay.classList.remove("hidden");
  els.dialogOverlay.setAttribute("aria-hidden", "false");

  window.setTimeout(() => {
    if (showInput) {
      els.dialogInput.focus();
      els.dialogInput.select();
    } else {
      els.dialogConfirmBtn.focus();
    }
  }, 0);
}

export function closeDialog() {
  state.dialog = {
    open: false,
    title: "",
    body: "",
    confirmText: "Save",
    showInput: true,
    inputValue: "",
    danger: false,
    onConfirm: null
  };
  els.dialogOverlay.classList.add("hidden");
  els.dialogOverlay.setAttribute("aria-hidden", "true");
}

export function renderAgentPicker() {
  if (!els.agentPicker) return;
  const session = state.activeSession;
  if (!session) {
    els.agentPicker.innerHTML = "";
    return;
  }

  const selected = session.routing_mode === "auto" ? "master" : normalizeAgent(session.selected_agent);
  const menuOpen = Boolean(state.agentMenuOpen && session.routing_mode === "manual");

  els.agentPicker.innerHTML = `
    <div class="agent-box">
      <button class="agent-button" type="button" data-agent-toggle aria-label="Select agent">
        <span class="agent-button-label">
          <span class="agent-label mono">Agent</span>
          <span class="agent-value">${escapeHTML(agentLabel(selected))}</span>
        </span>
        <span class="agent-caret" aria-hidden="true">▾</span>
      </button>
      <div class="agent-menu ${menuOpen ? "" : "hidden"}" data-agent-menu role="menu">
        ${["query","summary","diagram","document"].map((value) => `
          <button class="menu-item ${value === selected ? "active" : ""}" type="button" data-agent-option="${escapeHTML(value)}">
            <span class="menu-item-label">${escapeHTML(agentLabel(value))}</span>
            ${value === selected ? '<span class="menu-item-check">✓</span>' : ""}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}
