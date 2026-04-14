"""
Celery tasks for the Messenger application.
"""

import ipaddress
import logging
from urllib.parse import urljoin, urlparse

from celery import shared_task
from django.core.cache import cache

logger = logging.getLogger(__name__)

# Cache TTL for link previews: 24 hours
LINK_PREVIEW_TTL = 60 * 60 * 24


@shared_task(bind=True, max_retries=2, default_retry_delay=10)
def fetch_link_preview(self, url: str, cache_key: str):
    """
    Asynchronously fetches Open Graph / meta data for a URL and stores it in cache.

    The link_preview API endpoint dispatches this task and returns 202 immediately.
    The frontend can retry the same endpoint after a short delay to get the result
    once this task has completed and populated the cache.

    Args:
        url: The (already sanitized and validated) URL to preview.
        cache_key: The Redis cache key under which to store the result.
    """
    try:
        import requests
        from bs4 import BeautifulSoup

        # SSRF guard: validate host once more inside the task
        parsed = urlparse(url)
        host = parsed.hostname or ""
        try:
            ip = ipaddress.ip_address(host) if host.replace(".", "").isdigit() else None
            if ip and (ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local):
                logger.warning("fetch_link_preview: blocked private IP %s for URL %s", host, url)
                return None
        except ValueError:
            pass

        headers = {"User-Agent": "Atlas/1.0 (link preview)"}
        resp = requests.get(url, headers=headers, timeout=8, stream=True, allow_redirects=True)

        # Validate redirect destination
        final_url = resp.url or url
        final_host = urlparse(final_url).hostname or ""
        if final_host in ("localhost", "127.0.0.1"):
            return None
        try:
            fip = ipaddress.ip_address(final_host) if final_host.replace(".", "").isdigit() else None
            if fip and (fip.is_private or fip.is_loopback or fip.is_reserved or fip.is_link_local):
                return None
        except ValueError:
            pass

        ctype = (resp.headers.get("Content-Type") or "").lower()
        if "text/html" not in ctype:
            return None

        # Read up to 256 KB
        content = b""
        for chunk in resp.iter_content(4096):
            content += chunk
            if len(content) >= 256 * 1024:
                break

        text = content.decode(resp.encoding or "utf-8", errors="ignore")
        soup = BeautifulSoup(text, "html.parser")

        title_tag = soup.find("meta", property="og:title")
        desc_tag = soup.find("meta", property="og:description")
        img_tag = soup.find("meta", property="og:image")

        image_url = img_tag["content"] if img_tag else ""
        if image_url and image_url.startswith("/"):
            image_url = urljoin(f"{parsed.scheme}://{parsed.netloc}", image_url)

        data = {
            "title": title_tag["content"] if title_tag else (soup.title.string if soup.title else ""),
            "description": desc_tag["content"] if desc_tag else "",
            "image": image_url,
            "url": url,
        }

        cache.set(cache_key, data, timeout=LINK_PREVIEW_TTL)
        logger.info("fetch_link_preview: cached preview for %s", url)
        return data

    except Exception as exc:
        logger.error("fetch_link_preview failed for %s: %s", url, exc)
        # Retry up to max_retries times
        raise self.retry(exc=exc)


@shared_task
def cleanup_orphan_chat_files():
    """
    Deletes files from 'chat/attachments/' that are no longer referenced by any Message.
    This helps free up storage after soft deletes or failed uploads.
    """
    from django.core.files.storage import default_storage

    from .models import Message

    logger.info("Starting cleanup_orphan_chat_files task")
    try:
        cleaned_count = 0
        stack = ["tenants/"]

        while stack:
            base = stack.pop()
            directories, filenames = default_storage.listdir(base)

            for dirname in directories:
                stack.append(f"{base}{dirname}/")

            if "/chat/attachments/" not in base:
                continue

            for filename in filenames:
                file_path = f"{base}{filename}"
                if not Message.all_objects.filter(file=file_path).exists():
                    logger.info("cleanup_orphan_chat_files: deleting orphan file %s", file_path)
                    default_storage.delete(file_path)
                    cleaned_count += 1

        logger.info("cleanup_orphan_chat_files: finished. Deleted %d files.", cleaned_count)
        return cleaned_count

    except FileNotFoundError:
        logger.info("cleanup_orphan_chat_files: directory 'chat/attachments/' not found, skipping.")
        return 0
    except Exception as e:
        logger.error("cleanup_orphan_chat_files failed: %s", e)
        return 0
