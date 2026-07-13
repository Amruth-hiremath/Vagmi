from app.agents.base import AgentSpec

SPEC = AgentSpec(
    name="summary",
    label="Summary",
    description="Condense the source material into a structured summary with key ideas and takeaways.",
    system_prompt="Summarize clearly and elegantly. Preserve important facts while trimming filler.",
    answer_style="structured summary, a little fuller than query mode, bullet-friendly",
    max_tokens=640,
    temperature=0.3,
    top_p=0.9,
    repeat_penalty=1.09,
    artifact_type="summary",
    artifact_title="Summary Draft",
    reply_prefix="Summary",
)
