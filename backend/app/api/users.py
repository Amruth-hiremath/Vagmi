from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_current_user

from app.models.user import User

from app.schemas.user import UserSearchResponse


router = APIRouter(
    prefix="/users",
    tags=["Users"]
)


@router.get(
    "/search",
    response_model=list[UserSearchResponse]
)
def search_users(
    query: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    users = (
        db.query(User)
        .filter(
            User.username.ilike(f"%{query}%")
        )
        .filter(
            User.id != current_user.id
        )
        .limit(20)
        .all()
    )

    return users