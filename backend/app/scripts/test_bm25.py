from app.services.bm25_service import BM25Service


chunks = [
    "Artificial intelligence is transforming healthcare",
    "Machine learning uses training data to build predictive models",
    "Databases store structured information efficiently",
    "Cybersecurity protects systems from unauthorized access",
    "Neural networks are widely used in deep learning",
    "FastAPI is a modern Python web framework",
    "SQLite is a lightweight relational database",
    "Document retrieval systems use indexing techniques",
    "Natural language processing helps computers understand text",
    "Vector databases enable semantic search capabilities",
    "Hybrid retrieval combines keyword and vector search",
    "ChromaDB is commonly used for storing embeddings",
    "DRDO develops advanced defense technologies",
    "Mermaid diagrams can visualize system architecture",
    "PDF files require text extraction before indexing",
    "DOCX documents contain structured textual information",
    "BM25 is a popular keyword ranking algorithm",
    "Embeddings capture semantic meaning of text",
    "Secure office environments often operate offline",
    "Retrieval augmented generation improves answer quality"
]


queries = [
    "machine learning",
    "database",
    "healthcare",
    "cybersecurity",
    "embeddings",
    "BM25",
    "offline office",
    "document retrieval"
]


bm25 = BM25Service()

print("=" * 60)
print("BUILDING BM25 INDEX")
print("=" * 60)

bm25.build_index(chunks)

print(f"Indexed {len(chunks)} chunks")

for query in queries:

    print("\n" + "=" * 60)
    print(f"QUERY: {query}")
    print("=" * 60)

    results = bm25.search(
        query=query,
        top_k=3
    )

    for rank, result in enumerate(
        results,
        start=1
    ):
        print(
            f"\nRank #{rank}"
        )

        print(
            f"Score: {result['score']:.4f}"
        )

        print(
            f"Chunk: {result['chunk_text']}"
        )

print("\n")
print("=" * 60)
print("BM25 TEST COMPLETED")
print("=" * 60)