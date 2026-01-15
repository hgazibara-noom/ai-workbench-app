"""Analyze feature API endpoints."""

from fastapi import APIRouter, HTTPException
from ..models.analyze import (
    StartAnalysisRequest, StartAnalysisResponse,
    SubmitAnswersRequest, AnalysisStatus
)
from ..agents import analyze_agent

router = APIRouter()


@router.post("/start", response_model=StartAnalysisResponse)
async def start_analysis(request: StartAnalysisRequest):
    """
    Start a new feature analysis session.
    
    Returns a session ID and WebSocket URL for streaming updates.
    """
    # Placeholder callback - real one set when WebSocket connects
    async def placeholder_output(text: str):
        pass
    
    try:
        session_id = await analyze_agent.start_analysis(
            workspace_path=request.workspace_path,
            feature_path=request.feature_path,
            on_output=placeholder_output
        )
        
        return StartAnalysisResponse(
            session_id=session_id,
            status=AnalysisStatus.STARTING,
            websocket_url=f"/api/analyze/ws/{session_id}"
        )
    except analyze_agent.AnalyzeAgentError as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{session_id}/answers")
async def submit_answers(session_id: str, request: SubmitAnswersRequest):
    """Submit answers to clarifying questions."""
    session = analyze_agent.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session.status != AnalysisStatus.AWAITING_ANSWERS:
        raise HTTPException(
            status_code=400, 
            detail=f"Session not awaiting answers (status: {session.status})"
        )
    
    async def stream_output(text: str):
        # For REST endpoint, output is not streamed
        # WebSocket streaming will be added in Agent 2
        pass
    
    success = await analyze_agent.submit_answers(
        session_id=session_id,
        answers=request.answers,
        on_output=stream_output
    )
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to submit answers")
    
    return {"status": "processing", "message": "Updating feature specification..."}


@router.post("/{session_id}/cancel")
async def cancel_analysis(session_id: str):
    """Cancel an in-progress analysis."""
    session = analyze_agent.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    success = await analyze_agent.cancel_analysis(session_id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to cancel analysis")
    
    return {"status": "cancelled"}


@router.get("/{session_id}/status")
async def get_status(session_id: str):
    """Get current analysis session status."""
    session = analyze_agent.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {
        "session_id": session.session_id,
        "status": session.status.value,
        "questions": [{"id": q.id, "title": q.title, "context": q.context} 
                      for q in session.questions] if session.questions else None
    }
