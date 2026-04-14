from celery import shared_task
from django.utils import timezone

from .models import APIKey


@shared_task
def update_api_key_last_used(api_key_id):
    """
    Updates the last_used_at timestamp for an API Key in the background.
    Reduces DB write pressure during the authentication flow.
    """
    APIKey.all_objects.filter(pk=api_key_id).update(last_used_at=timezone.now())
