from pathlib import Path
from app.core.logging_config import logger
import fitz
from docx import Document


class DocumentProcessor:

    def extract_text(
        self,
        file_path: str
    ) -> str:

        extension = (
            Path(file_path)
            .suffix
            .lower()
        )

        if extension == ".txt":
            return self._extract_txt(file_path)

        if extension == ".docx":
            return self._extract_docx(file_path)

        if extension == ".pdf":
            return self._extract_pdf(file_path)
        
        logger.info(
            f"Extracting text from {file_path}"
        )

        raise ValueError(
            f"Unsupported file type: {extension}"
        )

    def _extract_txt(
        self,
        file_path: str
    ) -> str:

        with open(
            file_path,
            "r",
            encoding="utf-8",
            errors="ignore"
        ) as file:

            return file.read()
    
    def _extract_docx(
        self,
        file_path: str
    ) -> str:

        document = Document(file_path)

        paragraphs = []

        for paragraph in document.paragraphs:
            paragraphs.append(
                paragraph.text
            )

        return "\n".join(paragraphs)

    def _extract_pdf(
        self,
        file_path: str
    ) -> str:

        pdf = fitz.open(file_path)

        pages = []

        for page in pdf:
            pages.append(
                page.get_text()
            )

        pdf.close()

        return "\n".join(pages)