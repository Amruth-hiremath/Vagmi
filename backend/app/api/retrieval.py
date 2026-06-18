from fastapi import APIRouter, Depends, HTTPException

from app.core.security import get_current_user
from app.models.user import User
from app.schemas.retrieval import RetrievalRequest, RetrievalResponse
from app.core.dependencies import get_rag_services
from app.core.logging_config import logger

router = APIRouter(
    prefix="/retrieval",
    tags=["Retrieval"]
)

@router.post(
    "/search",
    response_model=RetrievalResponse
)
def search_documents(
    request: RetrievalRequest,
    current_user: User = Depends(get_current_user),
    rag: dict = Depends(get_rag_services)
):
    try:
        logger.info(f"User {current_user.username} searching for: '{request.query}'")

        top_results = (
        rag["hybrid"].search(
            query=request.query,
            user_id=current_user.id,
            top_k=request.top_k
    )
)

        return RetrievalResponse(results=top_results)

    except Exception as e:
        logger.error(f"Search failed for user {current_user.username}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Retrieval failed: {str(e)}")