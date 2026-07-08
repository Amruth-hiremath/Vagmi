const TOKEN_KEY = "vagmi_token";
const USER_KEY = "vagmi_user";

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser() {
  const data = localStorage.getItem(USER_KEY);
  if (!data) return null;

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function clearUser() {
  localStorage.removeItem(USER_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function clearSession() {
  clearToken();
  clearUser();
}

export function isAuthenticated() {
  return getToken() !== null;
}

export function getAuthPageUrl() {
  return "/pages/auth/index.html";
}

export function logout() {
  clearSession();
  window.location.replace(getAuthPageUrl());
}
