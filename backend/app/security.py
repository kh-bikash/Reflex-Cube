"""Password hashing and JWT issuance.

Kept separate from the auth routes so the trainer, scripts and tests can verify
a token without importing FastAPI routing.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt

from .config import ACCESS_TOKEN_TTL_MINUTES, JWT_ALGORITHM, JWT_SECRET
from .logging_config import get_logger

logger = get_logger(__name__)

#: bcrypt truncates at 72 bytes and raises above that in 4.1+. Long passwords
#: are pre-hashed so the full input contributes to the digest.
_BCRYPT_MAX_BYTES = 72


class TokenError(Exception):
    """Raised when a token is missing, malformed, expired or not ours."""


def _prepare(password: str) -> bytes:
    """Return the byte string bcrypt should hash."""
    raw = password.encode("utf-8")
    if len(raw) > _BCRYPT_MAX_BYTES:
        # base64 of a sha256 digest is 44 bytes, comfortably under the limit,
        # and depends on every byte of the original password.
        import base64

        return base64.b64encode(hashlib.sha256(raw).digest())
    return raw


def hash_password(password: str) -> str:
    """Hash a password for storage."""
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Check a password against a stored hash. False on any malformed hash."""
    try:
        return bcrypt.checkpw(_prepare(password), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(subject: str, extra: dict[str, Any] | None = None) -> str:
    """Issue a signed JWT for `subject` (the user id)."""
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES),
        "jti": secrets.token_urlsafe(8),
        **(extra or {}),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Verify and decode a token.

    Raises:
        TokenError: if the token is expired, tampered with, or not a token we
            issued.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("Token is invalid") from exc

    if not payload.get("sub"):
        raise TokenError("Token has no subject")
    return payload
