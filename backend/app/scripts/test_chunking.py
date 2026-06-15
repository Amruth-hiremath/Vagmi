from pathlib import Path

from app.services.document_processor import (
    DocumentProcessor
)

from app.services.chunking_service import (
    ChunkingService
)

processor = DocumentProcessor()
chunker = ChunkingService()

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

print(
    f"Original Text Length: {len(text)}"
)

print(
    f"Chunks Created: {len(chunks)}"
)

for index, chunk in enumerate(
    chunks,
    start=1
):
    print("\n")
    print("=" * 50)
    print(f"Chunk {index}")
    print("=" * 50)
    print(f"Length: {len(chunk)}")
    print(chunk[:200])