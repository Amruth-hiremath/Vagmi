# app/scripts/test_e2e.py
import os
from pathlib import Path

# Import all your Week 3 Services
from app.services.document_processor import DocumentProcessor
from app.services.chunking_service import ChunkingService
from app.services.embedding_service import EmbeddingService
from app.services.vector_store_service import VectorStoreService
from app.services.bm25_service import BM25Service
from app.services.hybrid_retrieval_service import HybridRetrievalService

def run_e2e_test():
    print("=== STARTING VĀGMI E2E PIPELINE TEST ===")
    
    # 1. Initialize Services
    print("\n[1/6] Initializing AI Services (Loading Offline Model)...")
    doc_processor = DocumentProcessor()
    chunker = ChunkingService()
    embedder = EmbeddingService()
    vector_store = VectorStoreService()
    bm25_store = BM25Service()
    hybrid_retriever = HybridRetrievalService()

    # 2. Setup Test Data
    print("[2/6] Setting up test data...")
    test_user_id = 999
    test_doc_id = 1001
    
    # Create a quick dummy text file for testing
    test_file_path = "test_document.txt"
    with open(test_file_path, "w", encoding="utf-8") as f:
        f.write("Vāgmi is a fully offline multi-agent intelligence system designed for secure environments like DRDO. ")
        f.write("It uses a hybrid retrieval pipeline combining ChromaDB and BM25. ")
        f.write("The system runs entirely on the local area network using a Qwen2.5 7B model. ")
        f.write("No internet access is required, making it perfect for air-gapped deployments.")

    # 3. Document Processing & Chunking
    print(f"\n[3/6] Extracting and Chunking Document...")
    raw_text = doc_processor.extract_text(test_file_path)
    chunks = chunker.chunk_text(raw_text, chunk_size=300, overlap=50)
    print(f"      -> Generated {len(chunks)} chunks.")

    # 4. Embedding Generation
    print(f"\n[4/6] Generating Embeddings offline...")
    embeddings = embedder.embed_chunks(chunks)
    print(f"      -> Generated {len(embeddings)} vectors (Dimension: {len(embeddings[0])}).")

    # 5. Storage (ChromaDB & BM25)
    print(f"\n[5/6] Indexing into Vector Store and BM25...")
    
    # Prepare metadata for BM25
    chunk_metadata = [{"document_id": test_doc_id} for _ in chunks]
    
    # Add to both databases
    vector_store.add_chunks(document_id=test_doc_id, owner_id=test_user_id, chunks=chunks, embeddings=embeddings)
    bm25_store.add_chunks(user_id=test_user_id, chunks=chunks, chunk_metadata=chunk_metadata)
    print("      -> Successfully stored in local ChromaDB and isolated BM25 json.")

    # 6. Hybrid Retrieval Query
    test_query = "What environment is Vagmi designed for?"
    print(f"\n[6/6] Executing Hybrid Search for query: '{test_query}'")
    
    # A. Vector Search
    query_embedding = embedder.embed_query(test_query)
    vector_results = vector_store.search(query_embedding=query_embedding, owner_id=test_user_id, top_k=3)
    
    # B. BM25 Search
    bm25_results = bm25_store.search(user_id=test_user_id, query=test_query, top_k=3)
    
    # C. Hybrid Merge
    final_results = hybrid_retriever.combine_results(bm25_results, vector_results)

    print("\n=== FINAL RETRIEVAL RESULTS ===")
    for idx, res in enumerate(final_results[:3]):
        print(f"\nRank {idx + 1} (Score: {res['score']:.4f})")
        print(f"Document ID: {res['document_id']}")
        print(f"Text: {res['chunk_text']}")

    # Cleanup test file
    if os.path.exists(test_file_path):
        os.remove(test_file_path)
        
    print("\n=== TEST COMPLETE ===")

if __name__ == "__main__":
    run_e2e_test()