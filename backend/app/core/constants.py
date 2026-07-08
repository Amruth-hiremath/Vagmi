# allowed file extensions and maximum file size for document uploads
ALLOWED_DOCUMENT_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".txt"
}

ALLOWED_ATTACHMENT_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".txt",
    ".png",
    ".jpg",
    ".jpeg"
}

ALLOWED_IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp"
}

MAX_IMAGE_SIZE = 10 * 1024 * 1024
MAX_DOCUMENT_SIZE = 25 * 1024 * 1024 # 25 MB
MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024 # 50 MB