// desktop/web/pages/chat/core/state.js

const ACTIVE_THREAD_KEY = "vagmi-active-chat-thread";

export function makeThreadKey(threadOrType, id = null) {
  if (threadOrType && typeof threadOrType === "object") {
    const type = threadOrType.type || threadOrType.kind || "";
    const threadId = threadOrType.id ?? threadOrType.conversation_id ?? threadOrType.room_id;
    if (!type || threadId === null || threadId === undefined) return null;
    return `${type}:${String(threadId)}`;
  }

  if (!threadOrType || id === null || id === undefined) return null;
  return `${String(threadOrType)}:${String(id)}`;
}

export function saveActiveThreadKey(threadKey) {
  if (!threadKey) {
    localStorage.removeItem(ACTIVE_THREAD_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_THREAD_KEY, String(threadKey));
}

export function getSavedActiveThreadKey() {
  try {
    const raw = localStorage.getItem(ACTIVE_THREAD_KEY);
    return raw ? raw : null;
  } catch {
    return null;
  }
}

// Backwards-compatible aliases used by older imports.
export const saveActiveThreadId = saveActiveThreadKey;
export const getSavedActiveThreadId = getSavedActiveThreadKey;
