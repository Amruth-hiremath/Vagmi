from app.services.embedding_service import (
    EmbeddingService
)

from app.services.vector_store_service import (
    VectorStoreService
)


class RetrievalService:

    def __init__(
        self,
        embedding_service: EmbeddingService,
        vector_store_service: VectorStoreService
    ):

        self.embedding_service = (
            embedding_service
        )

        self.vector_store_service = (
            vector_store_service
        )

    def search(
        self,
        query: str,
        user_id: int,
        top_k: int = 5
    ) -> list[dict]:

        query_embedding = (
            self.embedding_service
            .embed_texts(
                [query]
            )[0]
        )

        results = (
            self.vector_store_service
            .search(
                query_embedding=query_embedding,
                owner_id=user_id,
                top_k=top_k
            )
        )

        return results