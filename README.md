# Vāgmi

**Offline Multi-Agent Intelligence Platform for Secure Work Environments**

Vāgmi is a fully offline, LAN-deployable intelligence platform designed for secure workplaces where internet connectivity, cloud services, and external APIs are unavailable or restricted.

The platform combines document intelligence, AI-assisted knowledge retrieval, document generation, diagram generation, and team collaboration into a single self-hosted system.

Originally designed for deployment within air-gapped environments, Vāgmi prioritizes privacy, local processing, user isolation, and operational simplicity while providing a modern AI-assisted workflow experience.

---

## Overview

Organizations operating in secure environments often face a common challenge:

* Documents are scattered across multiple formats.
* Knowledge remains siloed within teams.
* Existing AI solutions depend on cloud services.
* Collaboration tools require internet connectivity.
* Generating reports, summaries, and diagrams is repetitive and time-consuming.

Vāgmi addresses these challenges through a centralized offline intelligence platform that runs entirely on local infrastructure.

Users can upload documents, search organizational knowledge, generate reports, create Mermaid diagrams, communicate with teammates, exchange files, and access AI-assisted workflows without any external network dependency.

---

## Core Capabilities

### Document Intelligence

* PDF ingestion
* DOCX ingestion
* Markdown ingestion
* Local document indexing
* Hybrid semantic and keyword retrieval
* Natural-language querying
* Context-aware answers with source references

### AI-Assisted Knowledge Retrieval

* Retrieval-Augmented Generation (RAG)
* Local embedding generation
* Local vector storage
* Hybrid BM25 + semantic search
* Fully offline inference

### Multi-Agent Workflow Engine

* Master Agent
* Query Agent
* Summary Agent
* Document Generation Agent
* Diagram Generation Agent

The agent architecture is intentionally lightweight and task-focused to ensure reliability and maintainability.

### Document Generation

Generate:

* Reports
* Proposals
* Meeting Notes
* Technical Documentation
* Standard Operating Procedures
* Project Summaries

Export formats:

* Markdown
* DOCX
* PDF

### Mermaid Diagram Generation

Generate Mermaid-based:

* Flowcharts
* Process Diagrams
* Architecture Diagrams
* Workflow Diagrams

Designed for environments where visual documentation is critical.

### Collaboration

* Direct messaging
* Group chats
* File attachments
* Team discussion rooms
* Persistent message history

All collaboration occurs entirely within the local network.

### Per-User Data Isolation

Every user receives a private workspace containing:

* Documents
* Attachments
* Generated artifacts
* Query history

This ensures clean separation between users while maintaining centralized management.

---

## System Architecture

```text
Clients
│
├── Desktop Application (PySide6)
├── Web Interface (FastAPI + Jinja2)
│
▼

FastAPI Server
│
├── Authentication
├── Document Management
├── Chat & File Transfer
├── Group Management
├── Retrieval Engine
├── Export Engine
│
├── Master Agent
├── Query Agent
├── Summary Agent
├── Document Generation Agent
└── Diagram Generation Agent
│
▼

Storage Layer
│
├── SQLite
├── ChromaDB
├── Per-User Storage
└── Artifact Store
│
▼

Ollama
│
└── Qwen2.5
```

---

## Technology Stack

### Backend

* FastAPI
* Python
* SQLite
* ChromaDB

### AI

* Ollama
* Qwen2.5
* all-MiniLM-L6-v2
* LangGraph

### Document Processing

* pdfplumber
* python-docx
* rank_bm25

### Clients

* PySide6 Desktop Application
* FastAPI + Jinja2 Web Interface

### Exports

* Markdown
* DOCX
* PDF
* Mermaid

---

## Design Principles

### Offline First

The system must operate completely without internet access.

### Local Ownership

All documents, embeddings, chats, and generated artifacts remain on local infrastructure.

### Simplicity Over Complexity

The platform prioritizes practical deployment and maintainability over unnecessary architectural complexity.

### Secure by Default

User isolation, local authentication, and LAN-only deployment are fundamental design requirements.

### AI as an Assistant

Vāgmi augments human workflows rather than replacing human decision-making.

---

## Project Status

Current Stage:

**Active Development**

Planned MVP Features:

* User Authentication
* Per-User Document Storage
* Document Upload & Management
* Chat & File Transfer
* Hybrid Retrieval Pipeline
* AI Querying
* Document Generation
* Mermaid Generation
* Markdown / DOCX / PDF Export

---

## Future Scope

Potential future enhancements include:

* Traceability Analysis
* Workflow Automation
* Multi-document Comparison
* Local Knowledge Graphs
* Advanced Diagram Rendering
* Enterprise Integration Connectors

---

## License

This repository is currently under development as part of an academic and research internship project.

License information will be finalized upon project completion.
