# app/core/dependencies.py
from app.services.document_processor import DocumentProcessor
from app.services.chunking_service import ChunkingService
from app.services.embedding_service import EmbeddingService
from app.services.vector_store_service import VectorStoreService
from app.services.bm25_service import BM25Service
from app.services.hybrid_retrieval_service import HybridRetrievalService

# Instantiate as singletons so the AI model stays in RAM
doc_processor = DocumentProcessor()
chunking_service = ChunkingService()
embedding_service = EmbeddingService()
vector_store = VectorStoreService()
bm25_store = BM25Service()
hybrid_retriever = HybridRetrievalService()

def get_rag_services():
    return {
        "processor": doc_processor,
        "chunker": chunking_service,
        "embedder": embedding_service,
        "vector": vector_store,
        "bm25": bm25_store,
        "hybrid": hybrid_retriever
    }