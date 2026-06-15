from app.services.retrieval_service import (
    RetrievalService
)

service = RetrievalService()

results = service.search(
    query="Why are embeddings used?",
    user_id=1,
    top_k=3
)

for result in results:
    print(result)