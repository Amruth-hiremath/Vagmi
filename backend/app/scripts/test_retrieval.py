from app.services.embedding_service import (
    EmbeddingService
)

from app.services.vector_store_service import (
    VectorStoreService
)

from app.services.retrieval_service import (
    RetrievalService
)

embedding_service = (
    EmbeddingService()
)

vector_store_service = (
    VectorStoreService()
)

service = (
    RetrievalService(
        embedding_service=embedding_service,
        vector_store_service=vector_store_service
    )
)

results = service.search(
    query="Why are embeddings used?",
    user_id=1,
    top_k=3
)

for result in results:
    print(result)