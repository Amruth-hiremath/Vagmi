from app.services.bm25_service import BM25Service
from app.services.retrieval_service import RetrievalService


class HybridRetrievalService:

    def __init__(
        self,
        bm25_service: BM25Service = None,
        retrieval_service: RetrievalService = None
    ):
        self.bm25_service = bm25_service
        self.retrieval_service = retrieval_service

    def normalize_scores(
        self,
        results
    ):

        if not results:
            return results

        max_score = max(
            result["score"]
            for result in results
        )

        if max_score == 0:
            return results

        normalized = []

        for result in results:

            normalized.append(
                {
                    **result,
                    "score":
                        result["score"] / max_score
                }
            )

        return normalized

    def deduplicate_results(
        self,
        results
    ):

        seen = set()

        unique = []

        for result in results:

            key = (
                result["document_id"],
                result["chunk_text"].strip()
            )

            if key not in seen:

                seen.add(key)

                unique.append(result)

        return unique

    def combine_results(
        self,
        bm25_results,
        vector_results
    ):

        bm25_results = (
            self.normalize_scores(
                bm25_results
            )
        )

        vector_results = (
            self.normalize_scores(
                vector_results
            )
        )

        merged = {}

        for result in bm25_results:

            key = (
                result["document_id"],
                result["chunk_text"]
            )

            merged[key] = {
                **result,
                "score":
                    0.4 * result["score"]
            }

        for result in vector_results:

            key = (
                result["document_id"],
                result["chunk_text"]
            )

            if key not in merged:

                merged[key] = {
                    **result,
                    "score":
                        0.6 * result["score"]
                }

            else:

                merged[key]["score"] += (
                    0.6 * result["score"]
                )

        results = sorted(
            merged.values(),
            key=lambda x: x["score"],
            reverse=True
        )

        return self.deduplicate_results(
            results
        )

    def rerank_results(
        self,
        results
    ):

        return sorted(
            results,
            key=lambda x: x["score"],
            reverse=True
        )

    def search(
        self,
        query: str,
        user_id: int,
        top_k: int = 5
    ):

        if (
            self.bm25_service is None
            or self.retrieval_service is None
        ):
            raise ValueError(
                "HybridRetrievalService requires "
                "bm25_service and retrieval_service "
                "for search()"
            )

        bm25_results = (
            self.bm25_service.search(
                user_id=user_id,
                query=query,
                top_k=top_k
            )
        )

        vector_results = (
            self.retrieval_service.search(
                query=query,
                user_id=user_id,
                top_k=top_k
            )
        )

        combined = (
            self.combine_results(
                bm25_results,
                vector_results
            )
        )

        return self.rerank_results(
            combined
        )[:top_k]
