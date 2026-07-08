from pathlib import Path

from app.services.document_processor import (
    DocumentProcessor
)

processor = DocumentProcessor()

test_data_dir = (
    Path(__file__).parent.parent
    / "test_data"
)

for file in [
    test_data_dir / "sample.txt",
    test_data_dir / "sample.docx",
    test_data_dir / "sample.pdf"
]:
    print("=" * 50)
    print(file)
    print("=" * 50)

    text = processor.extract_text(
        str(file)
    )

    print(text)