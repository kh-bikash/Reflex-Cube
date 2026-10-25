"""Registration, sign-in and account settings."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import ACCESS_TOKEN_TTL_MINUTES, ALLOW_REGISTRATION, MIN_PASSWORD_LENGTH
from ..db import get_db
from ..deps import CurrentUser
from ..logging_config import get_logger
from ..models import User
from ..schemas import (
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    UpdateProfileRequest,
    UserProfile,
)
from ..security import create_access_token, hash_password, verify_password

logger = get_logger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Auth"])

#: Returned for both "no such email" and "wrong password", so the endpoint
#: cannot be used to discover which addresses have accounts.
_BAD_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Incorrect email or password",
    headers={"WWW-Authenticate": "Bearer"},
)


def _profile(user: User) -> UserProfile:
    return UserProfile(
        id=user.id,
        email=user.email,
        display_name=user.display_name or "",
        created_at=user.created_at,
        has_hf_token=bool(user.hf_token),
    )


def _issue(user: User) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user.id, {"email": user.email}),
        token_type="bearer",
        expires_in=ACCESS_TOKEN_TTL_MINUTES * 60,
        user=_profile(user),
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(req: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    """Create an account and return a token for it."""
    if not ALLOW_REGISTRATION:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Registration is closed")

    if len(req.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
        )

    email = req.email.lower().strip()
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        display_name=(req.display_name or email.split("@")[0]).strip(),
        hashed_password=hash_password(req.password),
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # The unique index is the authority: a check-then-insert would race.
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists",
        ) from None

    db.refresh(user)
    logger.info("Registered %s", email)
    return _issue(user)


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    """Exchange email and password for an access token."""
    email = req.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()

    if user is None:
        # Hash anyway so a missing account does not answer measurably faster
        # than a wrong password.
        verify_password(req.password, "$2b$12$" + "." * 53)
        raise _BAD_CREDENTIALS

    if not verify_password(req.password, user.hashed_password):
        raise _BAD_CREDENTIALS
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return _issue(user)


@router.get("/me", response_model=UserProfile)
def me(user: CurrentUser) -> UserProfile:
    """The signed-in account."""
    return _profile(user)


@router.patch("/me", response_model=UserProfile)
def update_me(
    req: UpdateProfileRequest, user: CurrentUser, db: Session = Depends(get_db)
) -> UserProfile:
    """Update the display name, the Hugging Face token, or the password."""
    if req.display_name is not None:
        user.display_name = req.display_name.strip()

    if req.hf_token is not None:
        # Empty string clears it; the value is never read back out.
        user.hf_token = req.hf_token.strip() or None

    if req.new_password is not None:
        if not req.current_password or not verify_password(
            req.current_password, user.hashed_password
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Current password is incorrect"
            )
        if len(req.new_password) < MIN_PASSWORD_LENGTH:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters",
            )
        user.hashed_password = hash_password(req.new_password)

    db.commit()
    db.refresh(user)
    return _profile(user)
