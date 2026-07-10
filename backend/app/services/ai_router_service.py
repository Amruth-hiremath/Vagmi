from __future__ import annotations

from dataclasses import dataclass

MANUAL_MODE = "manual"
AUTO_MODE = "auto"

AGENT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "summary": ("summary", "summarize", "summarise", "recap", "brief"),
    "diagram": ("diagram", "mermaid", "flowchart", "workflow", "map"),
    "document": ("report", "draft", "document", "note", "proposal", "write"),
    "query": ("query", "ask", "find", "look up", "what", "who", "where", "when", "why", "how"),
}


@dataclass(frozen=True)
class RoutingDecision:
    routed_agent: str
    confidence: float
    needs_clarification: bool
    routing_mode: str
    reason: str


def normalize_mode(value: str | None) -> str:
    mode = (value or MANUAL_MODE).strip().lower()
    return AUTO_MODE if mode == AUTO_MODE else MANUAL_MODE


MANUAL_AGENTS = {"query", "summary", "diagram", "document"}


def normalize_agent(value: str | None) -> str:
    agent = (value or "query").strip().lower()
    return agent if agent in {"master", *MANUAL_AGENTS} else "query"


def normalize_manual_agent(value: str | None) -> str:
    agent = normalize_agent(value)
    return agent if agent in MANUAL_AGENTS else "query"


def route_prompt(prompt: str, routing_mode: str | None = None, selected_agent: str | None = None) -> RoutingDecision:
    mode = normalize_mode(routing_mode)
    manual_agent = normalize_manual_agent(selected_agent)
    text = (prompt or "").strip().lower()

    if mode == MANUAL_MODE:
        return RoutingDecision(
            routed_agent=manual_agent,
            confidence=1.0,
            needs_clarification=False,
            routing_mode=mode,
            reason="manual_selection",
        )

    matches: list[tuple[str, float]] = []
    for agent, keywords in AGENT_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            score = 0.92 if agent == "summary" else 0.90 if agent == "diagram" else 0.88 if agent == "document" else 0.84
            matches.append((agent, score))

    if not matches:
        return RoutingDecision(
            routed_agent="master",
            confidence=0.52,
            needs_clarification=True,
            routing_mode=mode,
            reason="unclear_intent",
        )

    if len(matches) > 1:
        best_agent, confidence = max(matches, key=lambda item: item[1])
        return RoutingDecision(
            routed_agent=best_agent,
            confidence=min(confidence, 0.72),
            needs_clarification=True,
            routing_mode=mode,
            reason="mixed_intent",
        )

    routed_agent, confidence = matches[0]
    return RoutingDecision(
        routed_agent=routed_agent,
        confidence=confidence,
        needs_clarification=False,
        routing_mode=mode,
        reason="keyword_match",
    )
