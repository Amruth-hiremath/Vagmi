<p align="center">
  <img src="desktop/web/assets/logo_dark_full.png" width="140" alt="Vagmi Logo">
</p>

<p align="center">
  <strong>Offline Multi-Agent Intelligence Platform</strong><br>
  <em>Built for Secure & Air-Gapped Work Environments</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Offline%20First-F97316?style=for-the-badge">
  <img src="https://img.shields.io/badge/Air--Gapped-1D4ED8?style=for-the-badge">
  <img src="https://img.shields.io/badge/Hybrid%20RAG-8B5CF6?style=for-the-badge">
  <img src="https://img.shields.io/badge/Multi--Agent-4F46E5?style=for-the-badge">
  <img src="https://img.shields.io/badge/Secure%20Collaboration-059669?style=for-the-badge">
</p>

---

<h1 align="center">Vāgmi</h1>

**Offline Multi-Agent Intelligence Platform for Secure Work Environments**

Vāgmi is a fully offline, LAN-deployable intelligence platform designed for secure workplaces where internet connectivity, cloud services, and external APIs are unavailable or restricted.

The platform combines document intelligence, AI-assisted knowledge retrieval, team collaboration, and (in upcoming phases) document/diagram generation into a single self-hosted system.

Originally designed for deployment within air-gapped environments such as DRDO facilities, Vāgmi prioritizes privacy, local processing, user isolation, and operational simplicity while providing a modern AI-assisted workflow experience.

---

## Overview

Organizations operating in secure environments often face a common challenge:

* Documents are scattered across multiple formats.
* Knowledge remains siloed within teams.
* Existing AI solutions depend on cloud services.
* Collaboration tools require internet connectivity.
* Generating reports, summaries, and diagrams is repetitive and time-consuming.

Vāgmi addresses these challenges through a centralized offline intelligence platform that runs entirely on local infrastructure. Users can upload documents, search organizational knowledge using hybrid AI retrieval, and communicate with teammates through rooms and direct messages — all without any external network dependency.

---

## Current Status

**Stage: Active Development — Backend Core + Retrieval Stack Complete**

The backend (FastAPI) currently has two major systems fully implemented and wired together end-to-end: **user/collaboration management** and the **offline RAG retrieval stack**. The multi-agent layer (Master, Query, Summary, Document Generation, Diagram Generation) is scaffolded but not yet implemented.

### Implemented

| Area | What works |
|---|---|
| **Authentication** | Registration, login (JWT), `/auth/me`, per-user workspace creation on signup |
| **Documents** | Upload (`.pdf`, `.docx`, `.txt`), automatic background indexing into the RAG pipeline, document listing, status tracking (`processing` → `indexed` / `failed_indexing`) |
| **Retrieval** | `/retrieval/search` — hybrid semantic + keyword search scoped to the requesting user's documents |
| **Collaboration** | Rooms (create/list/get/delete), room membership management, room messages (text + image), direct messages (1:1 conversations, text + image), file attachments (upload/download), user search |
| **Offline AI** | Local embedding model (`all-MiniLM-L6-v2`) — no internet required after first download |
| **System** | Health check endpoint, offline-hosted Swagger UI (`/docs` served from local static assets, not the internet) |

### Scaffolded, not yet implemented

* Master Agent, Query Agent, Summary Agent, Document Generation Agent, Diagram Generation Agent (empty packages exist under `app/agents/`)
* LLM integration (Ollama / Qwen2.5)
* Document generation & export (Markdown / DOCX / PDF reports, proposals, SOPs)
* Mermaid diagram generation
* Desktop client (PySide6) and web frontend

---

## Retrieval Stack (Week 3 Deliverable)

The retrieval layer was built in two parallel tracks and merged into a single hybrid pipeline that now runs automatically whenever a document is uploaded.

```
Document (.txt / .pdf / .docx)
        ↓
Text Extraction        (document_processor.py — PyMuPDF, python-docx)
        ↓
Chunking                (chunking_service.py — sliding window, overlap-preserving)
        ↓
Embeddings              (embedding_service.py — all-MiniLM-L6-v2, 384-dim, offline)
        ↓
ChromaDB                (vector_store_service.py — persistent, per-owner metadata)
        ↓                                    ↘
Vector Retrieval                          BM25 Retrieval
(retrieval_service.py)                    (bm25_service.py + indexing_service.py)
        ↓                                    ↙
            Hybrid Fusion & Re-ranking
            (hybrid_retrieval_service.py)
                        ↓
                Final Ranked Chunks
```

**Hybrid scoring formula** (scores normalized via `score / max_score` before fusion):

```
final_score = 0.4 × BM25_score + 0.6 × Vector_score
```

**Production defaults** (set in `documents.py` on upload): `chunk_size=500`, `overlap=100`.

**Team split during this phase:**

| Owner | Responsibilities |
|---|---|
| Amruthesh | Document extraction, chunking, embeddings, ChromaDB, vector retrieval, integration branch |
| Srujan | BM25 indexing, keyword retrieval, hybrid fusion, ranking layer |

**Notable fixes during integration:**
* Resolved a `requirements-lock.txt` merge conflict (added `chromadb`, `sentence-transformers`, `rank-bm25`, `exceptiongroup`).
* Standardized the ChromaDB output contract from raw `{"documents": [...], "distances": [...]}` arrays to a consistent list of `{"document_id", "chunk_text", "score"}` objects, fixing a `TypeError: list indices must be integers or slices, not str`.
* Verified the embedding model runs fully offline with no internet required after the first local download — required for air-gapped deployment.

---

## API Reference

All routes (except `/`, `/health`, `/auth/register`, `/auth/login`) require a bearer token obtained from `/auth/login`.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/register` | Create a new user and provision their workspace |
| POST | `/auth/login` | Authenticate and receive a JWT access token |
| GET | `/auth/me` | Get the current authenticated user |
| POST | `/documents/upload` | Upload a document; triggers extraction → chunking → embedding → ChromaDB + BM25 indexing |
| GET | `/documents` | List the current user's documents and their indexing status |
| POST | `/retrieval/search` | Hybrid search (vector + BM25) over the current user's indexed documents |
| POST | `/rooms` | Create a room |
| GET | `/rooms` | List rooms the user belongs to |
| GET | `/rooms/{room_id}` | Get room details |
| DELETE | `/rooms/{room_id}` | Delete a room |
| POST | `/rooms/{room_id}/members` | Add a member to a room |
| GET | `/rooms/{room_id}/members` | List room members |
| DELETE | `/rooms/{room_id}/members/{user_id}` | Remove a member |
| POST | `/rooms/{room_id}/messages` | Send a text message in a room |
| POST | `/rooms/{room_id}/messages/image` | Send an image message in a room |
| GET | `/rooms/{room_id}/messages` | Get room message history |
| POST | `/dm` | Start a direct conversation |
| GET | `/dm` | List the user's direct conversations |
| POST | `/dm/{conversation_id}/messages` | Send a direct message |
| POST | `/dm/{conversation_id}/messages/image` | Send an image direct message |
| GET | `/dm/{conversation_id}/messages` | Get direct message history |
| POST | `/attachments` | Upload a file attachment |
| GET | `/attachments/{attachment_id}` | Download an attachment |
| GET | `/users/search?query=` | Search for other users by username |
| GET | `/health` | Health check |
| GET | `/docs` | Offline-hosted Swagger UI |

Interactive, locally-served API documentation is available at `/docs` once the server is running — it loads its JS/CSS from local static assets rather than a CDN, keeping it usable in air-gapped environments.

---

## System Architecture

### Implemented today

```text
Client (HTTP / Swagger UI)
        │
        ▼
FastAPI Server
├── Authentication (JWT)
├── Document Management + Background RAG Indexing
├── Retrieval Engine (Hybrid Search)
├── Rooms, Messages, Direct Messages
├── Attachments
└── User Search
        │
        ▼
Storage Layer
├── SQLite (users, documents, rooms, messages, attachments)
├── ChromaDB (vector store, per-user metadata filtering)
├── In-memory BM25 index (per-user)
└── Per-user file storage (documents, attachments, workspace)
```

### Target architecture (per project vision)

```text
Clients
│
├── Desktop Application (PySide6)        — planned
├── Web Interface (FastAPI + Jinja2)     — planned
▼
FastAPI Server
│
├── Authentication                        ✅
├── Document Management                   ✅
├── Chat & File Transfer                  ✅
├── Group Management                      ✅
├── Retrieval Engine                      ✅
├── Export Engine                         — planned
│
├── Master Agent                          — planned
├── Query Agent                           — planned
├── Summary Agent                         — planned
├── Document Generation Agent             — planned
└── Diagram Generation Agent              — planned
│
▼
Storage Layer
│
├── SQLite                                ✅
├── ChromaDB                              ✅
├── Per-User Storage                      ✅
└── Artifact Store                        — planned
│
▼
Ollama (Qwen2.5)                          — planned
```

---

## Technology Stack

### Backend (implemented)

* FastAPI
* SQLAlchemy + SQLite (`aiosqlite`)
* Pydantic / pydantic-settings
* `python-jose` + `passlib`/`bcrypt` for JWT auth
* `python-multipart` for file uploads

### Retrieval / AI (implemented)

* ChromaDB (persistent vector store)
* `sentence-transformers` — `all-MiniLM-L6-v2` (384-dim, fully offline)
* `rank-bm25` — keyword retrieval
* PyMuPDF (`fitz`) — PDF extraction
* `python-docx` — DOCX extraction

### Planned

* Ollama + Qwen2.5 (local LLM inference)
* LangGraph (agent orchestration)
* PySide6 desktop client
* Jinja2-based web interface
* Markdown / DOCX / PDF export engine
* Mermaid diagram generation

---

## Project Structure

```text
backend/
├── requirements.txt
├── requirements-lock.txt        # full pinned dependency set, incl. RAG stack
└── app/
    ├── main.py                  # app factory, router registration, offline Swagger
    ├── api/                     # auth, documents, retrieval, rooms, messages,
    │                             # direct_messages, attachments, users, system
    ├── core/                    # config, constants, database, security, dependencies
    ├── models/                  # SQLAlchemy models (User, Document, Room, Message, ...)
    ├── schemas/                 # Pydantic request/response models
    ├── services/                # document_processor, chunking, embedding,
    │                             # vector_store, retrieval, indexing, bm25,
    │                             # hybrid_retrieval, message/room/storage/attachment
    ├── agents/                  # master, query, summary, document_generation,
    │                             # diagram_generation — scaffolded, not yet implemented
    ├── scripts/                 # manual test scripts (extraction, chunking,
    │                             # embeddings, chromadb, retrieval, e2e)
    └── tests/                   # test_bm25.py, hybrid_test.py
```

---

## Getting Started

```bash
cd backend

# install the full, pinned dependency set (includes ChromaDB, sentence-transformers, rank-bm25)
pip install -r requirements-lock.txt

# run the server
uvicorn app.main:app --reload
```

The server creates its SQLite tables automatically on startup. Visit `http://localhost:8000/docs` for the offline-hosted Swagger UI, or `http://localhost:8000/health` to confirm the service is running.

### Manual / verification scripts

```bash
python -m app.scripts.test_extraction   # document extraction
python -m app.scripts.test_chunking     # chunking behavior
python -m app.scripts.test_embeddings   # embedding generation
python -m app.scripts.test_chromadb     # vector store
python -m app.scripts.test_retrieval    # vector retrieval
python -m app.scripts.test_e2e          # full pipeline, end to end
python -m app.tests.test_bm25           # BM25 keyword search
python -m app.tests.hybrid_test         # hybrid fusion + re-ranking
```

---

## Design Principles

### Offline First
The system must operate completely without internet access.

### Local Ownership
All documents, embeddings, chats, and generated artifacts remain on local infrastructure.

### Simplicity Over Complexity
The platform prioritizes practical deployment and maintainability over unnecessary architectural complexity.

### Secure by Default
User isolation (per-owner document and vector filtering), local JWT authentication, and LAN-only deployment are fundamental design requirements.

### AI as an Assistant
Vāgmi augments human workflows rather than replacing human decision-making.

---

## Roadmap

* [ ] Wire Master / Query / Summary agents to a local Ollama + Qwen2.5 backend
* [ ] Document generation agent + Markdown/DOCX/PDF export engine
* [ ] Mermaid diagram generation agent
* [ ] Word-boundary-aware chunking (current chunking is character-based)
* [ ] PySide6 desktop client
* [ ] Jinja2 web interface
* [ ] Traceability analysis, multi-document comparison, local knowledge graphs
