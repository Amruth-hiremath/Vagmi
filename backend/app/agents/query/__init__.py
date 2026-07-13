from app.agents.base import AgentSpec

SPEC = AgentSpec(
    name="query",
    label="Query",
    description="Answer user questions directly from the selected documents and recent conversation.",
    system_prompt="Be direct, grounded, and helpful. Prefer concise explanations with concrete details.",
    answer_style="direct answer, moderate detail, grounded in sources",
    max_tokens=448,
    temperature=0.25,
    top_p=0.9,
    repeat_penalty=1.08,
    artifact_type=None,
    artifact_title=None,
    reply_prefix="Answer",
)
