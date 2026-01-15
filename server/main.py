"""FastAPI application for AI Workbench."""

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path

from .routers import jira, analyze

app = FastAPI(title="AI Workbench API")

# CORS middleware (for local development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(jira.router, prefix="/api/jira", tags=["jira"])
app.include_router(analyze.router, prefix="/api/analyze", tags=["analyze"])

# Serve static files (the existing frontend)
# Mount at root AFTER API routes so API takes precedence
static_path = Path(__file__).parent.parent
app.mount("/", StaticFiles(directory=static_path, html=True), name="static")
