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

let mode = "login";

function setMode(nextMode) {
  mode = nextMode;
  const loginMode = mode === "login";
  loginTab.classList.toggle("active", loginMode);
  registerTab.classList.toggle("active", !loginMode);
  confirmField.classList.toggle("hidden", loginMode);
  submitBtn.textContent = loginMode ? "Login" : "Register";
  errorText.textContent = "";
  confirmInput.value = "";
}

async function goToAppIfAuthenticated() {
  if (!isAuthenticated()) return;

  try {
    const response = await apiRequest("/auth/me");
    const me = await response.json();
    saveUser(me);
    window.location.replace("/index.html");
  } catch (error) {
    if (String(error?.message || "").includes("Unable to reach the backend")) {
      return;
    }
    clearSession();
  }
}

async function submitAuth() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    errorText.textContent = "Enter username and password";
    return;
  }

  submitBtn.disabled = true;
  errorText.textContent = "";

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

      window.location.replace("/index.html");
      return;
    }

    if (password !== confirmInput.value.trim()) {
      throw new Error("Passwords do not match");
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
    errorText.textContent = "Account created successfully";
    passwordInput.value = "";
    confirmInput.value = "";
  } catch (error) {
    errorText.textContent = error.message;
  } finally {
    submitBtn.disabled = false;
  }
}

loginTab.onclick = () => setMode("login");
registerTab.onclick = () => setMode("register");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuth();
});

setMode("login");
goToAppIfAuthenticated();
