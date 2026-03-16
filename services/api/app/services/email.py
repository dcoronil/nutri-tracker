from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.config import get_settings

logger = logging.getLogger(__name__)


class EmailSendError(RuntimeError):
    pass


def send_verification_email(to_email: str, code: str) -> bool:
    settings = get_settings()

    if not settings.smtp_host:
        if settings.dev_email_mode:
            logger.info("DEV OTP for %s: %s", to_email, code)
            return False
        return False

    message = EmailMessage()
    message["Subject"] = "Nutri Tracker - Verification code"
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(
        "Your verification code is: "
        f"{code}\n\n"
        "This code expires in "
        f"{settings.verification_code_ttl_minutes} minutes."
    )

    try:
        if settings.smtp_use_ssl:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
                if settings.smtp_user and settings.smtp_password:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
                if settings.smtp_use_tls:
                    smtp.starttls()
                if settings.smtp_user and settings.smtp_password:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(message)
    except Exception as exc:  # pragma: no cover - network integration boundary
        raise EmailSendError(f"Unable to send verification email: {exc}") from exc

    return True
