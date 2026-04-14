import requests
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

class EvolutionClient:
    def __init__(self, config):
        self.config = config
        self.base_url = config.api_url.rstrip("/")
        self.headers = {
            "apikey": config.api_token,
            "Content-Type": "application/json"
        }

    def send_text(self, number, text):
        """Envia uma mensagem de texto via WhatsApp."""
        endpoint = f"{self.base_url}/message/sendText/{self.config.instance_name}"
        payload = {
            "number": number,
            "options": {
                "delay": 1200,
                "presence": "composing"
            },
            "textMessage": {
                "text": text
            }
        }
        try:
            response = requests.post(endpoint, json=payload, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Erro ao enviar WhatsApp para {number}: {str(e)}")
            return None

    def send_poll(self, number, name, options):
        """Envia uma enquete (útil para XLA)."""
        endpoint = f"{self.base_url}/message/sendPoll/{self.config.instance_name}"
        payload = {
            "number": number,
            "poll": {
                "name": name,
                "options": options,
                "selectableCount": 1
            }
        }
        try:
            response = requests.post(endpoint, json=payload, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Erro ao enviar enquete WhatsApp para {number}: {str(e)}")
            return None

    def set_webhook(self, webhook_url):
        """Configura o endpoint de webhook na instância da Evolution API."""
        endpoint = f"{self.base_url}/webhook/set/{self.config.instance_name}"
        payload = {
            "webhook": {
                "enabled": True,
                "url": webhook_url,
                "byEvents": False,
                "webhookByEvents": False,
                "events": [
                    "MESSAGES_UPSERT"
                ]
            }
        }
        try:
            response = requests.post(endpoint, json=payload, headers=self.headers)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Erro ao configurar webhook para {self.config.instance_name}: {str(e)}")
            return None
