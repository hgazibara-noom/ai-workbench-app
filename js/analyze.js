// analyze.js - Analysis Panel Component
// Manages the feature analysis UI and WebSocket communication

let currentSessionId = null;
let analysisWebSocket = null;
let currentQuestions = [];

// DOM References (set in init)
let analysisPanel, analysisTitle, analysisContent, analysisFooter;
let btnCancelAnalysis, btnCloseAnalysis, btnSubmitAnswers;

/**
 * Initialize panel event listeners
 */
export function initAnalysisPanel() {
    // Get DOM references
    analysisPanel = document.getElementById('analysis-panel');
    analysisTitle = document.getElementById('analysis-title');
    analysisContent = document.getElementById('analysis-content');
    analysisFooter = document.getElementById('analysis-footer');
    btnCancelAnalysis = document.getElementById('btn-cancel-analysis');
    btnCloseAnalysis = document.getElementById('btn-close-analysis');
    btnSubmitAnswers = document.getElementById('btn-submit-answers');
    
    // Set up event listeners
    btnCloseAnalysis.addEventListener('click', hideAnalysisPanel);
    btnCancelAnalysis.addEventListener('click', cancelAnalysis);
    btnSubmitAnswers.addEventListener('click', submitAnswers);
}

/**
 * Show the analysis panel with loading state
 * @param {string} featureName - Name of feature being analyzed
 */
export function showAnalysisPanel(featureName) {
    analysisPanel.classList.remove('hidden');
    analysisTitle.textContent = `📊 Analyzing: ${featureName}`;
    analysisContent.innerHTML = `
        <div class="analysis-loading">
            <div class="analysis-spinner"></div>
            <span>Starting cursor-agent...</span>
        </div>
    `;
    analysisFooter.classList.add('hidden');
    btnCancelAnalysis.classList.remove('hidden');
}

/**
 * Hide the analysis panel
 */
export function hideAnalysisPanel() {
    analysisPanel.classList.add('hidden');
    if (analysisWebSocket) {
        analysisWebSocket.close();
        analysisWebSocket = null;
    }
    currentSessionId = null;
    currentQuestions = [];
    
    // Remove analyzing state from any buttons
    document.querySelectorAll('.node-analyze-btn.analyzing').forEach(btn => {
        btn.classList.remove('analyzing');
    });
}

/**
 * Show error in the analysis panel
 * @param {string} message - Error message to display
 */
export function showAnalysisError(message) {
    analysisTitle.textContent = '📊 Analysis Error';
    btnCancelAnalysis.classList.add('hidden');
    analysisFooter.classList.add('hidden');
    
    analysisContent.innerHTML = `
        <div class="analysis-success">
            <div class="success-icon" style="color: var(--status-blocked);">❌</div>
            <h4 style="color: var(--status-blocked);">${escapeHtml(message)}</h4>
        </div>
    `;
}

/**
 * Connect WebSocket for real-time updates
 * @param {string} sessionId - Analysis session ID
 * @param {Object} featureNode - The feature node being analyzed
 */
export function connectAnalysisWebSocket(sessionId, featureNode) {
    currentSessionId = sessionId;
    
    // Use relative WebSocket URL (works with same-origin backend on port 8000)
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/analyze/ws/${sessionId}`;
    analysisWebSocket = new WebSocket(wsUrl);
    
    let outputBuffer = '';
    
    analysisWebSocket.onopen = () => {
        console.log('Analysis WebSocket connected');
    };
    
    analysisWebSocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
            case 'output':
                outputBuffer += data.content;
                renderOutput(outputBuffer);
                break;
                
            case 'questions':
                currentQuestions = data.items;
                renderQuestions(data.items);
                break;
                
            case 'complete':
                renderSuccess(data.files);
                btnCancelAnalysis.classList.add('hidden');
                break;
                
            case 'error':
                renderError(data.message);
                btnCancelAnalysis.classList.add('hidden');
                break;
                
            case 'cancelled':
                renderCancelled();
                break;
        }
    };
    
    analysisWebSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        renderError('Connection error');
    };
    
    analysisWebSocket.onclose = () => {
        console.log('Analysis WebSocket closed');
    };
}

/**
 * Render streaming output
 * @param {string} output - Accumulated output text
 */
function renderOutput(output) {
    analysisContent.innerHTML = `
        <div class="analysis-output">
            ${output.split('\n').map(line => 
                `<div class="output-line">${escapeHtml(line)}</div>`
            ).join('')}
        </div>
    `;
    
    // Auto-scroll to bottom
    analysisContent.scrollTop = analysisContent.scrollHeight;
}

/**
 * Render questions form
 * @param {Array} questions - Parsed questions
 */
function renderQuestions(questions) {
    analysisTitle.textContent = `📊 Analysis Complete - ${questions.length} Questions`;
    btnCancelAnalysis.classList.add('hidden');
    analysisFooter.classList.remove('hidden');
    
    analysisContent.innerHTML = `
        <p style="margin-bottom: var(--spacing-md); color: var(--text-muted);">
            The following clarifications are needed:
        </p>
        <ul class="question-list">
            ${questions.map(q => `
                <li class="question-item unanswered" data-question-id="${q.id}">
                    <div class="question-title">${q.id}. ${escapeHtml(q.title)}</div>
                    ${q.context ? `<div class="question-context">${escapeHtml(q.context)}</div>` : ''}
                    <textarea 
                        class="question-input" 
                        data-question-id="${q.id}"
                        placeholder="Enter your answer..."
                    ></textarea>
                    <div class="question-status unanswered">○ Unanswered</div>
                </li>
            `).join('')}
        </ul>
    `;
    
    // Add input listeners for validation
    analysisContent.querySelectorAll('.question-input').forEach(input => {
        input.addEventListener('input', () => {
            updateQuestionStatus(input);
            validateAllAnswers();
        });
    });
}

/**
 * Update individual question status
 * @param {HTMLTextAreaElement} input - The input element
 */
function updateQuestionStatus(input) {
    const item = input.closest('.question-item');
    const status = item.querySelector('.question-status');
    const hasValue = input.value.trim().length > 0;
    
    item.classList.toggle('answered', hasValue);
    item.classList.toggle('unanswered', !hasValue);
    status.classList.toggle('answered', hasValue);
    status.classList.toggle('unanswered', !hasValue);
    status.textContent = hasValue ? '✓ Answered' : '○ Unanswered';
}

/**
 * Validate all answers and update submit button
 */
function validateAllAnswers() {
    const inputs = analysisContent.querySelectorAll('.question-input');
    const allAnswered = Array.from(inputs).every(input => input.value.trim().length > 0);
    btnSubmitAnswers.disabled = !allAnswered;
}

/**
 * Submit answers to backend
 */
async function submitAnswers() {
    const inputs = analysisContent.querySelectorAll('.question-input');
    const answers = Array.from(inputs).map(input => ({
        question_id: parseInt(input.dataset.questionId),
        answer: input.value.trim()
    }));
    
    btnSubmitAnswers.disabled = true;
    btnSubmitAnswers.textContent = 'Processing...';
    
    try {
        const response = await fetch(`/api/analyze/${currentSessionId}/answers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers })
        });
        
        if (!response.ok) {
            throw new Error('Failed to submit answers');
        }
        
        // Show processing state
        analysisContent.innerHTML = `
            <div class="analysis-loading">
                <div class="analysis-spinner"></div>
                <span>Updating feature specification...</span>
            </div>
        `;
        analysisFooter.classList.add('hidden');
        
    } catch (error) {
        console.error('Submit answers error:', error);
        btnSubmitAnswers.disabled = false;
        btnSubmitAnswers.textContent = 'Submit Answers';
        renderError('Failed to submit answers');
    }
}

/**
 * Cancel in-progress analysis
 */
async function cancelAnalysis() {
    if (analysisWebSocket) {
        analysisWebSocket.send(JSON.stringify({ action: 'cancel' }));
    }
    
    try {
        await fetch(`/api/analyze/${currentSessionId}/cancel`, {
            method: 'POST'
        });
    } catch (error) {
        console.error('Cancel error:', error);
    }
}

/**
 * Render success state
 * @param {Array} files - List of updated files
 */
function renderSuccess(files) {
    analysisTitle.textContent = '✅ Analysis Complete';
    analysisFooter.classList.add('hidden');
    
    // Remove analyzing state from any buttons
    document.querySelectorAll('.node-analyze-btn.analyzing').forEach(btn => {
        btn.classList.remove('analyzing');
    });
    
    analysisContent.innerHTML = `
        <div class="analysis-success">
            <div class="success-icon">✅</div>
            <h4>Successfully updated:</h4>
            <ul>
                ${files.map(f => `<li>• ${f}</li>`).join('')}
            </ul>
            <button class="btn btn-primary" id="btn-view-updated">
                View Updated Feature
            </button>
        </div>
    `;
    
    // Add click handler for view button
    document.getElementById('btn-view-updated').addEventListener('click', () => {
        // Dispatch event to refresh tree
        window.dispatchEvent(new CustomEvent('refresh-tree'));
        hideAnalysisPanel();
    });
}

/**
 * Render error state
 * @param {string} message - Error message
 */
function renderError(message) {
    analysisContent.innerHTML = `
        <div class="analysis-success">
            <div class="success-icon" style="color: var(--status-blocked);">❌</div>
            <h4 style="color: var(--status-blocked);">${escapeHtml(message)}</h4>
        </div>
    `;
}

/**
 * Render cancelled state
 */
function renderCancelled() {
    analysisTitle.textContent = '📊 Analysis Cancelled';
    btnCancelAnalysis.classList.add('hidden');
    analysisFooter.classList.add('hidden');
    
    analysisContent.innerHTML = `
        <p class="placeholder">Analysis was cancelled.</p>
    `;
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
