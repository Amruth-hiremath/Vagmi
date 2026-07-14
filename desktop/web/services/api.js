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

  const formatDetail = (detail) => {
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            const loc = Array.isArray(item.loc) ? item.loc.join(".") : "";
            const msg = item.msg || item.message || JSON.stringify(item);
            return loc ? `${loc}: ${msg}` : String(msg);
          }
          return String(item);
        })
        .filter(Boolean)
        .join("; ");
    }
    if (detail && typeof detail === "object") {
      return detail.message || detail.msg || JSON.stringify(detail);
    }
    return String(detail || "");
  };

  if (contentType.includes("application/json")) {
    try {
      const payload = await response.json();
      const detail = formatDetail(payload?.detail);
      return detail || payload?.message || "Request failed";
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

  // FIX: Add a 600-second (10 minute) timeout for slow LLM requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600000);

  let response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...rest,
      headers,
      body,
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError("Request timed out. The AI model took too long to respond.", 408);
    }
    throw new ApiError(
      "Unable to reach the backend. Make sure FastAPI is running.",
      0,
      { cause: error }
    );
  } finally {
    clearTimeout(timeoutId);
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
