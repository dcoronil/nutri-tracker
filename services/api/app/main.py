import logging
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import get_settings
from app.services.openfoodfacts import close_openfoodfacts_client

logger = logging.getLogger(__name__)
LEGACY_SOCIAL_MEDIA_ROOT = Path("/tmp/nutri-tracker/social-media")


def _migrate_legacy_social_media(legacy_root: Path, target_root: Path) -> None:
    if target_root.resolve() == legacy_root.resolve():
        return
    if not legacy_root.exists():
        return
    target_root.mkdir(parents=True, exist_ok=True)
    for path in legacy_root.rglob("*"):
        if not path.is_file():
            continue
        relative_path = path.relative_to(legacy_root)
        destination = target_root / relative_path
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            shutil.copy2(path, destination)
        except OSError:
            logger.warning("Could not migrate social media file %s", path, exc_info=True)


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        await close_openfoodfacts_client()

    app = FastAPI(title="Nutri Tracker API", version="0.1.0", lifespan=lifespan)
    settings = get_settings()
    social_media_root = Path(settings.social_media_storage_dir).expanduser()
    social_media_root.mkdir(parents=True, exist_ok=True)
    _migrate_legacy_social_media(LEGACY_SOCIAL_MEDIA_ROOT.expanduser(), social_media_root)

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
