from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginUser(BaseModel):
    email: str


class LoginResponse(BaseModel):
    token: str
    user: LoginUser


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest) -> LoginResponse:
    # Temporary mock login so the frontend can be wired to a real public backend.
    # Replace this with a database lookup once you add persistent storage.
    # Typical next step: query a users table and verify a password hash.

    # JWT auth can be added here by generating a signed access token instead of the mock value.
    # Google OAuth can be added in a sibling endpoint like /auth/google that validates the Google ID token
    # and either creates or loads the matching user before issuing the same JWT/session shape.
    return LoginResponse(token="test-token", user=LoginUser(email=payload.email))
