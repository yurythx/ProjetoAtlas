"""
Encryption utilities for sensitive database fields.
Provides encryption/decryption for fields like SMTP passwords, API keys, etc.
"""

import logging

from cryptography.fernet import Fernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)


def get_cipher():
    """
    Returns a Fernet cipher instance using the FIELD_ENCRYPTION_KEY from settings.

    Raises:
        ImproperlyConfigured: If FIELD_ENCRYPTION_KEY is not set in settings
    """
    key = getattr(settings, "FIELD_ENCRYPTION_KEY", None)

    if not key:
        raise ImproperlyConfigured(
            "FIELD_ENCRYPTION_KEY must be set in settings. "
            'Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )

    # Ensure key is bytes
    if isinstance(key, str):
        key = key.encode()

    return Fernet(key)


def encrypt_value(plain_value: str) -> bytes:
    """
    Encrypts a plaintext string value.

    Args:
        plain_value: The plaintext string to encrypt

    Returns:
        Encrypted bytes that can be stored in a BinaryField
    """
    if not plain_value:
        return b""

    cipher = get_cipher()
    encrypted = cipher.encrypt(plain_value.encode("utf-8"))
    return encrypted


def decrypt_value(encrypted_value: bytes) -> str:
    """
    Decrypts an encrypted bytes value.

    Args:
        encrypted_value: The encrypted bytes from database

    Returns:
        Decrypted plaintext string
    """
    if not encrypted_value:
        return ""

    try:
        cipher = get_cipher()
        decrypted = cipher.decrypt(encrypted_value)
        return decrypted.decode("utf-8")
    except Exception as e:
        logger.error(f"Failed to decrypt value: {e}")
        return ""


def generate_encryption_key() -> str:
    """
    Generates a new Fernet encryption key.

    Returns:
        A base64-encoded encryption key as string
    """
    return Fernet.generate_key().decode()
