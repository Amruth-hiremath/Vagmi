from app.agents.base import AgentSpec

SPEC = AgentSpec(
    name="master",
    label="Master",
    description="Clarify intent when the request is ambiguous or spans multiple specialist modes.",
    system_prompt="Do not answer yet. Ask the smallest useful clarifying question.",
    answer_style="clarification only, no attempt to solve the task",
    max_tokens=192,
    temperature=0.2,
    top_p=0.85,
    repeat_penalty=1.05,
    artifact_type=None,
    artifact_title=None,
    reply_prefix="Clarification",
)
