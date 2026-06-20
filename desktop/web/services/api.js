import { getToken, clearSession, getAuthPageUrl } from "./auth.js";

const API_URL = "/api";

function shouldAttachJsonHeader(body, headers) {
  if (!body) return false;
  if (body instanceof FormData) return false;
  return !Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
}

function handleUnauthorized() {
  clearSession();
  window.location.replace(getAuthPageUrl());
}

async function readErrorMessage(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const payload = await response.json();
      return payload?.detail || payload?.message || "Request failed";
    } catch {
      return "Request failed";
    }
  }

  try {
    const text = await response.text();
    return text.trim() || "Request failed";
  } catch {
    return "Request failed";
  }
}

export async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const {
    skipAuthRedirect = false,
    headers: inputHeaders = {},
    body,
    ...rest
  } = options;

  const headers = { ...inputHeaders };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (shouldAttachJsonHeader(body, headers)) {
    headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...rest,
      headers,
      body
    });
  } catch {
    throw new Error(
      "Unable to reach the backend. Make sure FastAPI is running."
    );
  }

  if (response.status === 401 && !skipAuthRedirect) {
    handleUnauthorized();
    throw new Error("Session expired");
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response;
}
