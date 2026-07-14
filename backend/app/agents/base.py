from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AgentSpec:
    name: str
    label: str
    description: str
    system_prompt: str
    answer_style: str
    max_tokens: int
    temperature: float
    top_p: float
    repeat_penalty: float
    artifact_type: str | None = None
    artifact_title: str | None = None
    reply_prefix: str = ""

    @property
    def guidance(self) -> str:
        return (
            f"{self.label} specialist. {self.description} "
            f"Style: {self.answer_style}. "
            f"Target length: {self.max_tokens} tokens max."
        ).strip()

    @property
    def prompt_contract(self) -> str:
        if self.name == "diagram":
            return (
                "Return a Mermaid diagram if helpful. If you use Mermaid, put the diagram in a fenced ```mermaid block. "
                "Keep the explanation brief and only add a short note after the diagram."
            )
        if self.name == "document":
            return (
                "Draft a polished markdown document with clear headings and readable sections. "
                "Use short paragraphs, bullet lists where helpful, put headings on their own lines, and leave blank lines between sections."
            )
        if self.name == "summary":
            return (
                "Summarize the content in a structured way: key idea, important details, and takeaways. "
                "Use bullets or headings with each section on its own line and blank lines between sections."
            )
        if self.name == "query":
            return (
                "Answer the question directly and clearly. Prefer a focused answer with 1-4 short paragraphs or bullets."
            )
        return (
            "Ask one clear clarification question. Do not answer the underlying request until it is unambiguous."
        )

    def generation_defaults(self) -> dict[str, Any]:
        return {
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "repeat_penalty": self.repeat_penalty,
        }


_AGENT_NAME_ALIASES = {
    "diagram_generation": "diagram",
    "diagram-agent": "diagram",
    "document_generation": "document",
    "document-agent": "document",
    "summary_generation": "summary",
    "summary-agent": "summary",
    "query-agent": "query",
    "master-agent": "master",
}


def normalize_agent_name(value: str | None) -> str:
    raw = (value or "query").strip().lower()
    raw = _AGENT_NAME_ALIASES.get(raw, raw)
    return raw if raw in {"master", "query", "summary", "diagram", "document"} else "query"


def agent_reply_prefix(spec: AgentSpec) -> str:
    return spec.reply_prefix.strip()


def agent_instruction_block(spec: AgentSpec, routing_reason: str, context: dict[str, Any]) -> str:
    selected_docs = context.get("selected_documents", [])
    doc_names = [doc.get("filename", "") for doc in selected_docs[:6]]
    doc_block = "\n".join(f"- {name}" for name in doc_names) if doc_names else "- None selected"
    return (
        f"Routed specialist: {spec.label}\n"
        f"Routing reason: {routing_reason}\n"
        f"Guidance: {spec.guidance}\n"
        f"Contract: {spec.prompt_contract}\n"
        f"Selected documents:\n{doc_block}"
    )


def _compact_prompt_value(text: str) -> str:
    return " ".join((text or "").split())


def build_agent_artifact_content(spec: AgentSpec, prompt: str, reply: str, context: dict[str, Any]) -> str:
    prompt = _compact_prompt_value(prompt)
    reply = (reply or "").strip()
    title = spec.artifact_title or spec.label

    if spec.name == "diagram":
        if "```mermaid" in reply:
            diagram = reply.split("```mermaid", 1)[1].split("```", 1)[0].strip()
        elif "```" in reply and "mermaid" in reply.lower():
            diagram = reply.split("```", 1)[1].split("```", 1)[0].strip()
        else:
            topic = prompt[:80] or title
            diagram = (
                "flowchart TD\n"
                f"  A[User request] --> B[{topic}]\n"
                "  B --> C[Selected documents]\n"
                "  C --> D[Grounded output]"
            )
        return f"# {title}\n\n```mermaid\n{diagram}\n```\n"

    if spec.name == "document":
        selected_docs = context.get("selected_documents", [])
        doc_names = [doc.get("filename", "") for doc in selected_docs[:5]]
        source_line = ", ".join(name for name in doc_names if name) or "No session sources attached"
        draft = reply or "No draft text was generated."
        return (
            f"# {title}\n\n"
            f"## Prompt\n{prompt}\n\n"
            f"## Draft\n{draft}\n\n"
            f"## Suggested structure\n"
            f"- Overview\n"
            f"- Key details\n"
            f"- Next steps\n\n"
            f"## Sources\n{source_line}\n"
        )

    if spec.name == "summary":
        return (
            f"# {title}\n\n"
            f"## Key takeaways\n{reply or 'No summary text was generated.'}\n"
        )

    return reply or ""
