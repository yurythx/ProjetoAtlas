#!/usr/bin/env python3
"""
Atlas — Secret Generator
========================
Generates all required secrets for .env.docker and writes them to the file.

Usage:
    python scripts/generate-secrets.py                  # writes to backend/.env.docker
    python scripts/generate-secrets.py --dry-run        # prints to stdout only
    python scripts/generate-secrets.py --output /path   # custom output path

Requirements (already in requirements.txt):
    cryptography, pywebpush
"""
import argparse
import os
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
EXAMPLE_FILE = ROOT / "backend" / ".env.docker.example"
OUTPUT_FILE = ROOT / "backend" / ".env.docker"


def generate_django_secret_key() -> str:
    chars = "abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*(-_=+)"
    return "".join(secrets.choice(chars) for _ in range(50))


def generate_fernet_key() -> str:
    try:
        from cryptography.fernet import Fernet
        return Fernet.generate_key().decode()
    except ImportError:
        print("  [WARN] cryptography not installed — using random fallback for FIELD_ENCRYPTION_KEY")
        return secrets.token_urlsafe(32)


def generate_vapid_keys() -> tuple[str, str]:
    try:
        from py_vapid import Vapid
        v = Vapid()
        v.generate_keys()
        pub = v.public_key
        priv = v.private_key
        return pub, priv
    except Exception:
        pass
    try:
        from pywebpush import Vapid
        v = Vapid()
        v.generate_keys()
        return v.public_key, v.private_key
    except Exception:
        print("  [WARN] pywebpush not installed — VAPID keys left empty. Install it and re-run.")
        return "", ""


def load_example() -> list[str]:
    if not EXAMPLE_FILE.exists():
        print(f"[ERROR] Example file not found: {EXAMPLE_FILE}")
        sys.exit(1)
    return EXAMPLE_FILE.read_text(encoding="utf-8").splitlines()


def fill_secrets(lines: list[str], values: dict[str, str]) -> list[str]:
    result = []
    for line in lines:
        stripped = line.strip()
        if "=" in stripped and not stripped.startswith("#"):
            key = stripped.split("=", 1)[0]
            if key in values and values[key]:
                line = f"{key}={values[key]}"
        result.append(line)
    return result


def main():
    parser = argparse.ArgumentParser(description="Generate Atlas secrets into .env.docker")
    parser.add_argument("--dry-run", action="store_true", help="Print to stdout instead of writing")
    parser.add_argument("--output", default=str(OUTPUT_FILE), help="Output file path")
    args = parser.parse_args()

    output_path = Path(args.output)

    if output_path.exists() and not args.dry_run:
        confirm = input(f"\n  {output_path} already exists. Overwrite? [y/N] ").strip().lower()
        if confirm != "y":
            print("  Aborted.")
            sys.exit(0)

    print("\n  Generating secrets for Atlas...\n")

    secret_key = generate_django_secret_key()
    print(f"  ✓ SECRET_KEY          {secret_key[:20]}...")

    fernet_key = generate_fernet_key()
    print(f"  ✓ FIELD_ENCRYPTION_KEY {fernet_key[:20]}...")

    vapid_pub, vapid_priv = generate_vapid_keys()
    if vapid_pub:
        print(f"  ✓ VAPID_PUBLIC_KEY     {vapid_pub[:20]}...")
        print(f"  ✓ VAPID_PRIVATE_KEY    {vapid_priv[:20]}...")
    else:
        print("  ✗ VAPID keys skipped (install pywebpush to generate)")

    grafana_password = secrets.token_urlsafe(16)
    print(f"  ✓ GRAFANA_PASSWORD     {grafana_password}")

    values = {
        "SECRET_KEY": secret_key,
        "FIELD_ENCRYPTION_KEY": fernet_key,
        "VAPID_PUBLIC_KEY": vapid_pub,
        "VAPID_PRIVATE_KEY": vapid_priv,
        "GRAFANA_PASSWORD": grafana_password,
    }

    lines = load_example()
    filled = fill_secrets(lines, values)
    content = "\n".join(filled) + "\n"

    if args.dry_run:
        print("\n" + "─" * 60)
        print(content)
    else:
        output_path.write_text(content, encoding="utf-8")
        print(f"\n  ✓ Written to {output_path}")
        print("\n  Next steps:")
        print("    1. Fill in GEMINI_API_KEY, SENTRY_DSN, email settings")
        print("    2. Set POSTGRES_PASSWORD and MINIO_ROOT_PASSWORD to strong values")
        print("    3. Set GRAFANA_ALERT_EMAIL to your ops email")
        print("    4. docker-compose build && docker-compose up -d")
        print("    5. docker-compose exec backend python manage.py migrate\n")


if __name__ == "__main__":
    main()
