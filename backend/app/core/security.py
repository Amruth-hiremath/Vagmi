from datetime import datetime, timezone
from datetime import timedelta
from jose import jwt
from jose import JWTError
from passlib.context import CryptContext
from fastapi import Depends
from fastapi import HTTPException
from fastapi.security import HTTPBearer
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User
from app.core.config import SECRET_KEY
from app.core.config import ACCESS_TOKEN_EXPIRE_HOURS

security = HTTPBearer()

# hashing algorithm for storing passwords
ALGORITHM = "HS256"

# password hashing context using bcrypt, which is a secure hashing algorithm designed for password storage. It automatically handles salting and is computationally intensive to resist brute-force attacks.
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

# function to hash a plain password using the defined password hashing context
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

# verify and match a plain password against hashed password
def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:
    return pwd_context.verify(
        plain_password,
        hashed_password
    )

# function to create a JWT access token with the given data and expiration time, using the defined secret key and algorithm.
def create_access_token(data: dict) -> str:
    payload = data.copy()

    expire = datetime.now(timezone.utc) + timedelta(
        hours=ACCESS_TOKEN_EXPIRE_HOURS
    )

    payload.update(
        {"exp": expire}
    )

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )

# function to decode and verify a JWT token, returning the payload if valid or None if invalid.
def decode_token(token: str):
    try:
        return jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

    except JWTError:
        return None

# dependency function to get the current logged in user from the JWT token in the request 
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = credentials.credentials

    payload = decode_token(token)

    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid token"
        )

    user_id = payload.get("sub")

    user = (
        db.query(User)
        .filter(User.id == int(user_id))
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="User not found"
        )

    return user