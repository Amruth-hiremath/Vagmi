import json
from pathlib import Path
from rank_bm25 import BM25Plus

from app.services.indexing_service import IndexingService
from app.core.config import USERS_DIR


class BM25Service:

    def __init__(self):
        self.user_indices = {}

    def _get_user_file_path(self, user_id: int) -> Path:
        return USERS_DIR / f"user_{user_id}" / "bm25_index.json"

    def load_index(self, user_id: int):
        if user_id in self.user_indices:
            return

        file_path = self._get_user_file_path(user_id)

        if file_path.exists():
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

                chunks = data.get("chunks", [])
                metadata = data.get("metadata", [])

                if chunks:
                    tokenized_chunks = (
                        IndexingService.prepare_chunks(
                            chunks
                        )
                    )

                    bm25 = BM25Plus(
                        tokenized_chunks
                    )

                    self.user_indices[user_id] = {
                        "bm25": bm25,
                        "chunks": chunks,
                        "metadata": metadata
                    }

                else:
                    self.user_indices[user_id] = {
                        "bm25": None,
                        "chunks": [],
                        "metadata": []
                    }

        else:
            self.user_indices[user_id] = {
                "bm25": None,
                "chunks": [],
                "metadata": []
            }

    def save_index(self, user_id: int):
        if user_id not in self.user_indices:
            return

        file_path = self._get_user_file_path(user_id)

        file_path.parent.mkdir(
            parents=True,
            exist_ok=True
        )

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "chunks": self.user_indices[user_id]["chunks"],
                    "metadata": self.user_indices[user_id]["metadata"]
                },
                f
            )

    def delete_document(
        self,
        user_id: int,
        document_id: int
    ):
        """Removes all chunks associated with a specific document_id."""

        self.load_index(user_id)

        user_data = self.user_indices.get(user_id)

        if (
            not user_data
            or not user_data["chunks"]
        ):
            return

        filtered_chunks = []
        filtered_metadata = []

        for chunk, meta in zip(
            user_data["chunks"],
            user_data["metadata"]
        ):
            if (
                meta.get("document_id")
                != document_id
            ):
                filtered_chunks.append(chunk)
                filtered_metadata.append(meta)

        user_data["chunks"] = (
            filtered_chunks
        )

        user_data["metadata"] = (
            filtered_metadata
        )

        if filtered_chunks:
            tokenized_chunks = (
                IndexingService.prepare_chunks(
                    filtered_chunks
                )
            )

            user_data["bm25"] = (
                BM25Plus(
                    tokenized_chunks
                )
            )

        else:
            user_data["bm25"] = None

        self.save_index(user_id)

    def add_chunks(
        self,
        user_id: int,
        chunks: list[str],
        chunk_metadata: list[dict]
    ):
        """Appends new chunks, ensuring no duplicates for the same document."""

        if len(chunks) != len(
            chunk_metadata
        ):
            raise ValueError(
                "chunks and chunk_metadata must have the same length"
            )

        if not chunks:
            return

        document_id = (
            chunk_metadata[0]
            .get("document_id")
        )

        if document_id:
            self.delete_document(
                user_id,
                document_id
            )

        self.load_index(user_id)

        self.user_indices[user_id][
            "chunks"
        ].extend(chunks)

        self.user_indices[user_id][
            "metadata"
        ].extend(chunk_metadata)

        tokenized_chunks = (
            IndexingService.prepare_chunks(
                self.user_indices[user_id][
                    "chunks"
                ]
            )
        )

        self.user_indices[user_id][
            "bm25"
        ] = BM25Plus(
            tokenized_chunks
        )

        self.save_index(user_id)

    def search(
        self,
        user_id: int,
        query: str,
        top_k: int = 5
    ) -> list[dict]:

        self.load_index(user_id)

        user_data = self.user_indices.get(
            user_id
        )

        if (
            not user_data
            or user_data["bm25"] is None
        ):
            return []

        tokenized_query = (
            IndexingService.tokenize(
                query
            )
        )

        scores = user_data[
            "bm25"
        ].get_scores(
            tokenized_query
        )

        ranked = sorted(
            enumerate(scores),
            key=lambda x: x[1],
            reverse=True
        )

        results = []

        for index, score in ranked[:top_k]:

            if score > 0:

                results.append(
                    {
                        "document_id":
                            user_data[
                                "metadata"
                            ][index][
                                "document_id"
                            ],
                        "chunk_text":
                            user_data[
                                "chunks"
                            ][index],
                        "score":
                            float(score)
                    }
                )

        return results