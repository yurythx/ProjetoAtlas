import logging
import mimetypes

from django.conf import settings
from django.core.files.storage import default_storage
from django.http import Http404, StreamingHttpResponse
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

logger = logging.getLogger(__name__)

# Registrar mimetypes comuns que podem faltar em algumas distros
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("image/jpeg", ".jfif")


class MediaProxyView(APIView):
    """
    Proxy para servir arquivos de media do Storage (S3/MinIO) através da API.
    Isso permite acessar arquivos do MinIO interno sem expô-lo publicamente.
    """

    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        # Permitir acesso público a arquivos de branding (logos, ícones)
        path = self.kwargs.get("path", "")

        # Lista de extensões de imagem públicas
        public_extensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".jfif"]
        is_image = any(path.lower().endswith(ext) for ext in public_extensions)

        if "branding/" in path or "public/" in path or is_image:
            return [AllowAny()]
        return [IsAuthenticated()]

    @extend_schema(responses={200: serializers.FileField()})
    def get(self, request, path):
        # Proteção básica contra path traversal
        if ".." in path:
            raise Http404

        # Debug logging to identify pathing issues
        logger.debug(f"[MediaProxy] Request path: {path}")

        # Recalcular se é imagem pública (mesma lógica do get_permissions)
        public_extensions = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".jfif"]
        is_image_public = any(path.lower().endswith(ext) for ext in public_extensions)

        # Verificação de Segurança de Tenant
        # Se não for público/branding/imagem, verificar se o usuário pertence à empresa do arquivo
        if "branding/" not in path and "public/" not in path and not is_image_public:
            parts = path.split("/")
            # Esperado: tenants/{slug}/...
            if len(parts) > 1 and parts[0] == "tenants":
                slug = parts[1]

                # Se usuário não está autenticado, nega acesso a arquivos privados
                if not request.user.is_authenticated:
                    logger.warning(f"[MediaProxy] Access denied for anonymous user to private file {path}")
                    raise Http404

                # Verifica se o usuário pertence à empresa (ou é superuser)
                if request.user.is_superuser:
                    pass
                elif (
                    not hasattr(request.user, "company")
                    or not request.user.company
                    or request.user.company.slug != slug
                ):
                    logger.warning(f"[MediaProxy] Access denied for user {request.user} to file {path}")
                    raise Http404  # Ocultar existência do arquivo

        file_path = path

        # Se configuramos AWS_MEDIA_LOCATION (ex: 'media'), o arquivo real no bucket pode estar em 'media/path'
        # Mas verificamos se o arquivo já existe no path original primeiro
        if not default_storage.exists(file_path):
            # Tentar com prefixo AWS_MEDIA_LOCATION se definido
            media_location = getattr(settings, "AWS_MEDIA_LOCATION", "")
            if media_location and not path.startswith(media_location):
                prefixed_path = f"{media_location}/{path}"
                if default_storage.exists(prefixed_path):
                    file_path = prefixed_path
                else:
                    logger.warning(f"[MediaProxy] File not found. Tried: {path} and {prefixed_path}")
            else:
                # Tentar remover prefixo 'media/' se o path vier com ele duplicado
                if path.startswith("media/"):
                    stripped_path = path[6:]
                    if default_storage.exists(stripped_path):
                        file_path = stripped_path
                    else:
                        logger.warning(f"[MediaProxy] File not found: {path}")
                else:
                    logger.warning(f"[MediaProxy] File not found: {path}")

        if not default_storage.exists(file_path):
            raise Http404(f"File not found in storage: {file_path}")

        logger.debug(f"[MediaProxy] Serving file: {file_path}")

        try:
            file = default_storage.open(file_path, "rb")
            content_type, _encoding = mimetypes.guess_type(file_path)
            content_type = content_type or "application/octet-stream"

            response = StreamingHttpResponse(file, content_type=content_type)
            response["Content-Disposition"] = "inline"

            # D2: Use 'private' cache for authenticated files to prevent
            # shared CDN/proxy caches from serving private files to other users.
            # Public branding files (logos, icons) can use a longer public cache.
            public_path = "branding/" in path or "public/" in path
            if public_path:
                response["Cache-Control"] = "public, max-age=604800, immutable"
            else:
                response["Cache-Control"] = "private, max-age=3600"

            return response
        except Exception:
            logger.exception(f"[MediaProxy] Error serving media {file_path}")
            raise Http404
