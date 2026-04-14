import requests
import sys

try:
    print("Testing connection to backend at http://localhost:8000/api/core/health/")
    response = requests.get("http://localhost:8000/api/core/health/", timeout=2)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error connecting to backend: {e}")
