from datetime import datetime

import jwt
from pydantic import BaseModel, Field, SecretStr, ValidationError

from digital_lluc.domain import InvalidAuthTokenError, UserId

_AUDIENCE = "digital-lluc-api"
_ALGORITHM = "HS256"


class _Claims(BaseModel):
    sub: str = Field(min_length=1)
    exp: int


def verify_auth_token(token: str, secret: SecretStr, now: datetime) -> UserId:
    """Verifies a token minted by the frontend after Auth.js login.

    Post: returns the verified user id (the login email) carried in `sub`.
    """
    try:
        payload = jwt.decode(
            token,
            secret.get_secret_value(),
            algorithms=[_ALGORITHM],
            audience=_AUDIENCE,
            options={"require": ["sub", "exp", "aud"], "verify_exp": False},
        )
        claims = _Claims.model_validate(payload)
    except (jwt.InvalidTokenError, ValidationError) as error:
        raise InvalidAuthTokenError("expected an HS256 token for this API") from error
    if claims.exp > now.timestamp():
        return UserId(claims.sub)
    raise InvalidAuthTokenError(f"token expired at {claims.exp}, now is {now.timestamp():.0f}")
