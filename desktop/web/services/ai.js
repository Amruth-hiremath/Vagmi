import { apiRequest } from "./api.js";

const AI_STORAGE_KEY = "vagmi-ai-ui-state";

function parseJson(response) {
  return response.json();
}

export const AI_AGENT_OPTIONS = [
  { value: "master", label: "Master" },
  { value: "query", label: "Query" },
  { value: "summary", label: "Summary" },
  { value: "diagram", label: "Diagram" },
  { value: "document", label: "Document" }
];

export const AI_MODE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "auto", label: "Auto-route" }
];

export function getAiStorageState() {
  try {
    const raw = localStorage.getItem(AI_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setAiStorageState(nextState) {
  localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(nextState || {}));
}

export async function fetchAiStatus() {
  return parseJson(await apiRequest("/ai/status"));
}

export async function fetchAiDocuments() {
  return parseJson(await apiRequest("/ai/documents"));
}

export async function fetchAiSessions() {
  return parseJson(await apiRequest("/ai/sessions"));
}

export async function createAiSession(payload = {}) {
  return parseJson(
    await apiRequest("/ai/sessions", {
      method: "POST",
      body: JSON.stringify({
        title: payload.title ?? payload.name ?? "",
        routing_mode: payload.routing_mode ?? payload.mode ?? "manual",
        selected_agent: payload.selected_agent ?? payload.agent ?? "master"
      })
    })
  );
}

export async function fetchAiSession(sessionId) {
  return parseJson(await apiRequest(`/ai/sessions/${sessionId}`));
}

export async function updateAiSession(sessionId, payload = {}) {
  return parseJson(
    await apiRequest(`/ai/sessions/${sessionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: payload.title ?? payload.name,
        routing_mode: payload.routing_mode ?? payload.mode,
        selected_agent: payload.selected_agent ?? payload.agent,
        status: payload.status
      })
    })
  );
}

export async function deleteAiSession(sessionId) {
  return parseJson(
    await apiRequest(`/ai/sessions/${sessionId}`, {
      method: "DELETE"
    })
  );
}

export async function updateAiSessionDocuments(sessionId, documentIds = []) {
  return parseJson(
    await apiRequest(`/ai/sessions/${sessionId}/documents`, {
      method: "PUT",
      body: JSON.stringify({ document_ids: documentIds })
    })
  );
}

export async function fetchAiSessionMessages(sessionId) {
  return parseJson(await apiRequest(`/ai/sessions/${sessionId}/messages`));
}

export async function fetchAiSessionContext(sessionId) {
  return parseJson(await apiRequest(`/ai/sessions/${sessionId}/context`));
}

export async function fetchAiSessionArtifacts(sessionId) {
  return parseJson(await apiRequest(`/ai/sessions/${sessionId}/artifacts`));
}

export async function runAiSession(sessionId, payload = {}) {
  return parseJson(
    await apiRequest(`/ai/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(payload)
    })
  );
}
