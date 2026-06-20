const API_BASE_URL = "/api";

function getToken() {
  return localStorage.getItem("vagmi_token");
}

function clearSession() {
  localStorage.removeItem("vagmi_token");
  localStorage.removeItem("vagmi_user");
}

function getAuthPageUrl() {
  return "/pages/auth/index.html";
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

async function apiRequest(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers["Content-Type"] &&
    !headers["content-type"]
  ) {
    headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers
    });
  } catch {
    throw new Error(
      "Unable to reach the backend. Make sure FastAPI is running."
    );
  }

  if (response.status === 401 && !options.skipAuthRedirect) {
    clearSession();
    window.location.replace(getAuthPageUrl());
    throw new Error("Session expired");
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response;
}

window.VagmiAPI = {
  apiRequest
};
