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

        Recent messages:
        {chr(10).join(message_lines) if message_lines else "- No prior context"}

        User request:
        {prompt}
        """
    ).strip()
