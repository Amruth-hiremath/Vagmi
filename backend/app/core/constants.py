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

MAX_IMAGE_SIZE = 100 * 1024 * 1024 # 100 MB
MAX_DOCUMENT_SIZE = 1 * 1024 * 1024 * 1024 # 1 GB
MAX_ATTACHMENT_SIZE = 2 * 1024 * 1024 * 1024 # 2 GB