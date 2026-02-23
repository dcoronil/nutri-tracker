from __future__ import annotations

import smtplib
from email.message import EmailMessage

from app.config import get_settings


class EmailSendError(RuntimeError):
    pass


def send_verification_email(to_email: str, code: str) -> bool:
    settings = get_settings()
    if not settings.smtp_host:
        return False

    message = EmailMessage()
    message["Subject"] = "Nutri Tracker - Código de verificación"
    message["From"] = settings.smtp_from_email
    message["To"] = to_email
    message.set_content(
        "Tu código de verificación es: "
        f"{code}\n\n"
        "Este código expira en "
        f"{settings.verification_code_ttl_minutes} minutos."
    )

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except Exception as exc:  # pragma: no cover - integration boundary
        raise EmailSendError(f"No se pudo enviar correo de verificación: {exc}") from exc

    return True
