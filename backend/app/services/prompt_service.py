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

        Retrieved passages (cite by bracket number, do not invent facts outside these passages when they exist):
        {chr(10).join(grounding_lines) if grounding_lines else "- No passages retrieved for this prompt"}

        Recent messages:
        {chr(10).join(message_lines) if message_lines else "- No prior context"}

        User request:
        {prompt}
        """
    ).strip()