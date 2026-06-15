from fastapi import (
    APIRouter,
    Depends
)

from app.core.security import (
    get_current_user
)

from app.models.user import User

from app.schemas.retrieval import (
    RetrievalRequest,
    RetrievalResponse
)

from app.services.retrieval_service import (
    RetrievalService
)


router = APIRouter(
    prefix="/retrieval",
    tags=["Retrieval"]
)

retrieval_service = (
    RetrievalService()
)


@router.post(
    "/search",
    response_model=
        RetrievalResponse
)
def search(
    request: RetrievalRequest,
    current_user: User = Depends(
        get_current_user
    )
):

    results = (
        retrieval_service.search(
            query=request.query,
            user_id=current_user.id,
            top_k=request.top_k
        )
    )

    return {
        "results": results
    }