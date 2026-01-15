"""Jira API endpoints."""

from fastapi import APIRouter
from ..models.jira import CreateJiraRequest, CreateJiraResponse
from ..agents.jira_agent import create_jira_ticket

router = APIRouter()


@router.post("/create", response_model=CreateJiraResponse)
async def create_ticket(request: CreateJiraRequest) -> CreateJiraResponse:
    """
    Create a Jira ticket from feature.md content.
    
    Uses the acli command to create a story and optionally subtasks
    from the parsed feature content.
    """
    try:
        result = await create_jira_ticket(
            feature_content=request.feature_content,
            feature_path=request.feature_path,
            project_key=request.project_key,
            create_subtasks=request.create_subtasks,
            subtask_type=request.subtask_type
        )
        return result
    except Exception as e:
        return CreateJiraResponse(
            success=False,
            error=str(e),
            error_type="server_error"
        )
