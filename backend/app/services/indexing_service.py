import re
import unicodedata

class IndexingService:
    # A lightweight, offline list of words that should never be searched
    STOP_WORDS = {
        "a", "an", "the", "and", "or", "but", "if", "because", "as", "what",
        "when", "where", "how", "why", "who", "is", "are", "was", "were", "be",
        "been", "being", "in", "on", "at", "to", "for", "with", "about", "against",
        "between", "into", "through", "during", "before", "after", "above", "below",
        "from", "up", "down", "out", "off", "over", "under", "again", "further",
        "then", "once", "here", "there", "all", "any", "both", "each", "few",
        "more", "most", "other", "some", "such", "no", "nor", "not", "only",
        "own", "same", "so", "than", "too", "very", "can", "will", "just", "it", "of", "its"
    }

    @staticmethod
    def normalize_text(text: str) -> str:
        # Converts 'Vāgmi' to 'Vagmi' by stripping unicode accents safely
        text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
        return text.lower()

    @staticmethod
    def tokenize(text: str) -> list[str]:
        # 1. Strip accents and lowercase
        text = IndexingService.normalize_text(text)
        
        # 2. Extract words
        tokens = re.findall(r"\b\w+\b", text)
        
        # 3. Filter out junk stop words
        return [t for t in tokens if t not in IndexingService.STOP_WORDS]

    @staticmethod
    def prepare_chunks(chunks: list[str]) -> list[list[str]]:
        return [IndexingService.tokenize(chunk) for chunk in chunks]