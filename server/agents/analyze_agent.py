"""AI Agent for analyzing features using cursor-agent CLI."""

import asyncio
import re
import uuid
from typing import Dict, List, Callable, Optional
from pathlib import Path

from ..models.analyze import AnalysisSession, AnalysisStatus, Question


class AnalyzeAgentError(Exception):
    """Error from cursor-agent command."""
    pass


# In-memory session storage
_sessions: Dict[str, AnalysisSession] = {}
_processes: Dict[str, asyncio.subprocess.Process] = {}

# Output callbacks that can be updated after session starts (e.g., when WebSocket connects)
_output_callbacks: Dict[str, Callable[[str], None]] = {}


def set_output_callback(session_id: str, callback: Callable[[str], None]) -> None:
    """Set or update the output callback for a session."""
    _output_callbacks[session_id] = callback


def get_output_callback(session_id: str) -> Optional[Callable[[str], None]]:
    """Get the current output callback for a session."""
    return _output_callbacks.get(session_id)


def get_session(session_id: str) -> Optional[AnalysisSession]:
    """Get session by ID."""
    return _sessions.get(session_id)


async def start_analysis(
    workspace_path: str,
    feature_path: str,
    on_output: Callable[[str], None]
) -> str:
    """
    Start a cursor-agent process for feature analysis.
    
    Args:
        workspace_path: Full path to the workspace root
        feature_path: Relative path to feature folder
        on_output: Callback for streaming output
    
    Returns:
        session_id: Unique session identifier
    """
    session_id = str(uuid.uuid4())[:8]
    
    session = AnalysisSession(
        session_id=session_id,
        workspace_path=workspace_path,
        feature_path=feature_path
    )
    _sessions[session_id] = session
    
    # Build paths
    feature_md_path = Path(workspace_path) / feature_path / "feature.md"
    command_path = Path(workspace_path) / ".cursor" / "commands" / "analyze-feature-spec.md"
    
    # Read the analyze command content
    command_content = ""
    if command_path.exists():
        command_content = command_path.read_text()
    
    # Build prompt that includes the command context
    prompt = f"""Analyze the feature specification in @{feature_path}/feature.md using the analyze-feature-spec workflow.

{command_content}
"""
    
    # cursor-agent CLI: cursor-agent -f <file> -p "<prompt>"
    cmd = [
        "cursor-agent",
        "-f", str(feature_md_path),
        "-p", prompt
    ]
    
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=workspace_path
        )
        
        _processes[session_id] = process
        session.status = AnalysisStatus.RUNNING
        
        # Start async output reader
        asyncio.create_task(_read_output(session_id, on_output))
        
        return session_id
        
    except FileNotFoundError:
        session.status = AnalysisStatus.ERROR
        raise AnalyzeAgentError("cursor-agent CLI not found. Is it installed and in PATH?")
    except Exception as e:
        session.status = AnalysisStatus.ERROR
        raise AnalyzeAgentError(f"Failed to start cursor-agent: {str(e)}")


async def _read_output(session_id: str, on_output: Callable[[str], None]):
    """Read process output and stream to callback.
    
    Note: The callback is looked up dynamically via _output_callbacks to support
    WebSocket connections that are established after the analysis starts.
    """
    process = _processes.get(session_id)
    session = _sessions.get(session_id)
    
    if not process or not session:
        return
    
    async def call_output(text: str):
        """Call the current output callback (may be updated dynamically)."""
        # Try dynamic callback first (from WebSocket), fall back to original
        callback = _output_callbacks.get(session_id, on_output)
        await callback(text)
    
    try:
        async for line in process.stdout:
            decoded = line.decode('utf-8')
            session.output_buffer += decoded
            await call_output(decoded)
        
        # Process completed
        await process.wait()
        
        if process.returncode == 0:
            # Parse questions from output
            questions = parse_questions(session.output_buffer)
            if questions:
                session.questions = questions
                session.status = AnalysisStatus.AWAITING_ANSWERS
                await call_output(f"\n__QUESTIONS_READY__:{len(questions)}\n")
            else:
                session.status = AnalysisStatus.COMPLETE
                await call_output("\n__ANALYSIS_COMPLETE__\n")
        else:
            session.status = AnalysisStatus.ERROR
            await call_output(f"\n__ERROR__:Process exited with code {process.returncode}\n")
            
    except Exception as e:
        session.status = AnalysisStatus.ERROR
        await call_output(f"\n__ERROR__:{str(e)}\n")


async def submit_answers(
    session_id: str,
    answers: List,
    on_output: Callable[[str], None]
) -> bool:
    """
    Submit answers and continue agent processing.
    
    This runs cursor-agent again with the answers included in the prompt.
    """
    session = _sessions.get(session_id)
    if not session:
        return False
    
    session.answers = answers
    session.status = AnalysisStatus.PROCESSING_ANSWERS
    
    # Format answers for the prompt
    answers_text = format_answers(session.questions, answers)
    
    feature_md_path = Path(session.workspace_path) / session.feature_path / "feature.md"
    
    # Build continuation prompt with answers
    prompt = f"""Continue analyzing the feature specification. The user has provided the following answers to the clarifying questions:

{answers_text}

Now:
1. Update the feature.md with a refined specification based on these answers
2. Create an implementation-plan.md with a detailed implementation blueprint

Save both files to the feature folder at {session.feature_path}/
"""
    
    cmd = [
        "cursor-agent",
        "-f", str(feature_md_path),
        "-p", prompt
    ]
    
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=session.workspace_path
        )
        
        _processes[session_id] = process
        asyncio.create_task(_read_final_output(session_id, on_output))
        
        return True
        
    except Exception as e:
        session.status = AnalysisStatus.ERROR
        await on_output(f"\n__ERROR__:{str(e)}\n")
        return False


async def _read_final_output(session_id: str, on_output: Callable[[str], None]):
    """Read final output after answers submitted.
    
    Note: The callback is looked up dynamically via _output_callbacks to support
    WebSocket connections.
    """
    process = _processes.get(session_id)
    session = _sessions.get(session_id)
    
    if not process or not session:
        return
    
    async def call_output(text: str):
        """Call the current output callback (may be updated dynamically)."""
        callback = _output_callbacks.get(session_id, on_output)
        await callback(text)
    
    try:
        async for line in process.stdout:
            decoded = line.decode('utf-8')
            await call_output(decoded)
        
        await process.wait()
        
        if process.returncode == 0:
            session.status = AnalysisStatus.COMPLETE
            await call_output("\n__ANALYSIS_COMPLETE__\n")
        else:
            session.status = AnalysisStatus.ERROR
            await call_output(f"\n__ERROR__:Process exited with code {process.returncode}\n")
            
    except Exception as e:
        session.status = AnalysisStatus.ERROR
        await call_output(f"\n__ERROR__:{str(e)}\n")


async def cancel_analysis(session_id: str) -> bool:
    """Cancel an in-progress analysis."""
    process = _processes.get(session_id)
    session = _sessions.get(session_id)
    
    if process and process.returncode is None:
        process.terminate()
        try:
            await asyncio.wait_for(process.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            process.kill()
    
    if session:
        session.status = AnalysisStatus.CANCELLED
    
    # Cleanup
    _processes.pop(session_id, None)
    _output_callbacks.pop(session_id, None)
    
    return True


def parse_questions(markdown_output: str) -> List[Question]:
    """
    Parse numbered questions from agent markdown output.
    
    Expected format:
    ## Clarification Questions
    
    1. **Question Title?**
       Context or description...
    
    2. **Another Question?**
       More context...
    """
    questions = []
    
    # Pattern to match numbered questions with bold titles
    pattern = r'(\d+)\.\s+\*\*(.+?)\*\*\s*\n((?:(?!\d+\.\s+\*\*).)*)'
    
    matches = re.findall(pattern, markdown_output, re.DOTALL)
    
    for match in matches:
        question_id = int(match[0])
        title = match[1].strip()
        context = match[2].strip() if match[2] else None
        
        # Clean up context
        if context:
            context = re.sub(r'^[\s\-]+', '', context)
            context = ' '.join(context.split())
            # Truncate very long context
            if len(context) > 500:
                context = context[:500] + "..."
        
        questions.append(Question(
            id=question_id,
            title=title,
            context=context if context else None
        ))
    
    return questions


def format_answers(questions: List[Question], answers: List) -> str:
    """Format Q&A for agent input."""
    lines = []
    answer_map = {a.question_id: a.answer for a in answers}
    
    for q in questions:
        lines.append(f"### {q.id}. {q.title}")
        lines.append("")
        lines.append(answer_map.get(q.id, "(No answer provided)"))
        lines.append("")
    
    return "\n".join(lines)
