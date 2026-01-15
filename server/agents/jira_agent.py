"""AI Agent for creating Jira tickets using acli command."""

import asyncio
import re
from typing import List

from ..models.jira import CreateJiraResponse, StoryResult, SubtaskResult

JIRA_BASE_URL = "https://noomhq.atlassian.net/browse"


class AcliError(Exception):
    """Error from acli command."""
    pass


async def create_jira_ticket(
    feature_content: str,
    feature_path: str,
    project_key: str,
    create_subtasks: bool,
    subtask_type: str
) -> CreateJiraResponse:
    """
    Create a Jira ticket using acli command.
    
    Args:
        feature_content: The raw markdown content of the feature.md file
        feature_path: The relative path to the feature.md file
        project_key: The Jira project key (e.g., "AWB")
        create_subtasks: Whether to create subtasks from functional requirements
        subtask_type: The issue type for subtasks (e.g., "Sub-task")
    
    Returns:
        CreateJiraResponse with the created ticket information
    """
    # Parse feature content
    title = extract_title(feature_content)
    overview = extract_section(feature_content, "Overview")
    success_criteria = extract_section(feature_content, "Success Criteria")
    functional_requirements = extract_functional_requirements(feature_content)
    
    # Build story description
    description = build_description(overview, success_criteria)
    
    # Create parent story
    try:
        story_key = await run_acli_create_issue(
            project_key=project_key,
            issue_type="Story",
            summary=title,
            description=description
        )
    except AcliError as e:
        return CreateJiraResponse(
            success=False,
            error=str(e),
            error_type="jira_error"
        )
    
    story = StoryResult(
        key=story_key,
        summary=title,
        url=f"{JIRA_BASE_URL}/{story_key}"
    )
    
    # Create subtasks if requested
    subtasks: List[SubtaskResult] = []
    if create_subtasks and functional_requirements:
        for fr in functional_requirements:
            try:
                subtask_key = await run_acli_create_subtask(
                    project_key=project_key,
                    parent_key=story_key,
                    issue_type=subtask_type,
                    summary=fr
                )
                subtasks.append(SubtaskResult(
                    key=subtask_key,
                    summary=fr,
                    success=True
                ))
            except AcliError as e:
                subtasks.append(SubtaskResult(
                    key=None,
                    summary=fr,
                    success=False,
                    error=str(e)
                ))
    
    # Build Jira link markdown
    jira_link = f"**Jira**: [{story_key}]({JIRA_BASE_URL}/{story_key})"
    
    return CreateJiraResponse(
        success=True,
        story=story,
        subtasks=subtasks,
        jira_link_markdown=jira_link
    )


async def run_acli_create_issue(
    project_key: str,
    issue_type: str,
    summary: str,
    description: str
) -> str:
    """
    Run acli to create an issue and return the issue key.
    
    Uses the acli jira workitem create command with the verified syntax:
    acli jira workitem create --summary "..." --project "..." --type "..." --description "..."
    """
    # Build acli command using the correct syntax
    cmd = [
        "acli", "jira", "workitem", "create",
        "--project", project_key,
        "--type", issue_type,
        "--summary", summary,
        "--description", description,
        "--json"  # Get JSON output for easier parsing
    ]
    
    result = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await result.communicate()
    
    if result.returncode != 0:
        error_msg = stderr.decode().strip() or stdout.decode().strip()
        raise AcliError(f"Failed to create issue: {error_msg}")
    
    # Parse issue key from output
    output = stdout.decode()
    
    # Try to find issue key pattern in output (e.g., AWB-123)
    key_match = re.search(r'([A-Z]+-\d+)', output)
    if key_match:
        return key_match.group(1)
    
    raise AcliError(f"Could not parse issue key from output: {output}")


async def run_acli_create_subtask(
    project_key: str,
    parent_key: str,
    issue_type: str,
    summary: str
) -> str:
    """
    Run acli to create a subtask linked to parent.
    
    Uses the acli jira workitem create command with --parent flag.
    """
    cmd = [
        "acli", "jira", "workitem", "create",
        "--project", project_key,
        "--type", issue_type,
        "--parent", parent_key,
        "--summary", summary,
        "--json"
    ]
    
    result = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await result.communicate()
    
    if result.returncode != 0:
        error_msg = stderr.decode().strip() or stdout.decode().strip()
        raise AcliError(f"Failed to create subtask: {error_msg}")
    
    output = stdout.decode()
    key_match = re.search(r'([A-Z]+-\d+)', output)
    if key_match:
        return key_match.group(1)
    
    raise AcliError(f"Could not parse subtask key from output: {output}")


def extract_title(content: str) -> str:
    """Extract the main title (first # heading)."""
    match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
    return match.group(1).strip() if match else "Untitled Feature"


def extract_section(content: str, section_name: str) -> str:
    """Extract content under a ## section heading."""
    pattern = rf'^##\s+{re.escape(section_name)}\s*\n(.*?)(?=^##|\Z)'
    match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
    if match:
        return match.group(1).strip()
    return ""


def extract_functional_requirements(content: str) -> List[str]:
    """Extract functional requirements (- [ ] FR-X: ...) lines."""
    pattern = r'-\s*\[\s*\]\s*(FR-\d+:\s*.+)$'
    matches = re.findall(pattern, content, re.MULTILINE)
    return matches


def build_description(overview: str, success_criteria: str) -> str:
    """Build Jira description from overview and success criteria."""
    parts = []
    
    if overview:
        parts.append(overview)
    
    if success_criteria:
        parts.append("\n\n*Acceptance Criteria:*\n" + success_criteria)
    
    return "\n".join(parts) if parts else "See linked feature specification."
