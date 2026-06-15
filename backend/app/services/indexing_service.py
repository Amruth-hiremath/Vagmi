import re
class IndexingService:

    @staticmethod
    def tokenize(text: str) -> list[str]:
        return re.findall(
            r"\b\w+\b",
            text.lower()
        )
    @staticmethod
    def prepare_chunks(
        chunks: list[str]
    ) -> list[list[str]]:

        return [
            IndexingService.tokenize(chunk)
            for chunk in chunks
        ]