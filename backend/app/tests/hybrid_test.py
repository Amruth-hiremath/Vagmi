from app.services.hybrid_retrieval_service import (
    HybridRetrievalService
)

service = HybridRetrievalService()

bm25_results = [
    {
        "document_id": 1,
        "chunk_text": "Embeddings capture semantic meaning",
        "score": 8.0
    },
    {
        "document_id": 1,
        "chunk_text": "Databases store information",
        "score": 4.0
    }
]

vector_results = [
    {
        "document_id": 1,
        "chunk_text": "Embeddings capture semantic meaning",
        "score": 0.08
    },
    {
        "document_id": 1,
        "chunk_text": "ChromaDB stores vectors",
        "score": 0.06
    }
]

results = service.combine_results(
    bm25_results,
    vector_results
)

for result in results:
    print(result)