from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat(sep=" ", timespec="seconds")


def _table_columns(connection, table_name: str) -> set[str]:
    inspector = inspect(connection)
    if not inspector.has_table(table_name):
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def _create_ai_sessions_new(connection) -> None:
    connection.exec_driver_sql(
        """
        CREATE TABLE ai_sessions_new (
            id INTEGER PRIMARY KEY,
            owner_id INTEGER NOT NULL,
            title VARCHAR NOT NULL,
            routing_mode VARCHAR NOT NULL DEFAULT 'manual',
            selected_agent VARCHAR NOT NULL DEFAULT 'master',
            status VARCHAR NOT NULL DEFAULT 'idle',
            last_prompt TEXT,
            created_at DATETIME,
            updated_at DATETIME,
            last_used_at DATETIME,
            FOREIGN KEY(owner_id) REFERENCES users(id)
        )
        """
    )


def _migrate_ai_sessions(connection) -> None:
    columns = _table_columns(connection, "ai_sessions")
    desired = {"title", "routing_mode", "selected_agent", "status", "last_prompt", "last_used_at"}

    if not columns:
        return

    legacy = {"name", "mode", "agent", "is_archived", "last_run_at"}
    if desired.issubset(columns):
        return

    # Preserve existing data by rebuilding the table with the newer schema.
    _create_ai_sessions_new(connection)
    select_name = "title" if "title" in columns else "name" if "name" in columns else None
    select_mode = "routing_mode" if "routing_mode" in columns else "mode" if "mode" in columns else None
    select_agent = "selected_agent" if "selected_agent" in columns else "agent" if "agent" in columns else None
    select_status = "status" if "status" in columns else None
    select_last_prompt = "last_prompt" if "last_prompt" in columns else None
    select_created = "created_at" if "created_at" in columns else None
    select_updated = "updated_at" if "updated_at" in columns else None
    select_last_used = "last_used_at" if "last_used_at" in columns else "last_run_at" if "last_run_at" in columns else None
    select_is_archived = "is_archived" if "is_archived" in columns else None

    column_parts = [
        "id",
        "owner_id",
        f"COALESCE({select_name}, 'Session ' || id)" if select_name else "'Session ' || id",
        f"COALESCE({select_mode}, 'manual')" if select_mode else "'manual'",
        f"COALESCE({select_agent}, 'master')" if select_agent else "'master'",
    ]

    if select_status:
        status_expr = f"COALESCE({select_status}, CASE WHEN {select_is_archived} = 1 THEN 'archived' ELSE 'idle' END)" if select_is_archived else f"COALESCE({select_status}, 'idle')"
    else:
        status_expr = f"CASE WHEN {select_is_archived} = 1 THEN 'archived' ELSE 'idle' END" if select_is_archived else "'idle'"
    column_parts.append(status_expr)

    column_parts.append(f"{select_last_prompt}" if select_last_prompt else "NULL")
    column_parts.append(f"{select_created}" if select_created else f"'{_utcnow_iso()}'")
    column_parts.append(f"{select_updated}" if select_updated else f"'{_utcnow_iso()}'")
    column_parts.append(f"{select_last_used}" if select_last_used else "NULL")

    connection.exec_driver_sql(
        f"INSERT INTO ai_sessions_new (id, owner_id, title, routing_mode, selected_agent, status, last_prompt, created_at, updated_at, last_used_at) "
        f"SELECT {', '.join(column_parts)} FROM ai_sessions"
    )
    connection.exec_driver_sql("DROP TABLE ai_sessions")
    connection.exec_driver_sql("ALTER TABLE ai_sessions_new RENAME TO ai_sessions")


def _migrate_ai_session_messages(connection) -> None:
    columns = _table_columns(connection, "ai_session_messages")
    if not columns:
        return

    desired = {"role", "content", "agent_name"}
    if desired.issubset(columns):
        return

    connection.exec_driver_sql(
        """
        CREATE TABLE ai_session_messages_new (
            id INTEGER PRIMARY KEY,
            session_id INTEGER NOT NULL,
            role VARCHAR NOT NULL,
            content TEXT NOT NULL,
            agent_name VARCHAR,
            created_at DATETIME,
            FOREIGN KEY(session_id) REFERENCES ai_sessions(id)
        )
        """
    )
    role_expr = "role" if "role" in columns else "sender_role" if "sender_role" in columns else "'assistant'"
    content_expr = "content" if "content" in columns else "message_text" if "message_text" in columns else "''"
    agent_expr = "agent_name" if "agent_name" in columns else "agent" if "agent" in columns else "NULL"
    created_expr = "created_at" if "created_at" in columns else f"'{_utcnow_iso()}'"
    connection.exec_driver_sql(
        f"INSERT INTO ai_session_messages_new (id, session_id, role, content, agent_name, created_at) "
        f"SELECT id, session_id, {role_expr}, {content_expr}, {agent_expr}, {created_expr} FROM ai_session_messages"
    )
    connection.exec_driver_sql("DROP TABLE ai_session_messages")
    connection.exec_driver_sql("ALTER TABLE ai_session_messages_new RENAME TO ai_session_messages")


def _ensure_simple_table(connection, table_name: str, ddl: str) -> None:
    if not inspect(connection).has_table(table_name):
        connection.exec_driver_sql(ddl)


def ensure_ai_schema(engine: Engine) -> None:
    with engine.begin() as connection:
        _ensure_simple_table(
            connection,
            "ai_sessions",
            """
            CREATE TABLE ai_sessions (
                id INTEGER PRIMARY KEY,
                owner_id INTEGER NOT NULL,
                title VARCHAR NOT NULL,
                routing_mode VARCHAR NOT NULL DEFAULT 'manual',
                selected_agent VARCHAR NOT NULL DEFAULT 'master',
                status VARCHAR NOT NULL DEFAULT 'idle',
                last_prompt TEXT,
                created_at DATETIME,
                updated_at DATETIME,
                last_used_at DATETIME,
                FOREIGN KEY(owner_id) REFERENCES users(id)
            )
            """
        )
        _ensure_simple_table(
            connection,
            "ai_session_documents",
            """
            CREATE TABLE ai_session_documents (
                id INTEGER PRIMARY KEY,
                session_id INTEGER NOT NULL,
                document_id INTEGER NOT NULL,
                created_at DATETIME,
                FOREIGN KEY(session_id) REFERENCES ai_sessions(id),
                FOREIGN KEY(document_id) REFERENCES documents(id)
            )
            """
        )
        _ensure_simple_table(
            connection,
            "ai_session_messages",
            """
            CREATE TABLE ai_session_messages (
                id INTEGER PRIMARY KEY,
                session_id INTEGER NOT NULL,
                role VARCHAR NOT NULL,
                content TEXT NOT NULL,
                agent_name VARCHAR,
                created_at DATETIME,
                FOREIGN KEY(session_id) REFERENCES ai_sessions(id)
            )
            """
        )
        _ensure_simple_table(
            connection,
            "ai_session_artifacts",
            """
            CREATE TABLE ai_session_artifacts (
                id INTEGER PRIMARY KEY,
                session_id INTEGER NOT NULL,
                owner_id INTEGER NOT NULL,
                title VARCHAR NOT NULL,
                artifact_type VARCHAR NOT NULL,
                content TEXT,
                file_path VARCHAR,
                created_at DATETIME,
                FOREIGN KEY(session_id) REFERENCES ai_sessions(id),
                FOREIGN KEY(owner_id) REFERENCES users(id)
            )
            """
        )

        _migrate_ai_sessions(connection)
        _migrate_ai_session_messages(connection)
