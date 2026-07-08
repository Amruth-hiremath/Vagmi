import re

class ChunkingService:

    def clean_text(self, text: str) -> str:
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    def chunk_text(self, text: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
        if overlap >= chunk_size:
            raise ValueError("overlap must be smaller than chunk_size")

        text = self.clean_text(text)
        words = text.split(" ")
        
        chunks = []
        current_chunk = []
        current_length = 0
        
        i = 0
        while i < len(words):
            word = words[i]
            
            # Check if adding the next word exceeds the chunk size
            if current_length + len(word) > chunk_size and len(current_chunk) > 0:
                # 1. Save the current chunk
                chunks.append(" ".join(current_chunk))
                
                # 2. Backtrack to create the overlap for the next chunk
                overlap_length = 0
                overlap_words = []
                for w in reversed(current_chunk):
                    if overlap_length + len(w) <= overlap:
                        overlap_words.insert(0, w)
                        overlap_length += len(w) + 1
                    else:
                        break
                        
                # 3. Setup the next chunk to start with the overlap words
                current_chunk = overlap_words
                current_length = sum(len(w) + 1 for w in current_chunk)
                # Note: We do NOT increment 'i' here because we still need to process the current word
            else:
                current_chunk.append(word)
                current_length += len(word) + 1
                i += 1
                
        # Append the final remaining chunk
        if current_chunk:
            chunks.append(" ".join(current_chunk))
            
        return chunks