class HybridRetrievalService:

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
                        result["score"]
                        / max_score
                }
            )

        return normalized

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

        return sorted(
            merged.values(),
            key=lambda x: x["score"],
            reverse=True
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
        raise NotImplementedError(
            "Will be implemented after integration"
        )