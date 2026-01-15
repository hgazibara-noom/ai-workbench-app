#!/bin/bash
cd "$(dirname "$0")"

# Install dependencies if needed
if [ ! -d "server/.venv" ]; then
    echo "Setting up Python virtual environment..."
    python3 -m venv server/.venv
    source server/.venv/bin/activate
    pip install -r server/requirements.txt
else
    source server/.venv/bin/activate
fi

# Start FastAPI server
echo "Starting AI Workbench server on http://localhost:8000"
uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
