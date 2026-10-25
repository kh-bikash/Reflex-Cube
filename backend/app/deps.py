"""Shared FastAPI dependencies: the current user, and auth enforcement."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import REQUIRE_AUTH
from .db import get_db
from .models import User
from .security import TokenError, decode_access_token

#: `auto_error=False` so an anonymous request reaches the dependency and can be
#: allowed through when REQUIRE_AUTH is off, instead of being rejected by the
#: security scheme first.
bearer_scheme = HTTPBearer(auto_error=False, description="JWT from /api/auth/login")

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def _user_from_token(token: str, db: Session) -> User:
    try:
        payload = decode_access_token(token)
    except TokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    user = db.get(User, payload["sub"])
    if user is None:
        raise _UNAUTHORIZED
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    return user


def get_current_user_optional(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)] = None,
    db: Session = Depends(get_db),
) -> User | None:
    """The signed-in user, or `None` for an anonymous request.

    An invalid token is still an error: it means the client thinks it is signed
    in and should be told otherwise, rather than silently downgraded.
    """
    if credentials is None:
        return None
    return _user_from_token(credentials.credentials, db)


def get_current_user(
    user: Annotated[User | None, Depends(get_current_user_optional)],
) -> User:
    """The signed-in user. 401 if there isn't one."""
    if user is None:
        raise _UNAUTHORIZED
    return user


def require_user(
    user: Annotated[User | None, Depends(get_current_user_optional)],
) -> User | None:
    """Enforce authentication only when `REQUIRE_AUTH` is on.

    Lets a single-user local install run without signing in, while a public
    deployment (the default) protects everything that costs CPU.
    """
    if REQUIRE_AUTH and user is None:
        raise _UNAUTHORIZED
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_current_user_optional)]
RequiredUser = Annotated[User | None, Depends(require_user)]
