import base64
import json
import re
import zlib
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

auth_router = APIRouter(prefix="/auth", tags=["auth"])
session_router = APIRouter(tags=["auth"])

bearer_scheme = HTTPBearer(auto_error=False)


class AuthUser(BaseModel):
    id: int
    email: str
    username: str
    avatar_url: str | None
    sex: Literal["male", "female", "other"]
    birth_date: str | None
    email_verified: bool
    onboarding_completed: bool


class Profile(BaseModel):
    weight_kg: float
    height_cm: float
    age: int | None
    sex: Literal["male", "female", "other"]
    activity_level: Literal["sedentary", "light", "moderate", "active", "athlete"]
    goal_type: Literal["lose", "maintain", "gain"]
    weekly_weight_goal_kg: float | None
    waist_cm: float | None
    neck_cm: float | None
    hip_cm: float | None
    chest_cm: float | None
    arm_cm: float | None
    thigh_cm: float | None
    bmi: float | None
    bmi_category: str
    bmi_color: str
    body_fat_percent: float | None
    body_fat_category: str
    body_fat_color: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"]
    user: AuthUser
    profile: Profile | None


class MeResponse(BaseModel):
    user: AuthUser
    profile: Profile | None


class LoginRequest(BaseModel):
    email: str
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str
    username: str | None = None
    sex: Literal["male", "female", "other"] | None = None
    birth_date: str | None = None


def _stable_user_id(email: str) -> int:
    return zlib.crc32(email.encode("utf-8")) % 1_000_000


def _normalize_email(identifier: str) -> str:
    value = identifier.strip().lower()
    if "@" in value:
        return value
    return f"{value}@mock.nutria.local"


def _username_from_identifier(identifier: str) -> str:
    base = identifier.split("@", 1)[0].strip().lower()
    clean = re.sub(r"[^a-z0-9_]+", "_", base).strip("_")
    return clean or "nutria_user"


def _build_mock_profile(sex: Literal["male", "female", "other"]) -> Profile:
    return Profile(
        weight_kg=75.0,
        height_cm=175.0,
        age=None,
        sex=sex,
        activity_level="moderate",
        goal_type="maintain",
        weekly_weight_goal_kg=None,
        waist_cm=None,
        neck_cm=None,
        hip_cm=None,
        chest_cm=None,
        arm_cm=None,
        thigh_cm=None,
        bmi=24.5,
        bmi_category="Normal",
        bmi_color="#22c55e",
        body_fat_percent=None,
        body_fat_category="Pendiente",
        body_fat_color="#94a3b8",
    )


def _issue_mock_access_token(email: str) -> str:
    return f"mock-token::{email}"


def _email_from_token(token: str) -> str | None:
    prefix = "mock-token::"
    if not token.startswith(prefix):
        return None
    email = token[len(prefix) :].strip().lower()
    return email or None


def _build_auth_response(
    *,
    email: str,
    username: str | None = None,
    sex: Literal["male", "female", "other"] = "other",
    birth_date: str | None = None,
) -> AuthResponse:
    resolved_username = username or _username_from_identifier(email)
    user = AuthUser(
        id=_stable_user_id(email),
        email=email,
        username=resolved_username,
        avatar_url=None,
        sex=sex,
        birth_date=birth_date,
        email_verified=True,
        onboarding_completed=True,
    )
    return AuthResponse(
        access_token=_issue_mock_access_token(email),
        token_type="bearer",
        user=user,
        profile=_build_mock_profile(sex),
    )


def _decode_google_credential_payload(credential: str) -> dict:
    parts = credential.split(".")
    if len(parts) < 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Google credential")

    payload = parts[1]
    padding = "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode(payload + padding)
        data = json.loads(decoded.decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Google credential payload") from exc

    if not isinstance(data, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Google credential payload")
    return data


@auth_router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest) -> AuthResponse:
    # Temporary mock login so the deployed web can authenticate against a public backend.
    # Replace this with a database lookup and password-hash verification later.
    if not payload.email.strip() or not payload.password.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email and password are required")

    email = _normalize_email(payload.email)
    username = _username_from_identifier(payload.email)
    return _build_auth_response(email=email, username=username)


@auth_router.post("/google", response_model=AuthResponse)
def google_auth(payload: GoogleAuthRequest) -> AuthResponse:
    # This is a temporary compatibility layer for the Google Sign-In flow used by the frontend.
    # It decodes the Google credential payload to recover the email, but it does not verify the
    # signature yet. For production-grade auth, validate the token with Google and enforce the
    # expected audience using GOOGLE_WEB_CLIENT_ID.
    data = _decode_google_credential_payload(payload.credential)
    email = str(data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google credential did not include an email")

    username = payload.username or _username_from_identifier(email)
    sex = payload.sex or "other"
    birth_date = payload.birth_date
    return _build_auth_response(email=email, username=username, sex=sex, birth_date=birth_date)


@session_router.get("/me", response_model=MeResponse)
def me(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> MeResponse:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    email = _email_from_token(credentials.credentials)
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    auth_response = _build_auth_response(email=email)
    return MeResponse(user=auth_response.user, profile=auth_response.profile)
