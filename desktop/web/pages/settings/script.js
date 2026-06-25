import { getUser } from "../../services/auth.js";
const currentUser = getUser();
const navButtons = Array.from(document.querySelectorAll("[data-nav]"));

function navigate(page) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "navigate", page }, "*");
  } else {
    window.location.href = `../${page}/index.html`;
  }
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.nav));
});
