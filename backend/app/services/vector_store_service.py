from pathlib import Path
import chromadb


CHROMA_DIR = (
    Path("data")
    / "chromadb"
)


class VectorStoreService:

    def __init__(self):

        self.client = (
            chromadb.PersistentClient(
                path=str(CHROMA_DIR)
            )
        )

        self.collection = (
            self.client.get_or_create_collection(
                name="document_chunks"
            )
        )

    def add_chunks(
        self,
        document_id: int,
        owner_id: int,
        chunks: list[str],
        embeddings: list[list[float]]
    ):

        self.delete_document(
            document_id
        )

        ids = []

        metadatas = []

        for index in range(
            len(chunks)
        ):

            ids.append(
                f"doc_{document_id}_chunk_{index}"
            )

            metadatas.append(
                {
                    "document_id":
                        document_id,

                    "owner_id":
                        owner_id,

                    "chunk_index":
                        index
                }
            )

        self.collection.add(
            ids=ids,
            documents=chunks,
            embeddings=embeddings,
            metadatas=metadatas
        )

    def search(
        self,
        query_embedding: list[float],
        owner_id: int,
        top_k: int = 5
    ) -> list[dict]:

        results = (
            self.collection.query(
                query_embeddings=[
                    query_embedding
                ],
                n_results=top_k,
                where={
                    "owner_id":
                        owner_id
                }
            )
        )

        # Safeguard against empty search results
        if not results["ids"] or not results["ids"][0]:
            return []

        formatted_results = []

        documents = (
            results["documents"][0]
        )

        metadatas = (
            results["metadatas"][0]
        )

        distances = (
            results["distances"][0]
        )

        for index in range(len(documents)):
            
            cosine_similarity = 1.0 - (distances[index] / 2.0)
            
            final_score = max(0.0, round(cosine_similarity, 4))

            formatted_results.append(
                {
                    "document_id":
                        metadatas[index][
                            "document_id"
                        ],

                    "chunk_text":
                        documents[index],

                    "score":
                        final_score
                }
            )

        return formatted_results

    def delete_document(
        self,
        document_id: int
    ):

        results = (
            self.collection.get(
                where={
                    "document_id":
                        document_id
                }
            )
        )

        if results["ids"]:

            self.collection.delete(
                ids=results["ids"]
            )

    def get_document_chunks(
        self,
        document_id: int
    ):

        return (
            self.collection.get(
                where={
                    "document_id":
                        document_id
                }
            )
        )