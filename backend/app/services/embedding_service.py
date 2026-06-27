from pathlib import Path

from sentence_transformers import SentenceTransformer

from app.core.config import EMBEDDING_MODEL_CANDIDATES
from app.core.logging_config import logger


class EmbeddingService:
    def __init__(self):
        self.model = self._load_model()

    def _load_model(self) -> SentenceTransformer:
        for candidate in EMBEDDING_MODEL_CANDIDATES:
            if not candidate:
                continue

            path = Path(candidate)
            if path.exists():
                logger.info("Loading embedding model from local path: %s", path)
                return SentenceTransformer(str(path))

        raise RuntimeError(
            "Offline embedding model not found. Place all-MiniLM-L6-v2 under "
            "local_models/, offline_models/, or data/models/ and set EMBEDDING_MODEL_PATH if needed."
        )

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        embeddings = self.model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=True
        )
        return embeddings.tolist()

    def embed_chunks(self, chunks: list[str]) -> list[list[float]]:
        return self.embed_texts(chunks)

    def embed_query(self, query: str) -> list[float]:
        embedding = self.model.encode(
            query,
            convert_to_numpy=True,
            normalize_embeddings=True
        )
        return embedding.tolist()
