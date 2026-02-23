# Nutri Tracker MVP

App personal de tracking nutricional con monorepo:

- `apps/mobile`: Expo React Native (dark UI, escáner de barcode, dashboard gráfico)
- `services/api`: FastAPI + SQLModel + Alembic + pytest
- `infra`: Postgres con Docker Compose

## Qué hace ahora

- Registro/login con verificación por código de email
- Perfil corporal por usuario (peso, altura, edad, sexo, actividad, objetivo)
- Cálculo de IMC y % grasa estimado (medidas opcionales)
- Recomendación de objetivos y feedback de realismo
- Escaneo EAN/UPC solo con cámara (sin input manual)
- Importación local/OpenFoodFacts + creación por etiqueta
- Registro de consumo por gramos/% paquete/unidades
- Dashboard con donut de macros y calendario de registros

## Requisitos

- Docker + Docker Compose
- Python 3.11+
- Node 20+
- npm 10+

## Arranque rápido (Make)

```bash
cd /home/daniel/Documentos/nutri-tracker
cp .env.example .env
make reset-db
make setup
```

Luego en dos terminales:

Terminal 1 (API):
```bash
make api-dev
```

Terminal 2 (Expo):
```bash
make mobile-start
```

## Configuración de móvil físico

En `apps/mobile/.env` usa tu IP local (no `localhost`):

```env
EXPO_PUBLIC_API_BASE_URL=http://TU_IP_LOCAL:8000
```

## Flujo recomendado en la app

1. Crear cuenta en `Registro`.
2. Verificar código en `Verificar` (si no hay SMTP, en dev aparece código temporal).
3. Entrar y revisar `Perfil` (IMC/% grasa + recomendación).
4. Ir a `Escanear` y usar cámara con marco de enfoque.
5. Registrar cantidad en modal post-escaneo.
6. Revisar `Dashboard` (donut + calendario + objetivos).

## Variables de entorno nuevas (API)

- `AUTH_SECRET_KEY`
- `AUTH_TOKEN_TTL_HOURS`
- `VERIFICATION_CODE_TTL_MINUTES`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_USE_TLS`
- `EXPOSE_VERIFICATION_CODE` (true en desarrollo)

## Endpoints principales

- `POST /auth/register`
- `POST /auth/resend-code`
- `POST /auth/verify-email`
- `POST /auth/login`
- `GET /me/profile`
- `PUT /me/profile`
- `GET /me/analysis`
- `GET /products/by_barcode/{ean}`
- `POST /products/from_label_photo`
- `POST /intakes`
- `GET /days/{yyyy-mm-dd}/summary`
- `POST /goals/{yyyy-mm-dd}`
- `GET /calendar/{yyyy-mm}`

## Validación backend

```bash
cd services/api
python3 -m pytest -q
python3 -m ruff check .
```
