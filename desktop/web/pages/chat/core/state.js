// desktop/web/pages/chat/core/state.js

const ACTIVE_THREAD_KEY = "vagmi-active-chat-thread";

export function saveActiveThreadId(threadId) {
  if (threadId === null || threadId === undefined) {
    localStorage.removeItem(ACTIVE_THREAD_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_THREAD_KEY, String(threadId));
}

export function getSavedActiveThreadId() {
  const raw = localStorage.getItem(ACTIVE_THREAD_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
