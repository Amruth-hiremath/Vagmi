import re


class ChunkingService:

    def clean_text(
        self,
        text: str
    ) -> str:

        text = re.sub(
            r"\s+",
            " ",
            text
        )

        return text.strip()

    def chunk_text(
        self,
        text: str,
        chunk_size: int = 500,
        overlap: int = 100
    ) -> list[str]:

        if overlap >= chunk_size:
            raise ValueError(
                "overlap must be smaller than chunk_size"
            )

        text = self.clean_text(
            text
        )

        chunks = []

        start = 0

        while start < len(text):

            end = start + chunk_size

            chunk = text[start:end]

            if (
                len(chunk.strip()) < 100
                and len(chunks) > 0
            ):
                chunks[-1] += (
                    " " + chunk
                )
                break

            chunks.append(
                chunk
            )

            start += (
                chunk_size - overlap
            )

        return chunks