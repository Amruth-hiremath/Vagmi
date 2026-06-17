from pathlib import Path

from app.services.document_processor import (
    DocumentProcessor
)

from app.services.chunking_service import (
    ChunkingService
)

from app.services.embedding_service import (
    EmbeddingService
)


processor = DocumentProcessor()
chunker = ChunkingService()
embedder = EmbeddingService()

file_path = (
    Path(__file__).parent.parent
    / "test_data"
    / "sample_large.txt"
)

text = processor.extract_text(
    str(file_path)
)

chunks = chunker.chunk_text(
    text
)

embeddings = embedder.embed_texts(
    chunks
)

print(
    f"Chunks: {len(chunks)}"
)

print(
    f"Embeddings: {len(embeddings)}"
)

print(
    f"Vector Dimension: "
    f"{len(embeddings[0])}"
)