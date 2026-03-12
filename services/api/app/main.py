from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import get_settings
from app.services.openfoodfacts import close_openfoodfacts_client


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        await close_openfoodfacts_client()

    app = FastAPI(title="Nutri Tracker API", version="0.1.0", lifespan=lifespan)
    settings = get_settings()
    social_media_root = Path(settings.social_media_storage_dir).expanduser()
    social_media_root.mkdir(parents=True, exist_ok=True)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.mount("/media", StaticFiles(directory=social_media_root), name="media")
    app.include_router(router)
    return app


app = create_app()
