"""
Input sanitization utilities
Prevents XSS, SQL injection, and other injection attacks
"""

import html
import re

import bleach
from bleach.css_sanitizer import CSSSanitizer
from django.utils.html import strip_tags

# Allowed HTML tags for rich text (articles, etc)
ALLOWED_RICH_TEXT_TAGS = [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "a",
    "ul",
    "ol",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "blockquote",
    "code",
    "pre",
    "img",
    "figure",
    "figcaption",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "span",
    "div",
]

# Allowed attributes for rich text HTML
ALLOWED_RICH_TEXT_ATTRIBUTES = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height"],
    "p": ["class"],
    "code": ["class"],
    "pre": ["class"],
    "span": ["class", "style"],
    "div": ["class", "style"],
}

# Allowed protocols for links
ALLOWED_PROTOCOLS = ["http", "https", "mailto"]


def sanitize_html(
    text: str,
    allowed_tags: list[str] | None = None,
    allowed_attributes: dict[str, list[str]] | None = None,
) -> str:
    """
    Sanitize HTML input using bleach library
    Removes dangerous tags and attributes while preserving safe ones

    Args:
        text: HTML text to sanitize
        allowed_tags: List of allowed HTML tags
        allowed_attributes: Dict of allowed attributes per tag

    Returns:
        Sanitized HTML string
    """
    if not text:
        return ""

    tags = allowed_tags if allowed_tags is not None else ALLOWED_RICH_TEXT_TAGS
    attrs = allowed_attributes if allowed_attributes is not None else ALLOWED_RICH_TEXT_ATTRIBUTES

    css_cleaner = CSSSanitizer(allowed_css_properties=None, allowed_svg_properties=None)
    return bleach.clean(
        text, tags=tags, attributes=attrs, protocols=ALLOWED_PROTOCOLS, css_sanitizer=css_cleaner, strip=True
    )


def sanitize_plain_text(text: str) -> str:
    """
    Strip all HTML tags and escape remaining HTML entities
    Use for user inputs that should not contain any HTML

    Args:
        text: Text to sanitize

    Returns:
        Plain text with HTML stripped and escaped
    """
    if not text:
        return ""

    # Strip all HTML tags
    text = strip_tags(text)

    # Escape HTML entities
    text = html.escape(text)

    return text.strip()


def sanitize_sql_identifier(identifier: str) -> str:
    """
    Sanitize SQL identifiers (table names, column names)
    IMPORTANT: This is NOT a replacement for parameterized queries!
    Only use for dynamic table/column names when absolutely necessary

    Args:
        identifier: SQL identifier to sanitize

    Returns:
        Sanitized identifier

    Raises:
        ValueError: If identifier contains invalid characters
    """
    if not identifier:
        raise ValueError("Identifier cannot be empty")

    # Only allow alphanumeric and underscore
    if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", identifier):
        raise ValueError(f"Invalid SQL identifier: {identifier}")

    return identifier


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filename to prevent directory traversal and other attacks

    Args:
        filename: Filename to sanitize

    Returns:
        Safe filename
    """
    if not filename:
        return "unnamed"

    # Remove path separators
    filename = filename.replace("/", "_").replace("\\", "_")

    # Remove null bytes
    filename = filename.replace("\x00", "")

    # Remove leading dots (hidden files)
    filename = filename.lstrip(".")

    # Only keep safe characters: alphanumeric, dash, underscore, dot
    filename = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)

    # Limit length
    if len(filename) > 255:
        name, ext = filename.rsplit(".", 1) if "." in filename else (filename, "")
        filename = name[:250] + ("." + ext if ext else "")

    return filename or "unnamed"


def sanitize_url(url: str, allowed_protocols: list[str] | None = None) -> str | None:
    """
    Sanitize and validate URL
    Prevents javascript:, data:, and other dangerous protocols

    Args:
        url: URL to sanitize
        allowed_protocols: List of allowed protocols (default: http, https)

    Returns:
        Sanitized URL or None if invalid
    """
    if not url:
        return None

    url = url.strip()

    protocols = allowed_protocols or ["http", "https"]

    # Check protocol
    if "://" in url:
        protocol = url.split("://")[0].lower()
        if protocol not in protocols:
            return None
    else:
        # Relative URL is okay
        pass

    # Remove javascript:, data:, vbscript:, etc
    dangerous_patterns = [
        r"javascript:",
        r"data:",
        r"vbscript:",
        r"file:",
        r"about:",
    ]

    url_lower = url.lower()
    for pattern in dangerous_patterns:
        if pattern in url_lower:
            return None

    return url


def sanitize_email(email: str) -> str | None:
    """
    Basic email sanitization
    Note: Use Django's EmailField validator for proper validation

    Args:
        email: Email to sanitize

    Returns:
        Sanitized email or None if invalid
    """
    if not email:
        return None

    email = email.strip().lower()

    # Basic regex check
    if not re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", email):
        return None

    return email


def sanitize_phone(phone: str) -> str:
    """
    Sanitize phone number - keep only digits

    Args:
        phone: Phone number to sanitize

    Returns:
        Sanitized phone with only digits
    """
    if not phone:
        return ""

    # Keep only digits
    phone = re.sub(r"[^0-9]", "", phone)

    return phone


def sanitize_slug(text: str, max_length: int = 50) -> str:
    """
    Create a safe slug from text

    Args:
        text: Text to convert to slug
        max_length: Maximum length of slug

    Returns:
        URL-safe slug
    """
    if not text:
        return ""

    # Convert to lowercase
    slug = text.lower()

    # Replace spaces with hyphens
    slug = slug.replace(" ", "-")

    # Remove special characters
    slug = re.sub(r"[^a-z0-9-]", "", slug)

    # Remove multiple hyphens
    slug = re.sub(r"-+", "-", slug)

    # Remove leading/trailing hyphens
    slug = slug.strip("-")

    # Limit length
    slug = slug[:max_length]

    return slug or "unnamed"


# Decorator for automatically sanitizing function arguments
def sanitize_input(sanitizer_map: dict):
    """
    Decorator to automatically sanitize function arguments

    Example:
        @sanitize_input({'name': sanitize_plain_text, 'email': sanitize_email})
        def create_user(name: str, email: str):
            ...
    """

    def decorator(func):
        def wrapper(*args, **kwargs):
            # Sanitize kwargs
            for key, sanitizer in sanitizer_map.items():
                if key in kwargs and kwargs[key] is not None:
                    kwargs[key] = sanitizer(kwargs[key])

            return func(*args, **kwargs)

        return wrapper

    return decorator
