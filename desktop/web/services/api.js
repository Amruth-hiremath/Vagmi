const API_URL = "/api";

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function shouldAttachJsonHeader(body, headers) {
  if (!body) return false;
  if (body instanceof FormData) return false;
  return !Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
}

function handleUnauthorized() {
  localStorage.removeItem("vagmi_token");
  localStorage.removeItem("vagmi_user");
  window.location.replace("/pages/auth/index.html");
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
  const token = localStorage.getItem("vagmi_token");
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
  } catch (error) {
    throw new ApiError(
      "Unable to reach the backend. Make sure FastAPI is running.",
      0,
      { cause: error }
    );
  }

  if (response.status === 401 && !skipAuthRedirect) {
    handleUnauthorized();
    throw new ApiError("Session expired", 401);
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new ApiError(message, response.status);
  }

  return response;
}
