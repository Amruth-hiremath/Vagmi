from __future__ import annotations

from app.agents.base import AgentSpec, normalize_agent_name
from app.agents.diagram_generation import SPEC as DIAGRAM_SPEC
from app.agents.document_generation import SPEC as DOCUMENT_SPEC
from app.agents.master import SPEC as MASTER_SPEC
from app.agents.query import SPEC as QUERY_SPEC
from app.agents.summary import SPEC as SUMMARY_SPEC

AGENT_SPECS: dict[str, AgentSpec] = {
    MASTER_SPEC.name: MASTER_SPEC,
    QUERY_SPEC.name: QUERY_SPEC,
    SUMMARY_SPEC.name: SUMMARY_SPEC,
    DIAGRAM_SPEC.name: DIAGRAM_SPEC,
    DOCUMENT_SPEC.name: DOCUMENT_SPEC,
}


def get_agent_spec(name: str | None) -> AgentSpec:
    return AGENT_SPECS[normalize_agent_name(name)]


def all_agent_specs() -> tuple[AgentSpec, ...]:
    return tuple(AGENT_SPECS.values())


__all__ = ["AgentSpec", "AGENT_SPECS", "get_agent_spec", "all_agent_specs", "normalize_agent_name"]
