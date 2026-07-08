import {
  saveToken,
  saveUser,
  isAuthenticated,
  clearSession
} from "../../services/auth.js";

import { apiRequest, ApiError } from "../../services/api.js";

const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");
const submitBtn = document.getElementById("submit");
const form = document.getElementById("auth-form");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const confirmField = document.getElementById("confirm-field");
const confirmInput = document.getElementById("confirm-password");
const errorText = document.getElementById("error");
const authNotice = document.getElementById("auth-notice");
const toastRegion = document.getElementById("toast-region");

const checker = document.getElementById("password-checker");
const meterFill = document.getElementById("password-meter-fill");
const ruleMin = document.getElementById("rule-min");
const ruleMax = document.getElementById("rule-max");
const ruleLower = document.getElementById("rule-lower");
const ruleUpper = document.getElementById("rule-upper");
const ruleDigit = document.getElementById("rule-digit");
const ruleSpecial = document.getElementById("rule-special");
const ruleMatch = document.getElementById("rule-match");

let mode = "login";
let toastTimer = null;

function setRuleState(el, ok) {
  if (!el) return;
  el.classList.toggle("valid", ok);
  el.classList.toggle("invalid", !ok);
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).length;
}

function setAuthNotice(message, tone = "success") {
  if (!authNotice) return;
  if (!message) {
    authNotice.classList.add("hidden");
    authNotice.textContent = "";
    authNotice.className = "auth-notice hidden";
    return;
  }
  authNotice.classList.remove("hidden");
  authNotice.className = `auth-notice ${tone}`;
  authNotice.textContent = message;
}

function showToast(message, tone = "success") {
  if (!toastRegion) return;

  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;

  toastRegion.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 220);
  }, 4200);
}

function validatePasswordLive(password, confirm = "") {
  const byteLen = utf8ByteLength(password);

  const minOk = byteLen >= 12;
  const maxOk = byteLen <= 72;
  const lowerOk = /[a-z]/.test(password);
  const upperOk = /[A-Z]/.test(password);
  const digitOk = /\d/.test(password);
  const specialOk = /[^A-Za-z0-9]/.test(password) && !/\s/.test(password);
  const matchOk = mode === "register" ? password === confirm && confirm.length > 0 : true;

  setRuleState(ruleMin, minOk);
  setRuleState(ruleMax, maxOk);
  setRuleState(ruleLower, lowerOk);
  setRuleState(ruleUpper, upperOk);
  setRuleState(ruleDigit, digitOk);
  setRuleState(ruleSpecial, specialOk);
  setRuleState(ruleMatch, matchOk);

  const checks = [minOk, maxOk, lowerOk, upperOk, digitOk, specialOk, matchOk];
  const passed = checks.filter(Boolean).length;
  meterFill.style.width = `${Math.round((passed / checks.length) * 100)}%`;

  if (mode === "register") {
    submitBtn.disabled = !checks.every(Boolean);
  }
}

function updateLoginButtonState() {
  if (mode !== "login") return;
  submitBtn.disabled = !(usernameInput.value.trim() && passwordInput.value.trim());
}

function setMode(nextMode) {
  mode = nextMode;
  const loginMode = mode === "login";

  loginTab.classList.toggle("active", loginMode);
  registerTab.classList.toggle("active", !loginMode);

  confirmField.classList.toggle("hidden", loginMode);
  checker.classList.toggle("hidden", loginMode);

  submitBtn.textContent = loginMode ? "Login" : "Register";
  errorText.textContent = "";
  errorText.classList.remove("success-message", "error-message");
  confirmInput.value = "";

  if (loginMode) {
    submitBtn.disabled = true;
    updateLoginButtonState();
  } else {
    validatePasswordLive(passwordInput.value, confirmInput.value);
  }
}

async function goToAppIfAuthenticated() {
  if (!isAuthenticated()) return;

  try {
    const response = await apiRequest("/auth/me", { skipAuthRedirect: true });
    const me = await response.json();
    saveUser(me);
    window.location.replace("../../splash.html");
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) {
      return;
    }
    clearSession();
  }
}

function passwordConstraintsValid(password, confirm) {
  const byteLength = utf8ByteLength(password);

  if (byteLength < 12) return "Password must be at least 12 characters long.";
  if (byteLength > 72) return "Password must be 72 characters or fewer.";
  if (/\s/.test(password)) return "Password cannot contain spaces.";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/\d/.test(password)) return "Password must include a number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a special character.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

async function submitAuth() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password.trim()) {
    errorText.className = "error-text error-message";
    errorText.textContent = "Enter username and password";
    return;
  }

  submitBtn.disabled = true;
  errorText.textContent = "";
  errorText.className = "error-text";

  try {
    if (mode === "login") {
      const response = await apiRequest("/auth/login", {
        method: "POST",
        skipAuthRedirect: true,
        body: JSON.stringify({ username, password })
      });

      const payload = await response.json();
      saveToken(payload.access_token);

      const meResponse = await apiRequest("/auth/me", { skipAuthRedirect: true });
      const me = await meResponse.json();
      saveUser(me);

      window.location.replace("../../splash.html");
      return;
    }

    const confirmValue = confirmInput.value;
    const validationMessage = passwordConstraintsValid(password, confirmValue);
    if (validationMessage) {
      throw new Error(validationMessage);
    }

    const response = await apiRequest("/auth/register", {
      method: "POST",
      skipAuthRedirect: true,
      body: JSON.stringify({ username, password })
    });

    const payload = await response.json();
    const message = payload?.message || "Registration submitted. Await administrator approval.";

    // Preserve username so the login step feels continuous.
    const submittedUsername = usernameInput.value.trim();

    setMode("login");
    usernameInput.value = submittedUsername;
    passwordInput.value = "";
    confirmInput.value = "";

    const isAdminCreated = /administrator account created/i.test(message);
    const toastMessage = isAdminCreated
      ? message
      : "Registration submitted.\nAwait administrator approval.";

    setAuthNotice(message, isAdminCreated ? "success" : "warning");
    showToast(toastMessage, isAdminCreated ? "success" : "warning");

    errorText.className = isAdminCreated ? "error-text success-message" : "error-text warning-message";
    errorText.textContent = message;
    submitBtn.disabled = false;
    updateLoginButtonState();
  } catch (error) {
    const isPendingApproval =
      error?.status === 403 &&
      String(error?.message || "").toLowerCase().includes("awaiting administrator approval");

    if (mode === "login" && isPendingApproval) {
      const message = error.message || "Your account is awaiting administrator approval.";
      setAuthNotice(message, "warning");
      showToast(message, "warning");
      errorText.className = "error-text warning-message";
      errorText.textContent = message;
      passwordInput.value = "";
      submitBtn.disabled = false;
      updateLoginButtonState();
      return;
    }

    if (error?.status === 0 || String(error?.message || "").includes("Unable to reach the backend")) {
      errorText.className = "error-text warning-message";
      errorText.textContent = "Backend is not reachable. Start the FastAPI server first.";
      submitBtn.disabled = false;
      updateLoginButtonState();
      return;
    }

    setAuthNotice("");
    errorText.className = "error-text error-message";
    errorText.textContent = error.message || "Authentication failed!";
  } finally {
    if (mode === "login") {
      updateLoginButtonState();
    } else {
      validatePasswordLive(passwordInput.value, confirmInput.value);
    }
  }
}

loginTab.onclick = () => setMode("login");
registerTab.onclick = () => setMode("register");

usernameInput.addEventListener("input", updateLoginButtonState);
passwordInput.addEventListener("input", () => {
  if (mode === "register") {
    validatePasswordLive(passwordInput.value, confirmInput.value);
  } else {
    updateLoginButtonState();
  }
});
confirmInput.addEventListener("input", () => {
  if (mode === "register") {
    validatePasswordLive(passwordInput.value, confirmInput.value);
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuth();
});

setMode("login");
goToAppIfAuthenticated();
