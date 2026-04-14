"""
File upload validators for security
Validates file types, sizes, and content to prevent malicious uploads
"""

import magic
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import UploadedFile
from django.utils.translation import gettext_lazy as _

# File size limits (in bytes)
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2 MB

# Allowed MIME types
ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
}

ALLOWED_FILE_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
}

ALLOWED_CHAT_FILE_TYPES = ALLOWED_IMAGE_TYPES | ALLOWED_FILE_TYPES


def validate_file_size(file: UploadedFile, max_size: int):
    """
    Validate that file size doesn't exceed max_size

    Args:
        file: Uploaded file instance
        max_size: Maximum size in bytes

    Raises:
        ValidationError: If file is too large
    """
    if file.size > max_size:
        max_mb = max_size / (1024 * 1024)
        raise ValidationError(
            _("O arquivo é muito grande. Tamanho máximo permitido: %(max_mb)s MB"),
            params={"max_mb": max_mb},
            code="file_too_large",
        )


def validate_file_type(file: UploadedFile, allowed_types: set):
    """
    Validate file type using magic numbers (file content)
    Does not rely on file extension which can be spoofed

    Args:
        file: Uploaded file instance
        allowed_types: Set of allowed MIME types

    Raises:
        ValidationError: If file type is not allowed
    """
    # Read first chunk to determine file type
    file_content = file.read(2048)
    file.seek(0)  # Reset file pointer

    # Detect MIME type from content (magic numbers)
    mime_type = magic.from_buffer(file_content, mime=True)

    if mime_type not in allowed_types:
        raise ValidationError(
            _("Tipo de arquivo não permitido: %(mime_type)s"), params={"mime_type": mime_type}, code="invalid_file_type"
        )


def validate_image(file: UploadedFile):
    """
    Validate image file (type and size)

    Args:
        file: Uploaded image file

    Raises:
        ValidationError: If validation fails
    """
    validate_file_size(file, MAX_IMAGE_SIZE)
    validate_file_type(file, ALLOWED_IMAGE_TYPES)


def validate_avatar(file: UploadedFile):
    """
    Validate avatar image (smaller size limit)

    Args:
        file: Uploaded avatar image

    Raises:
        ValidationError: If validation fails
    """
    validate_file_size(file, MAX_AVATAR_SIZE)
    validate_file_type(file, ALLOWED_IMAGE_TYPES)


def validate_document(file: UploadedFile):
    """
    Validate document file (type and size)

    Args:
        file: Uploaded document file

    Raises:
        ValidationError: If validation fails
    """
    validate_file_size(file, MAX_FILE_SIZE)
    validate_file_type(file, ALLOWED_FILE_TYPES)


def validate_chat_file(file: UploadedFile):
    """
    Validate chat attachment (images or documents)

    Args:
        file: Uploaded chat file

    Raises:
        ValidationError: If validation fails
    """
    validate_file_size(file, MAX_FILE_SIZE)
    validate_file_type(file, ALLOWED_CHAT_FILE_TYPES)


def validate_file_extension(filename: str, allowed_extensions: set):
    """
    Additional validation for file extension
    Use as secondary check after MIME type validation

    Args:
        filename: Name of the file
        allowed_extensions: Set of allowed extensions (without dot)

    Raises:
        ValidationError: If extension is not allowed
    """
    extension = filename.split(".")[-1].lower() if "." in filename else ""

    if extension not in allowed_extensions:
        raise ValidationError(
            _("Extensão de arquivo não permitida: .%(extension)s"),
            params={"extension": extension},
            code="invalid_extension",
        )


# Allowed extensions (as backup validation)
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
ALLOWED_DOCUMENT_EXTENSIONS = {"pdf", "doc", "docx", "xls", "xlsx", "txt"}
