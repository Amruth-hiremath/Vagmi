from sentence_transformers import (
    SentenceTransformer
)
from app.core.config import BASE_DIR

class EmbeddingService:

    def __init__(self):
        self.model = SentenceTransformer("all-MiniLM-L6-v2")

    def embed_texts(
        self,
        texts: list[str]
    ) -> list[list[float]]:

        embeddings = (
            self.model.encode(
                texts,
                convert_to_numpy=True,
                normalize_embeddings=True
            )
        )

        return embeddings.tolist()

    def embed_chunks(
        self,
        chunks: list[str]
    ) -> list[list[float]]:

        return self.embed_texts(
            chunks
        )

    def embed_query(
        self,
        query: str
    ) -> list[float]:

        embedding = (
            self.model.encode(
                query,
                convert_to_numpy=True,
                normalize_embeddings=True
            )
        )

        return embedding.tolist()