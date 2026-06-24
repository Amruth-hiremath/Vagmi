import {
  saveToken,
  saveUser,
  isAuthenticated,
  clearSession
} from "../../services/auth.js";

import { apiRequest } from "../../services/api.js";

const loginTab = document.getElementById("login-tab");
const registerTab = document.getElementById("register-tab");
const submitBtn = document.getElementById("submit");
const form = document.getElementById("auth-form");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const confirmField = document.getElementById("confirm-field");
const confirmInput = document.getElementById("confirm-password");
const errorText = document.getElementById("error");

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

function setRuleState(el, ok) {
  if (!el) return;
  el.classList.toggle("valid", ok);
  el.classList.toggle("invalid", !ok);
}

function utf8ByteLength(value) {
  return new TextEncoder().encode(value).length;
}

function evaluatePasswordState() {
  const password = passwordInput.value;
  const confirm = confirmInput.value;

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
  const progress = Math.round((passed / checks.length) * 100);

  meterFill.style.width = `${progress}%`;

  if (mode === "register") {
    submitBtn.disabled = !checks.every(Boolean);
  }
}

function updateLoginButtonState() {
  if (mode !== "login") return;
  const canSubmit =
    usernameInput.value.trim().length > 0 &&
    passwordInput.value.trim().length > 0;
  submitBtn.disabled = !canSubmit;
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
    evaluatePasswordState();
  }
}

async function goToAppIfAuthenticated() {
  if (!isAuthenticated()) return;

  try {
    const response = await apiRequest("/auth/me");
    const me = await response.json();
    saveUser(me);
    window.location.replace("../../splash.html");
  } catch (error) {
    if (String(error?.message || "").includes("Unable to reach the backend!")) {
      return;
    }
    clearSession();
  }
}

async function submitAuth() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password.trim()) {
    errorText.classList.remove("success-message", "error-message");
    errorText.textContent = "Enter username and password";
    return;
  }

  submitBtn.disabled = true;
  errorText.textContent = "";
  errorText.classList.remove("success-message", "error-message");

  try {
    if (mode === "login") {
      const response = await apiRequest("/auth/login", {
        method: "POST",
        skipAuthRedirect: true,
        body: JSON.stringify({
          username,
          password
        })
      });

      const payload = await response.json();
      saveToken(payload.access_token);

      const meResponse = await apiRequest("/auth/me");
      const me = await meResponse.json();
      saveUser(me);

      if (me.must_change_password) {

        window.location.replace(
          "../change-password/index.html"
        );

        return;
      }

      window.location.replace("../../splash.html");
      return;
    }

    const confirmValue = confirmInput.value;
    const passwordBytes = utf8ByteLength(password);

    if (passwordBytes < 12) {
      throw new Error("Password must be at least 12 characters long.");
    }

    if (passwordBytes > 72) {
      throw new Error("Password must be 72 characters or fewer.");
    }

    if (/\s/.test(password)) {
      throw new Error("Password cannot contain spaces.");
    }

    if (!/[a-z]/.test(password)) {
      throw new Error("Password must include a lowercase letter.");
    }

    if (!/[A-Z]/.test(password)) {
      throw new Error("Password must include an uppercase letter.");
    }

    if (!/\d/.test(password)) {
      throw new Error("Password must include a number.");
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      throw new Error("Password must include a special character.");
    }

    if (password !== confirmValue) {
      throw new Error("Passwords do not match.");
    }

    await apiRequest("/auth/register", {
      method: "POST",
      skipAuthRedirect: true,
      body: JSON.stringify({
        username,
        password
      })
    });

    setMode("login");
    errorText.classList.remove("error-message");
    errorText.classList.add("success-message");
    errorText.textContent = "Account created successfully! You can now log in.";
    passwordInput.value = "";
    confirmInput.value = "";
    submitBtn.disabled = true;
  } catch (error) {
    errorText.classList.remove("success-message");
    errorText.classList.add("error-message");
    errorText.textContent = error.message || "Authentication failed!";
  } finally {
    if (mode === "login") {
      updateLoginButtonState();
    } else {
      evaluatePasswordState();
    }
  }
}

loginTab.onclick = () => setMode("login");
registerTab.onclick = () => setMode("register");

usernameInput.addEventListener("input", updateLoginButtonState);
passwordInput.addEventListener("input", () => {
  if (mode === "register") {
    evaluatePasswordState();
  } else {
    updateLoginButtonState();
  }
});
confirmInput.addEventListener("input", () => {
  if (mode === "register") {
    evaluatePasswordState();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuth();
});

setMode("login");
goToAppIfAuthenticated();