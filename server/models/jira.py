"""Pydantic models for Jira API endpoints."""

from pydantic import BaseModel
from typing import List, Optional


class CreateJiraRequest(BaseModel):
    """Request body for creating a Jira ticket from feature content."""
    feature_content: str
    feature_path: str
    project_key: str
    create_subtasks: bool = True
    subtask_type: str = "Sub-task"


class SubtaskResult(BaseModel):
    """Result of creating a single subtask."""
    key: Optional[str] = None
    summary: str
    success: bool
    error: Optional[str] = None


class StoryResult(BaseModel):
    """Result of creating the parent story."""
    key: str
    summary: str
    url: str


class CreateJiraResponse(BaseModel):
    """Response from creating a Jira ticket."""
    success: bool
    story: Optional[StoryResult] = None
    subtasks: List[SubtaskResult] = []
    jira_link_markdown: Optional[str] = None
    error: Optional[str] = None
    error_type: Optional[str] = None
