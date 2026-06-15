from rank_bm25 import BM25Okapi

from app.services.indexing_service import (
    IndexingService
)


class BM25Service:

    def __init__(self):
        self.bm25 = None
        self.chunks = []

    def build_index(
        self,
        chunks: list[str]
    ):

        self.chunks = chunks

        tokenized_chunks = (
            IndexingService.prepare_chunks(
                chunks
            )
        )

        self.bm25 = BM25Okapi(
            tokenized_chunks
        )

    def search(
        self,
        query: str,
        top_k: int = 5
    ) -> list[dict]:

        if self.bm25 is None:
            raise ValueError(
                "BM25 index not built"
            )

        tokenized_query = (
            IndexingService.tokenize(
                query
            )
        )

        scores = self.bm25.get_scores(
            tokenized_query
        )

        ranked = sorted(
            enumerate(scores),
            key=lambda x: x[1],
            reverse=True
        )

        results = []

        for index, score in ranked[:top_k]:

            results.append(
                {
                    "document_id": 1,
                    "chunk_text":
                        self.chunks[index],
                    "score":
                        float(score)
                }
            )

        return results