import uuid
from django.db import models
from shared_kernel.models import BaseTenantModel
from shared_kernel.utils import tenant_upload_to
from shared_kernel.validators import validate_chat_file

class Media(BaseTenantModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file = models.FileField(
        upload_to=tenant_upload_to('media_library'),
        validators=[validate_chat_file]
    )

    title = models.CharField(max_length=255, blank=True)
    alt_text = models.CharField(max_length=255, blank=True)
    file_type = models.CharField(max_length=100, blank=True) # e.g., image/jpeg
    file_size = models.PositiveIntegerField(default=0) # in bytes
    
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Media Item"
        verbose_name_plural = "Media Items"
        ordering = ['-created_at']

    def __str__(self):
        return self.title or str(self.file.name)
