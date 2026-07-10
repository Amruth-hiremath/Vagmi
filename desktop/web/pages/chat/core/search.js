// desktop/web/pages/chat/core/search.js

import { escapeHTML } from "./utils.js";
import { searchUsers } from "../../../services/users.js";
import { startConversation } from "../../../services/dm.js";
import { renderThreads } from "./ui.js";
import {
    renderNewChatResults,
    renderNewChatState,
    closeNewChatModal
} from "./modal.js";

import {
    loadConversations,
    openThread
} from "./conversation.js";
let newChatSearchTimer = null;

export function currentSearchUpdate() {
  const state = window.chatState;
  const chatSearch = document.getElementById("chat-search");
  state.chatSearch = chatSearch.value;
  renderThreads(state);
}

export async function searchRegisteredUsers(query) {
  const newChatResults = document.getElementById("new-chat-results");
  if (!newChatResults) return;
  try {
    newChatResults.innerHTML = `<div class="new-chat-loading">Searching users...</div>`;
    const users = await searchUsers(query ?? "");
    renderNewChatResults(users);
  } catch (error) {
    console.error("User search failed", error);
    renderNewChatState("Unable to search users right now.");
  }
}

export async function startChatWithUser(username) {
  try {
    const conversation = await startConversation(username);
    closeNewChatModal();
    await loadConversations({ preserveSelection: false });
    await openThread(`dm:${conversation.id}`, { remember: true });
  } catch (error) {
    console.error("Failed to start conversation", error);
    renderNewChatState(error?.message || "Failed to start conversation.");
  }
}


