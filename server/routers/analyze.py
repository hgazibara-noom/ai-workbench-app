"""Analyze feature API endpoints."""

import asyncio
import json
from typing import Dict

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from ..models.analyze import (
    StartAnalysisRequest, StartAnalysisResponse,
    SubmitAnswersRequest, AnalysisStatus
)
from ..agents import analyze_agent

router = APIRouter()

# Store active WebSocket connections by session ID
_active_connections: Dict[str, WebSocket] = {}

# Store output callbacks that push to WebSocket
_output_callbacks: Dict[str, callable] = {}


@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time analysis updates.
    
    Message types sent to client:
    - {"type": "output", "content": "..."} - Streaming agent output
    - {"type": "questions", "items": [...]} - Parsed questions ready
    - {"type": "complete", "files": [...]} - Analysis complete
    - {"type": "error", "message": "..."} - Error occurred
    - {"type": "cancelled"} - Analysis was cancelled
    
    Messages from client:
    - {"action": "cancel"} - Request to cancel analysis
    """
    await websocket.accept()
    _active_connections[session_id] = websocket
    
    session = analyze_agent.get_session(session_id)
    if not session:
        await websocket.send_json({"type": "error", "message": "Session not found"})
        await websocket.close()
        _active_connections.pop(session_id, None)
        return
    
    # Create output callback that streams to this WebSocket
    async def stream_to_client(text: str):
        """Stream output to the connected WebSocket client."""
        try:
            ws = _active_connections.get(session_id)
            if not ws:
                return
            
            # Check for special markers in output
            if "__QUESTIONS_READY__:" in text:
                # Questions parsed, send them
                current_session = analyze_agent.get_session(session_id)
                if current_session and current_session.questions:
                    await ws.send_json({
                        "type": "questions",
                        "items": [{"id": q.id, "title": q.title, "context": q.context} 
                                  for q in current_session.questions]
                    })
            elif "__ANALYSIS_COMPLETE__" in text:
                await ws.send_json({
                    "type": "complete",
                    "files": ["feature.md", "implementation-plan.md"]
                })
            elif "__ERROR__:" in text:
                error_msg = text.split("__ERROR__:")[1].strip()
                await ws.send_json({
                    "type": "error",
                    "message": error_msg
                })
            else:
                # Regular output - only send non-empty content
                content = text.rstrip('\n')
                if content:
                    await ws.send_json({"type": "output", "content": text})
        except Exception as e:
            print(f"WebSocket send error for session {session_id}: {e}")
    
    # Store the callback for this session (both locally and in agent module)
    _output_callbacks[session_id] = stream_to_client
    analyze_agent.set_output_callback(session_id, stream_to_client)
    
    try:
        # Keep the connection alive and listen for client messages
        while True:
            try:
                # Wait for client messages (with a short timeout to check session status)
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=1.0
                )
                message = json.loads(data)
                
                if message.get("action") == "cancel":
                    await analyze_agent.cancel_analysis(session_id)
                    await websocket.send_json({"type": "cancelled"})
                    break
                    
            except asyncio.TimeoutError:
                # Check if session has reached a terminal state
                current_session = analyze_agent.get_session(session_id)
                if current_session:
                    if current_session.status == AnalysisStatus.COMPLETE:
                        # Session completed - send final message if not already sent
                        break
                    elif current_session.status == AnalysisStatus.ERROR:
                        # Session errored
                        break
                    elif current_session.status == AnalysisStatus.CANCELLED:
                        break
                # Otherwise, continue waiting for messages
                continue
                
    except WebSocketDisconnect:
        print(f"WebSocket disconnected: {session_id}")
    except Exception as e:
        print(f"WebSocket error for session {session_id}: {e}")
    finally:
        # Clean up connection tracking
        _active_connections.pop(session_id, None)
        _output_callbacks.pop(session_id, None)


@router.post("/start", response_model=StartAnalysisResponse)
async def start_analysis(request: StartAnalysisRequest):
    """
    Start a new feature analysis session.
    
    Returns a session ID and WebSocket URL for streaming updates.
    """
    # Create a callback that will use the WebSocket if connected
    async def on_output(text: str):
        """Route output to WebSocket if connected."""
        callback = _output_callbacks.get(None)  # Will be replaced with actual session ID
        if callback:
            await callback(text)
    
    try:
        session_id = await analyze_agent.start_analysis(
            workspace_path=request.workspace_path,
            feature_path=request.feature_path,
            on_output=on_output
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
        """Stream output to WebSocket if connected."""
        websocket = _active_connections.get(session_id)
        if websocket:
            try:
                if "__ANALYSIS_COMPLETE__" in text:
                    await websocket.send_json({
                        "type": "complete",
                        "files": ["feature.md", "implementation-plan.md"]
                    })
                elif "__ERROR__:" in text:
                    error_msg = text.split("__ERROR__:")[1].strip()
                    await websocket.send_json({"type": "error", "message": error_msg})
                else:
                    content = text.rstrip('\n')
                    if content:
                        await websocket.send_json({"type": "output", "content": text})
            except Exception as e:
                print(f"WebSocket send error in submit_answers for {session_id}: {e}")
    
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
