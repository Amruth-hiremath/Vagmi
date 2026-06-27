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
    query: str | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    users_query = (
        db.query(User)
        .filter(
            User.id != current_user.id
        )
    )

    if query and query.strip():
        users_query = users_query.filter(
            User.username.ilike(
                f"%{query.strip()}%"
            )
        )

    users = (
        users_query
        .order_by(User.username)
        .limit(50)
        .all()
    )

    return users