from __future__ import annotations

from dataclasses import dataclass, field

MANUAL_MODE = "manual"
AUTO_MODE = "auto"

# Keyword bank used for lightweight, fully-offline intent classification.
# Longer/more specific phrases are checked first so "flow chart" wins over
# a bare "chart" style token.
AGENT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "summary": (
        "summary", "summarize", "summarise", "recap", "brief", "tl;dr",
        "tldr", "key points", "condense", "shorten", "overview",
    ),
    "diagram": (
        "diagram", "mermaid", "flowchart", "flow chart", "workflow",
        "sequence diagram", "architecture diagram", "visualize", "map out",
        "chart the", "draw a",
    ),
    "document": (
        "report", "draft", "document", "write up", "proposal", "memo",
        "compose", "letter", "spec", "specification", "write a",
    ),
    "query": (
        "query", "ask", "find", "look up", "lookup", "what", "who",
        "where", "when", "why", "how", "explain", "define", "search for",
    ),
}

AGENT_LABELS: dict[str, str] = {
    "master": "Master",
    "query": "Query",
    "summary": "Summary",
    "diagram": "Diagram",
    "document": "Document",
}

MANUAL_AGENTS = {"query", "summary", "diagram", "document"}

# Base confidence per agent when exactly one specialist matches. Kept
# distinct so the "reason" trail stays legible when debugging routing.
_BASE_CONFIDENCE = {
    "summary": 0.92,
    "diagram": 0.90,
    "document": 0.88,
    "query": 0.84,
}

_CLARIFICATION_FLOOR = 0.55
_MIXED_INTENT_CAP = 0.72


@dataclass(frozen=True)
class RoutingDecision:
    routed_agent: str
    confidence: float
    needs_clarification: bool
    routing_mode: str
    reason: str
    suggestions: tuple[str, ...] = field(default_factory=tuple)
    matched_keywords: tuple[str, ...] = field(default_factory=tuple)

    def suggestion_labels(self) -> list[str]:
        return [AGENT_LABELS.get(agent, agent.title()) for agent in self.suggestions]


def normalize_mode(value: str | None) -> str:
    mode = (value or MANUAL_MODE).strip().lower()
    return AUTO_MODE if mode == AUTO_MODE else MANUAL_MODE


def normalize_agent(value: str | None) -> str:
    agent = (value or "query").strip().lower()
    return agent if agent in {"master", *MANUAL_AGENTS} else "query"


def normalize_manual_agent(value: str | None) -> str:
    agent = normalize_agent(value)
    return agent if agent in MANUAL_AGENTS else "query"


def _find_matches(text: str) -> list[tuple[str, float, str]]:
    matches: list[tuple[str, float, str]] = []
    for agent, keywords in AGENT_KEYWORDS.items():
        for keyword in sorted(keywords, key=len, reverse=True):
            if keyword in text:
                matches.append((agent, _BASE_CONFIDENCE.get(agent, 0.8), keyword))
                break
    return matches


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

    if not text:
        return RoutingDecision(
            routed_agent="master",
            confidence=0.0,
            needs_clarification=True,
            routing_mode=mode,
            reason="empty_prompt",
            suggestions=tuple(sorted(MANUAL_AGENTS)),
        )

    matches = _find_matches(text)

    if not matches:
        return RoutingDecision(
            routed_agent="master",
            confidence=0.52,
            needs_clarification=True,
            routing_mode=mode,
            reason="unclear_intent",
            suggestions=tuple(sorted(MANUAL_AGENTS)),
        )

    unique_agents = {agent for agent, _, _ in matches}
    if len(unique_agents) > 1:
        best_agent, confidence, _keyword = max(matches, key=lambda item: item[1])
        capped = min(confidence, _MIXED_INTENT_CAP)
        return RoutingDecision(
            routed_agent=best_agent,
            confidence=capped,
            needs_clarification=capped < _CLARIFICATION_FLOOR + 0.15,
            routing_mode=mode,
            reason="mixed_intent",
            suggestions=tuple(sorted(unique_agents)),
            matched_keywords=tuple(sorted({kw for _, _, kw in matches})),
        )

    routed_agent, confidence, keyword = matches[0]
    return RoutingDecision(
        routed_agent=routed_agent,
        confidence=confidence,
        needs_clarification=confidence < _CLARIFICATION_FLOOR,
        routing_mode=mode,
        reason="keyword_match",
        matched_keywords=(keyword,),
    )