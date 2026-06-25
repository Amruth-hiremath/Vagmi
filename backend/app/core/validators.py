import re
from fastapi import HTTPException

MAX_MESSAGE_LENGTH = 5000
PASSWORD_MIN_BYTES = 12
PASSWORD_MAX_BYTES = 72

def validate_username(username: str):
    if not re.fullmatch(r"[a-zA-Z0-9_]+", username):
        raise HTTPException(
            status_code=400,
            detail="Username may only contain letters, numbers and underscores"
        )

    if len(username) < 3:
        raise HTTPException(
            status_code=400,
            detail="Username too short"
        )

    if len(username) > 50:
        raise HTTPException(
            status_code=400,
            detail="Username too long"
        )

def validate_password(password: str):
    byte_length = len(password.encode("utf-8"))

    if byte_length < PASSWORD_MIN_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {PASSWORD_MIN_BYTES} characters long"
        )

    if byte_length > PASSWORD_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at most {PASSWORD_MAX_BYTES} characters long"
        )

    if any(ch.isspace() for ch in password):
        raise HTTPException(
            status_code=400,
            detail="Password cannot contain spaces"
        )

    if not re.search(r"[a-z]", password):
        raise HTTPException(
            status_code=400,
            detail="Password must include at least one lowercase letter"
        )

    if not re.search(r"[A-Z]", password):
        raise HTTPException(
            status_code=400,
            detail="Password must include at least one uppercase letter"
        )

    if not re.search(r"\d", password):
        raise HTTPException(
            status_code=400,
            detail="Password must include at least one number"
        )

    if not re.search(r"[^A-Za-z0-9]", password):
        raise HTTPException(
            status_code=400,
            detail="Password must include at least one special character"
        )


def validate_room_name(
    name: str
):
    name = name.strip()

    if len(name) < 1:
        raise HTTPException(
            status_code=400,
            detail="Room name cannot be empty"
        )

    if len(name) > 100:
        raise HTTPException(
            status_code=400,
            detail="Room name too long"
        )


def validate_message(
    message: str
):
    if len(message.strip()) == 0:
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty"
        )

    if len(message) > MAX_MESSAGE_LENGTH:
        raise HTTPException(
            status_code=400,
            detail="Message too long"
        )