try:
    from django.core.management.utils import get_random_secret_key

    print(f"SECRET_KEY={get_random_secret_key()}")
except ImportError:
    import random
    import string

    chars = string.ascii_letters + string.digits + "(*&^%$#@!"
    print(f"SECRET_KEY={''.join(random.choice(chars) for _ in range(50))}")

try:
    from cryptography.fernet import Fernet

    print(f"FIELD_ENCRYPTION_KEY={Fernet.generate_key().decode()}")
except ImportError:
    print("FIELD_ENCRYPTION_KEY=cryptography_not_installed")
