import re

from fastapi import HTTPException


MAX_MESSAGE_LENGTH = 5000


def validate_username(
    username: str
):
    if not re.fullmatch(
        r"[a-zA-Z0-9_]+",
        username
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Username may only contain "
                "letters, numbers and underscores"
            )
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


def validate_password(
    password: str
):
    if len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail=(
                "Password must be at least "
                "8 characters long"
            )
        )

    if len(password) > 128:
        raise HTTPException(
            status_code=400,
            detail="Password too long"
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