from __future__ import annotations

from textwrap import dedent


def build_prompt_bundle(context: dict, routed_agent: str, routing_reason: str) -> str:
    doc_lines = []
    for doc in context.get("selected_documents", [])[:8]:
        doc_lines.append(f"- {doc['filename']} (id={doc['id']})")

    message_lines = []
    for item in context.get("recent_messages", [])[-8:]:
        role = item.get("role", "assistant")
        content = (item.get("content") or "").strip().replace("\n", " ")
        if len(content) > 180:
            content = content[:177].rstrip() + "..."
        message_lines.append(f"{role}: {content}")

    grounding_lines = []
    for index, chunk in enumerate(context.get("grounding_chunks", []), start=1):
        grounding_lines.append(f"[{index}] {chunk['filename']}: {chunk['chunk_text']}")

    prompt = context.get("prompt") or ""

    return dedent(
        f"""
        You are Vāgmi, an offline, user-isolated workplace AI.
        Session title: {context.get("title")}
        Routing mode: {context.get("routing_mode")}
        Routed agent: {routed_agent}
        Routing reason: {routing_reason}
        Selected documents:
        {chr(10).join(doc_lines) if doc_lines else "- None selected"}

        Retrieved passages:
        {chr(10).join(grounding_lines) if grounding_lines else "- No passages retrieved for this prompt"}

        Citation Rules:
        - Every factual statement taken from the retrieved passages MUST include citation markers.
        - Use the citation numbers exactly as provided above.
        - Example: "The radar operates at X GHz [1]."
        - Multiple citations are allowed, e.g. [1][3].
        - Never invent citation numbers.
        - If the retrieved passages do not contain the answer, explicitly state that the available documents do not contain sufficient information.
        - Do not use outside knowledge when retrieved passages are available.

        Recent messages:
        {chr(10).join(message_lines) if message_lines else "- No prior context"}

        User request:
        {prompt}

        Answer Requirements:
        - Answer naturally and professionally.
        - Prefer concise answers unless the user explicitly asks for detail.
        - Every factual claim supported by retrieved passages must include citations like [1] or [2].
        - If multiple passages support the same statement, cite all of them.
        - Do not output a bibliography or source list; only inline citations.
        """
    ).strip()