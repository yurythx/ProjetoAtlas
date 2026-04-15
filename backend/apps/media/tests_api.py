from rest_framework import status
from rest_framework.test import APITestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from django.contrib.auth import get_user_model
from apps.core.models import Company

from apps.accounts.models import Role
from apps.module_manager.models import Module, TenantModule

User = get_user_model()

class MediaAPITest(APITestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Media Corp", slug="media-corp")
        self.role = Role.objects.create(
            company=self.company,
            name="Admin",
            permissions=['media.media_view', 'media.media_upload']
        )
        self.user = User.all_objects.create_user(
            username="mediauser",
            email="m@corp.com",
            password="pass",
            company=self.company,
            role=self.role
        )
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_COMPANY_SLUG='media-corp')

        self.mod = Module.objects.create(code="media", name="Media")
        TenantModule.objects.create(company=self.company, module=self.mod, is_active=True)


    def test_upload_and_filter_by_tenant(self):
        content = b"hello world"
        upload = SimpleUploadedFile("hello.txt", content, content_type="text/plain")
        res = self.client.post('/api/media/files/', {"file": upload, "title": "Hello"}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['title'], "Hello")

        list_res = self.client.get('/api/media/files/')
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        # Default pagination returns a list if disabled or results key if enabled
        data = list_res.data if isinstance(list_res.data, list) else list_res.data.get('results', [])
        self.assertTrue(len(data) >= 1)
