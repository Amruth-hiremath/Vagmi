import { bindEvents, hydrateUi, loadBootstrapData, setBusy } from "./actions.js";
import { renderAll } from "./render.js";

export async function init() {
  bindEvents();
  hydrateUi();
  await loadBootstrapData();
  hydrateUi();
  renderAll();
  setBusy(false, "Ready");
}

document.addEventListener("DOMContentLoaded", init);
