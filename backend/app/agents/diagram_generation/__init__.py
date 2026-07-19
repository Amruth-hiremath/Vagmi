from app.agents.base import AgentSpec

SPEC = AgentSpec(
    name="diagram",
    label="Diagram",
    description="Translate the request or source content into a clear Mermaid flowchart or sequence diagram.",
    system_prompt="Think visually and keep the output diagram-friendly. Prefer Mermaid when structure matters.",
    answer_style="diagram-first, compact explanation, Mermaid-friendly",
    max_tokens=1024,
    temperature=0.2,
    top_p=0.9,
    repeat_penalty=1.08,
    artifact_type="mermaid",
    artifact_title="Mermaid Draft",
    reply_prefix="Diagram",
)
