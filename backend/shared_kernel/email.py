import logging

from celery import shared_task
from django.conf import settings
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string
from django.utils.html import strip_tags

from apps.core.models import TenantEmailConfig

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def send_email_task(self, subject, recipient_list, template_name, context, from_email=None, company_id=None):
    """
    Tarefa Celery para envio de e-mails em background.
    Suporta SMTP customizado por tenant se company_id for fornecido.
    """
    connection = None

    if company_id:
        try:
            config = TenantEmailConfig.objects.get(company_id=company_id, use_custom_smtp=True)
            if config:
                if not from_email:
                    from_email = config.from_email

                # SECURITY: Use encrypted password getter
                smtp_password = config.get_smtp_password()

                connection = get_connection(
                    host=config.smtp_host,
                    port=config.smtp_port,
                    username=config.smtp_user,
                    password=smtp_password,  # Now using decrypted password
                    use_tls=config.smtp_use_tls,
                )
                logger.info(f"Usando SMTP customizado para empresa {company_id}")
        except TenantEmailConfig.DoesNotExist:
            pass
        except Exception as e:
            logger.error(f"Erro ao carregar SMTP customizado para empresa {company_id}: {e!s}")

    if not from_email:
        from_email = settings.DEFAULT_FROM_EMAIL

    try:
        html_content = render_to_string(template_name, context)
        text_content = strip_tags(html_content)

        email = EmailMultiAlternatives(subject, text_content, from_email, recipient_list, connection=connection)
        email.attach_alternative(html_content, "text/html")
        email.send()

        logger.info(f"Email enviado com sucesso para: {recipient_list}")
        return True

    except Exception as e:
        logger.error(f"Erro ao enviar email para {recipient_list}: {e!s}")
        # Retenta em caso de erro temporário (ex: timeout do servidor SMTP)
        raise self.retry(exc=e, countdown=60)


def send_notification_email(subject, recipient_list, template_name, context, from_email=None, company_id=None):
    """
    Wrapper para disparar a tarefa Celery.
    """
    send_email_task.delay(subject, recipient_list, template_name, context, from_email, company_id)
