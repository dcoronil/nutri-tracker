# Nutri Tracker MVP

Monorepo para tracking nutricional personal.

- `apps/mobile`: Expo React Native (auth + onboarding wizard + dashboard + escáner)
- `services/api`: FastAPI + SQLModel + Alembic + pytest
- `infra`: Postgres con Docker Compose

## Stack

- Backend: FastAPI, SQLModel/SQLAlchemy, Alembic, pytest, Ruff
- Mobile: Expo SDK 54, cámara (barcode), captura de etiqueta, dark UI
- Infra: Postgres 16 (docker compose)

## Flujo de producto implementado

1. `NO autenticado` -> Welcome -> Crear cuenta / Iniciar sesión
2. `Autenticado no verificado` -> solo pantalla Verify Email + resend OTP
3. `Verificado sin onboarding` -> wizard 3 pasos:
   - Paso 1: básicos + IMC visual
   - Paso 2: medidas opcionales (skippable) + estimación % grasa
   - Paso 3: objetivos diarios + feedback de realismo
4. `Verificado + onboarding completado` -> app principal (Dashboard / Scan / History / Settings)

## Variables de entorno

Crea `.env` en la raíz:

```bash
cp .env.example .env
```

Variables importantes:

- `DATABASE_URL`
- `AUTH_SECRET_KEY`
- `VERIFICATION_CODE_TTL_MINUTES`
- `DEV_EMAIL_MODE=true` (si no hay SMTP, OTP se imprime en logs)
- `EXPOSE_VERIFICATION_CODE=true` (dev)
- `EXPO_PUBLIC_API_BASE_URL` (para móvil físico usa IP local, no localhost)

SMTP real (si quieres recibir correos de verificación):

- `SMTP_HOST` (ej. `smtp.gmail.com` o el SMTP de tu proveedor)
- `SMTP_PORT` (`587` con TLS o `465` con SSL)
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`
- `SMTP_USE_TLS=true` para puerto `587`
- `SMTP_USE_SSL=true` para puerto `465` (y `SMTP_USE_TLS=false`)

## Arranque rápido

```bash
cd /home/daniel/Documentos/nutri-tracker
make reset-db
make setup
```

Luego en dos terminales:

Terminal 1 (API):

```bash
make api-dev
```

Terminal 2 (mobile):

```bash
make mobile-start
```

## Probar desde móvil físico

1. En `apps/mobile/.env` configura:

```env
EXPO_PUBLIC_API_BASE_URL=http://TU_IP_LOCAL:8000
```

2. Abre Expo Go y escanea el QR de `make mobile-start`.
3. Crea cuenta.
4. Usa OTP de email.
   - Si no hay SMTP y `DEV_EMAIL_MODE=true`, el código queda en logs del backend.
   - Si SMTP falla y `DEV_EMAIL_MODE=true`, también se imprime un OTP fallback en logs.
5. Completa onboarding.
6. En `Scan`, escanea barcode dentro del rectángulo.
7. Si no existe producto, captura etiqueta y crea producto.
8. Registra cantidad (gramos / porción / % paquete).
9. Revisa dashboard (rings + donut + calendario + intakes del día).

## API principal

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/verify`
- `POST /auth/resend-code`
- `GET /me`
- `POST /profile`
- `GET /me/analysis`
- `GET /goals/{yyyy-mm-dd}`
- `POST /goals/{yyyy-mm-dd}`
- `GET /products/by_barcode/{ean}`
- `POST /products/from_label_photo`
- `POST /intakes`
- `GET /days/{yyyy-mm-dd}/summary`
- `GET /calendar/{yyyy-mm}`

## Tests y checks

Backend:

```bash
cd services/api
python3 -m ruff check .
python3 -m pytest -q
```

Mobile (tipado):

```bash
cd apps/mobile
npx tsc --noEmit
```
