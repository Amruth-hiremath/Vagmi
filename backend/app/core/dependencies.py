from app.services.document_processor import DocumentProcessor
from app.services.chunking_service import ChunkingService
from app.services.embedding_service import EmbeddingService
from app.services.vector_store_service import VectorStoreService
from app.services.bm25_service import BM25Service
from app.services.retrieval_service import RetrievalService
from app.services.hybrid_retrieval_service import HybridRetrievalService


# Singleton services
doc_processor = DocumentProcessor()

chunking_service = ChunkingService()

embedding_service = EmbeddingService()

vector_store = VectorStoreService()

bm25_store = BM25Service()

retrieval_service = RetrievalService(
    embedding_service=embedding_service,
    vector_store_service=vector_store
)

hybrid_retriever = HybridRetrievalService(
    bm25_service=bm25_store,
    retrieval_service=retrieval_service
)


def get_rag_services():
    return {
        "processor": doc_processor,
        "chunker": chunking_service,
        "embedder": embedding_service,
        "vector": vector_store,
        "bm25": bm25_store,
        "retrieval": retrieval_service,
        "hybrid": hybrid_retriever
    }