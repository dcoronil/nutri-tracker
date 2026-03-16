SHELL := /bin/bash
.DEFAULT_GOAL := help

PROJECT_ROOT := $(CURDIR)
ENV_FILE := $(PROJECT_ROOT)/.env
API_DIR := $(PROJECT_ROOT)/services/api
MOBILE_DIR := $(PROJECT_ROOT)/apps/mobile
INFRA_DIR := $(PROJECT_ROOT)/infra
RUN_DIR := $(PROJECT_ROOT)/.run
API_PID_FILE := $(RUN_DIR)/api.pid

ifeq (,$(wildcard $(ENV_FILE)))
$(warning No existe .env en la raiz. Ejecuta: make env)
endif

.PHONY: help env check-tools setup up down reset-db logs ps \
	api-install api-migrate api-run api-dev api-test api-lint api-health \
	api-stop mobile-install mobile-start mobile-web-env mobile-stop web-dev

help:
	@echo "Comandos principales:"
	@echo "  make env            # Crea .env desde .env.example"
	@echo "  make setup          # Infra + deps API + deps mobile + migraciones"
	@echo "  make up             # Levanta solo Postgres"
	@echo "  make api-dev        # Instala deps, migra y arranca API"
	@echo "  make web-dev        # Levanta Postgres + API local + Expo Web"
	@echo "  make mobile-start   # Arranca Expo"
	@echo "  make down           # Baja Postgres"
	@echo "  make reset-db       # Reinicia Postgres borrando volumen"
	@echo "  make logs           # Logs de Postgres"
	@echo "  make api-test       # Pytest backend"
	@echo "  make api-lint       # Ruff backend"

env:
	@if [ ! -f "$(ENV_FILE)" ]; then \
		cp "$(PROJECT_ROOT)/.env.example" "$(ENV_FILE)"; \
		echo "Creado $(ENV_FILE)"; \
	else \
		echo "$(ENV_FILE) ya existe"; \
	fi

check-tools:
	@command -v docker >/dev/null || (echo "Falta docker" && exit 1)
	@command -v python3 >/dev/null || (echo "Falta python3" && exit 1)
	@command -v npm >/dev/null || (echo "Falta npm" && exit 1)

setup: env up api-install api-migrate mobile-install
	@echo "Setup listo."

up: env
	@cd "$(INFRA_DIR)" && docker compose --env-file "$(ENV_FILE)" up -d
	@cd "$(INFRA_DIR)" && docker compose --env-file "$(ENV_FILE)" ps

down:
	@cd "$(INFRA_DIR)" && docker compose --env-file "$(ENV_FILE)" down

reset-db:
	@cd "$(INFRA_DIR)" && docker compose --env-file "$(ENV_FILE)" down -v
	@cd "$(INFRA_DIR)" && docker compose --env-file "$(ENV_FILE)" up -d
	@cd "$(INFRA_DIR)" && docker compose --env-file "$(ENV_FILE)" ps

logs:
	@cd "$(INFRA_DIR)" && docker compose --env-file "$(ENV_FILE)" logs -f postgres

ps:
	@cd "$(INFRA_DIR)" && docker compose --env-file "$(ENV_FILE)" ps

api-install:
	@cd "$(API_DIR)" && python3 -m pip install --break-system-packages -e '.[dev]'

api-migrate:
	@cd "$(API_DIR)" && set -a && source "$(ENV_FILE)" && set +a && python3 -m alembic upgrade head

api-run:
	@cd "$(API_DIR)" && set -a && source "$(ENV_FILE)" && set +a && python3 -m uvicorn app.main:app --host 0.0.0.0 --port $$API_PORT --reload

api-dev: api-install api-migrate api-run

api-stop:
	@mkdir -p "$(RUN_DIR)"
	@if [ -f "$(API_PID_FILE)" ]; then \
		API_PID=$$(cat "$(API_PID_FILE)"); \
		if kill -0 $$API_PID >/dev/null 2>&1; then \
			kill $$API_PID >/dev/null 2>&1 || true; \
			echo "API local detenida ($$API_PID)"; \
		fi; \
		rm -f "$(API_PID_FILE)"; \
	fi
	@if docker ps --format '{{.Names}}' | grep -qx 'nutri-api'; then \
		docker stop nutri-api >/dev/null; \
		echo "Contenedor nutri-api detenido"; \
	fi
	@fuser -k 8000/tcp >/dev/null 2>&1 || true

api-test:
	@cd "$(API_DIR)" && python3 -m pytest -q

api-lint:
	@cd "$(API_DIR)" && python3 -m ruff check .

api-health:
	@curl -sS http://localhost:8000/health || true

mobile-install:
	@cd "$(MOBILE_DIR)" && npm install

mobile-web-env: env
	@mkdir -p "$(RUN_DIR)"
	@set -a && source "$(ENV_FILE)" && set +a && \
	printf 'EXPO_PUBLIC_API_BASE_URL=%s\nEXPO_PUBLIC_DEV_SETTINGS=false\nEXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=%s\n' "$${EXPO_PUBLIC_API_BASE_URL:-http://localhost:8000}" "$${EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID:-}" > "$(MOBILE_DIR)/.env"
	@echo "Configurado $(MOBILE_DIR)/.env para web"

mobile-start: mobile-install mobile-web-env
	@cd "$(MOBILE_DIR)" && npm run start

mobile-stop:
	@fuser -k 8081/tcp >/dev/null 2>&1 || true
	@fuser -k 8082/tcp >/dev/null 2>&1 || true
	@fuser -k 19000/tcp >/dev/null 2>&1 || true
	@fuser -k 19001/tcp >/dev/null 2>&1 || true

web-dev: up api-stop mobile-stop api-install api-migrate mobile-install mobile-web-env
	@mkdir -p "$(RUN_DIR)"
	@cd "$(API_DIR)" && set -a && source "$(ENV_FILE)" && set +a && \
	nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port $$API_PORT --reload > "$(RUN_DIR)/api.log" 2>&1 & \
	echo $$! > "$(API_PID_FILE)"
	@bash -lc 'for i in {1..30}; do if curl -fsS http://localhost:8000/health >/dev/null 2>&1; then exit 0; fi; sleep 1; done; exit 1'
	@echo "API lista en http://localhost:8000"
	@echo "Abriendo Expo Web..."
	@cd "$(MOBILE_DIR)" && npx expo start --web --port 8081 --clear
