from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.auth import router as auth_router
from routers.health import router as health_router

load_dotenv()

app = FastAPI(
    title="NutrIA API",
    version="0.1.0",
    description="Minimal FastAPI backend ready to deploy on Render for the NutrIA web client.",
)

# Allow the Cloudflare Pages frontend and local development origins.
# If you later add a custom domain for the frontend, append it here.
allowed_origins = [
    "https://nutria-web.pages.dev",
    "http://localhost:3000",
    "http://localhost:19006",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {"status": "NutrIA API running"}


# Health and auth are registered as separate routers so the app can grow by domain.
# Next natural steps:
# - add a database module and dependency injection for sessions/connections
# - add JWT token issuance and verification utilities
# - add a Google auth service that validates the Google credential and maps it to a user
app.include_router(health_router)
app.include_router(auth_router)
