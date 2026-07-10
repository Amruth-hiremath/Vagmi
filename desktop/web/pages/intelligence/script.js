
const docs = [
  { title: "DRDO_System_Architecture.pdf", type: "PDF", status: "Indexed", size: "2.4 MB" },
  { title: "Meeting_Notes_Week3.docx", type: "DOCX", status: "Ready", size: "88 KB" },
  { title: "Project_Brief.txt", type: "TXT", status: "Indexed", size: "14 KB" },
  { title: "Retrieval_Pipeline.pdf", type: "PDF", status: "Ready", size: "1.1 MB" },
];

const docList = document.getElementById("doc-list");
const searchInput = document.getElementById("doc-search");
const queryInput = document.getElementById("query-input");
const resultCard = document.getElementById("result-card");
const actionButtons = Array.from(document.querySelectorAll("[data-action]"));
const navButtons = Array.from(document.querySelectorAll("[data-nav]"));

function navigate(page) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ type: "navigate", page }, "*");
  } else {
    window.location.href = `../${page}/index.html`;
  }
}

function renderDocs(filter = "") {
  const term = filter.trim().toLowerCase();
  docList.innerHTML = "";

  docs
    .filter((doc) => doc.title.toLowerCase().includes(term))
    .forEach((doc) => {
      const item = document.createElement("article");
      item.className = "doc-item";
      item.innerHTML = `
        <div class="doc-title">${doc.title}</div>
        <div class="doc-meta">
          <span class="doc-tag">${doc.type}</span>
          <span class="doc-tag">${doc.status}</span>
        </div>
        <div class="doc-sub">${doc.size}</div>
      `;
      docList.appendChild(item);
    });
}

function setResult(action) {
  const query = queryInput.value.trim() || "the current workspace";

  const resultMap = {
    query: {
      title: "Retrieved answer",
      lines: [
        `Hybrid retrieval returned the most relevant chunks for "${query}".`,
        "Semantic search and BM25 are combined locally for precise office retrieval.",
        "Sources remain inside the secure LAN workspace."
      ]
    },
    summary: {
      title: "Summary generated",
      lines: [
        `The document set was condensed into an executive summary for "${query}".`,
        "Action items and decisions were extracted into a structured output.",
        "A DOCX/PDF export can be generated once backend wiring is connected."
      ]
    },
    report: {
      title: "Report draft",
      lines: [
        `A polished report draft was assembled from "${query}".`,
        "Sections, headings, and formatting are kept suitable for office review.",
        "Generated artifacts will be saved as Markdown, DOCX, and PDF."
      ]
    },
    diagram: {
      title: "Mermaid diagram",
      lines: [
        `Mermaid source was generated for "${query}".`,
        "Diagram export and preview are kept inside the intelligence workspace.",
        "The same output can later be saved as an artifact."
      ]
    }
  };

  const payload = resultMap[action] || resultMap.query;

  resultCard.innerHTML = `
    <div class="result-title">${payload.title}</div>
    <div class="result-lines">
      ${payload.lines.map((line) => `
        <div class="result-line">
          <span class="result-dot"></span>
          <span>${line}</span>
        </div>
      `).join("")}
    </div>
  `;
}

searchInput.addEventListener("input", () => renderDocs(searchInput.value));
actionButtons.forEach((button) => {
  button.addEventListener("click", () => setResult(button.dataset.action));
});
navButtons.forEach((btn) => {
  btn.addEventListener("click", () => navigate(btn.dataset.nav));
});

renderDocs();
setResult("query");
