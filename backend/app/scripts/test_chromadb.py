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

from app.services.vector_store_service import (
    VectorStoreService
)


def main():

    extraction_service = (
        DocumentProcessor()
    )

    chunking_service = (
        ChunkingService()
    )

    embedding_service = (
        EmbeddingService()
    )

    vector_store_service = (
        VectorStoreService()
    )

    document_path = (
        Path(__file__).parent.parent
        / "test_data"
        / "sample_large.txt"
    )

    print(
        "\n1. Extracting text..."
    )

    text = (
        extraction_service.extract_text(
            document_path
        )
    )

    print(
        f"Characters: {len(text)}"
    )

    print(
        "\n2. Chunking..."
    )

    chunks = (
        chunking_service.chunk_text(
            text
        )
    )

    print(
        f"Chunks: {len(chunks)}"
    )

    print(
        "\n3. Generating embeddings..."
    )

    embeddings = (
        embedding_service.embed_texts(
            chunks
        )
    )

    print(
        f"Embeddings: {len(embeddings)}"
    )

    print(
        "\n4. Storing in ChromaDB..."
    )

    vector_store_service.add_chunks(
        document_id=1,
        owner_id=1,
        chunks=chunks,
        embeddings=embeddings
    )

    print(
        "Storage complete."
    )

    print(
        "\n5. Running search..."
    )

    query = (
        "Why are embeddings used?"
    )

    query_embedding = (
        embedding_service.embed_texts(
            [query]
        )[0]
    )

    results = (
        vector_store_service.search(
            query_embedding=
                query_embedding,
            owner_id=1,
            top_k=3
        )
    )

    print(
        "\nSearch Results:\n"
    )

    for index, result in enumerate(
        results,
        start=1
    ):

        print(
            f"Result {index}"
        )

        print(
            f"Score: {result['score']}"
        )

        print(
            result["chunk_text"][:500]
        )

        print(
            "\n" + "-" * 80
        )


if __name__ == "__main__":
    main()