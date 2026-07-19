from app.agents.base import AgentSpec

SPEC = AgentSpec(
    name="document",
    label="Document",
    description="Draft a polished office document with headings, sections, and readable prose.",
    system_prompt="Write like a careful document drafter. Make it polished, structured, and ready to edit.",
    answer_style="long-form markdown document, polished and structured",
    max_tokens=2048,
    temperature=0.35,
    top_p=0.92,
    repeat_penalty=1.1,
    artifact_type="document",
    artifact_title="Document Draft",
    reply_prefix="Document",
)
