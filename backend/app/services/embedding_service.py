from pathlib import Path

from sentence_transformers import SentenceTransformer

from app.core.config import EMBEDDING_MODEL_CANDIDATES
from app.core.config import OFFLINE_MODELS_DIR
from app.core.config import LOCAL_MODELS_DIR
from app.core.config import DATA_DIR
from app.core.logging_config import logger


class EmbeddingService:
    def __init__(self):
        self.model = self._load_model()

    @staticmethod
    def _is_sentence_transformers_dir(path: Path) -> bool:
        return (
            path.is_dir()
            and (
                (path / "modules.json").exists()
                or (path / "config_sentence_transformers.json").exists()
                or any(path.glob("0_*"))
            )
        )

    def _load_model(self) -> SentenceTransformer:
        candidates = []
        for candidate in EMBEDDING_MODEL_CANDIDATES:
            if candidate:
                candidates.append(Path(candidate))

        # Search direct candidates first, then common nested model layouts.
        nested_roots = [LOCAL_MODELS_DIR, OFFLINE_MODELS_DIR, DATA_DIR / "models"]
        for root in nested_roots:
            if not root.exists():
                continue
            candidates.extend([p for p in root.glob("**/all-MiniLM-L6-v2") if p.is_dir()])
            candidates.extend([p for p in root.glob("**/sentence-transformers/all-MiniLM-L6-v2") if p.is_dir()])
            candidates.extend([p for p in root.glob("**/all-MiniLM-L6-v2/") if p.is_dir()])

        seen = set()
        for path in candidates:
            if not path:
                continue
            resolved = str(path.resolve()) if path.exists() else str(path)
            if resolved in seen:
                continue
            seen.add(resolved)
            if path.exists() and self._is_sentence_transformers_dir(path):
                logger.info("Loading embedding model from local path: %s", path)
                return SentenceTransformer(str(path), local_files_only=True)

        raise RuntimeError(
            "Offline embedding model not found. Place a full all-MiniLM-L6-v2 sentence-transformers directory under local_models/, offline_models/, or data/models/ and set EMBEDDING_MODEL_PATH if needed."
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
