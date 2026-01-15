"""Analyze feature models."""

from pydantic import BaseModel
from typing import List, Optional
from enum import Enum


class AnalysisStatus(str, Enum):
    """Status of an analysis session."""
    STARTING = "starting"
    RUNNING = "running"
    AWAITING_ANSWERS = "awaiting_answers"
    PROCESSING_ANSWERS = "processing_answers"
    COMPLETE = "complete"
    ERROR = "error"
    CANCELLED = "cancelled"


class StartAnalysisRequest(BaseModel):
    """Request body for starting a feature analysis."""
    workspace_path: str  # Full path to workspace
    feature_path: str    # Relative path: "projects/ai-workbench/features/analyze-feature"


class StartAnalysisResponse(BaseModel):
    """Response from starting an analysis session."""
    session_id: str
    status: AnalysisStatus
    websocket_url: str


class Question(BaseModel):
    """A clarifying question from the analysis agent."""
    id: int
    title: str
    context: Optional[str] = None


class Answer(BaseModel):
    """An answer to a clarifying question."""
    question_id: int
    answer: str


class SubmitAnswersRequest(BaseModel):
    """Request body for submitting answers to questions."""
    answers: List[Answer]


class AnalysisSession:
    """
    In-memory session state container (not a Pydantic model for mutability).
    
    Tracks the state of an analysis session including:
    - Session identification and paths
    - Current status
    - Questions parsed from agent output
    - User answers
    - Accumulated output buffer
    """
    def __init__(self, session_id: str, workspace_path: str, feature_path: str):
        self.session_id = session_id
        self.workspace_path = workspace_path
        self.feature_path = feature_path
        self.status = AnalysisStatus.STARTING
        self.questions: List[Question] = []
        self.answers: List[Answer] = []
        self.output_buffer = ""
