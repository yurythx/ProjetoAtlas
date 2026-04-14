import importlib
import inspect

from django.apps import apps
from django.test import SimpleTestCase
from rest_framework.viewsets import ViewSetMixin

from apps.accounts.permissions import AVAILABLE_PERMISSIONS


class PermissionRegistryTest(SimpleTestCase):
    def test_all_api_permissions_are_declared(self):
        declared = set(AVAILABLE_PERMISSIONS.keys())
        missing = set()

        for app_config in apps.get_app_configs():
            module_base = app_config.name
            try:
                views_module = importlib.import_module(f"{module_base}.views")
            except Exception:
                continue

            for _, obj in inspect.getmembers(views_module, inspect.isclass):
                if not issubclass(obj, ViewSetMixin):
                    continue

                required_permission = getattr(obj, "required_permission", None)
                if isinstance(required_permission, str) and required_permission and required_permission not in declared:
                    missing.add(required_permission)

                action_permissions = getattr(obj, "action_permissions", None)
                if isinstance(action_permissions, dict):
                    for value in action_permissions.values():
                        if isinstance(value, str) and value and value not in declared:
                            missing.add(value)

                action_any_permissions = getattr(obj, "action_any_permissions", None)
                if isinstance(action_any_permissions, dict):
                    for values in action_any_permissions.values():
                        if isinstance(values, list):
                            for value in values:
                                if isinstance(value, str) and value and value not in declared:
                                    missing.add(value)

                any_permissions = getattr(obj, "any_permissions", None)
                if isinstance(any_permissions, list):
                    for value in any_permissions:
                        if isinstance(value, str) and value and value not in declared:
                            missing.add(value)

        self.assertEqual(sorted(missing), [], f"Permissões usadas na API mas ausentes em AVAILABLE_PERMISSIONS: {sorted(missing)}")

    def test_declared_permissions_are_well_formed(self):
        self.assertGreater(len(AVAILABLE_PERMISSIONS), 0)
        for key, label in AVAILABLE_PERMISSIONS.items():
            self.assertIsInstance(key, str)
            self.assertTrue(key.strip())
            self.assertIsInstance(label, str)
            self.assertTrue(label.strip())

