// jira.js - Jira integration module for creating tickets from feature.md files

const JIRA_LINK_PATTERN = /\*\*Jira\*\*:\s*\[([A-Z]+-\d+)\]/;

// State
let currentFeatureHandle = null;
let currentFeatureContent = null;
let currentFeaturePath = null;

/**
 * Check if content has existing Jira link
 * @param {string} content - The file content to check
 * @returns {string|null} - The ticket key if found, null otherwise
 */
export function hasJiraLink(content) {
    const match = content.match(JIRA_LINK_PATTERN);
    return match ? match[1] : null;
}

/**
 * Set the current feature context for Jira operations
 * @param {FileSystemFileHandle|null} handle - The file handle
 * @param {string|null} content - The file content
 * @param {string|null} path - The relative file path
 */
export function setCurrentFeature(handle, content, path) {
    currentFeatureHandle = handle;
    currentFeatureContent = content;
    currentFeaturePath = path;
}

/**
 * Get saved preferences from localStorage
 * @returns {Object} - The saved preferences
 */
function getPreferences() {
    return {
        projectKey: localStorage.getItem('jira_project_key') || '',
        subtaskType: localStorage.getItem('jira_subtask_type') || 'Sub-task',
        createSubtasks: localStorage.getItem('jira_create_subtasks') !== 'false'
    };
}

/**
 * Save preferences to localStorage
 * @param {string} projectKey - The Jira project key
 * @param {string} subtaskType - The subtask issue type
 * @param {boolean} createSubtasks - Whether to create subtasks
 */
function savePreferences(projectKey, subtaskType, createSubtasks) {
    localStorage.setItem('jira_project_key', projectKey);
    localStorage.setItem('jira_subtask_type', subtaskType);
    localStorage.setItem('jira_create_subtasks', String(createSubtasks));
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - The text to escape
 * @returns {string} - The escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show the Jira creation modal with form state
 */
export function showJiraModal() {
    const modal = document.getElementById('jira-modal');
    const body = document.getElementById('jira-modal-body');
    const footer = document.getElementById('jira-modal-footer');
    const title = document.getElementById('jira-modal-title');
    
    const prefs = getPreferences();
    
    title.textContent = 'Create Jira Ticket';
    
    body.innerHTML = `
        <div class="form-group">
            <label for="jira-project">Jira Project Key:</label>
            <input type="text" id="jira-project" value="${escapeHtml(prefs.projectKey)}" 
                   placeholder="e.g., AWB" class="form-input" />
        </div>
        <div class="form-group">
            <label class="checkbox-label">
                <input type="checkbox" id="jira-create-subtasks" 
                       ${prefs.createSubtasks ? 'checked' : ''} />
                <span>Create subtasks from functional requirements</span>
            </label>
        </div>
        <div class="form-group" id="subtask-type-group">
            <label for="jira-subtask-type">Sub-task Issue Type:</label>
            <input type="text" id="jira-subtask-type" value="${escapeHtml(prefs.subtaskType)}" 
                   class="form-input" />
            <small class="form-hint">Enter the exact issue type name from your Jira project</small>
        </div>
    `;
    
    footer.innerHTML = `
        <button class="btn btn-secondary" id="jira-modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="jira-modal-submit">Create Ticket</button>
    `;
    
    // Toggle subtask type visibility
    const subtasksCheckbox = document.getElementById('jira-create-subtasks');
    const subtaskTypeGroup = document.getElementById('subtask-type-group');
    subtaskTypeGroup.style.display = subtasksCheckbox.checked ? 'block' : 'none';
    
    subtasksCheckbox.addEventListener('change', () => {
        subtaskTypeGroup.style.display = subtasksCheckbox.checked ? 'block' : 'none';
    });
    
    // Event handlers
    document.getElementById('jira-modal-cancel').onclick = hideJiraModal;
    document.getElementById('jira-modal-close').onclick = hideJiraModal;
    document.getElementById('jira-modal-submit').onclick = handleCreateTicket;
    modal.querySelector('.modal-backdrop').onclick = hideJiraModal;
    
    // Keyboard: Escape to close
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            hideJiraModal();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
    
    modal.classList.remove('hidden');
}

/**
 * Hide the Jira modal
 */
export function hideJiraModal() {
    document.getElementById('jira-modal').classList.add('hidden');
}

/**
 * Handle the create ticket action
 */
async function handleCreateTicket() {
    const projectKey = document.getElementById('jira-project').value.trim().toUpperCase();
    const createSubtasks = document.getElementById('jira-create-subtasks').checked;
    const subtaskType = document.getElementById('jira-subtask-type').value.trim();
    
    // Validation
    if (!projectKey) {
        alert('Please enter a Jira project key');
        document.getElementById('jira-project').focus();
        return;
    }
    
    if (createSubtasks && !subtaskType) {
        alert('Please enter a subtask issue type');
        document.getElementById('jira-subtask-type').focus();
        return;
    }
    
    // Save preferences
    savePreferences(projectKey, subtaskType, createSubtasks);
    
    // Show loading state
    showLoadingState();
    
    try {
        const response = await fetch('/api/jira/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                feature_content: currentFeatureContent,
                feature_path: currentFeaturePath,
                project_key: projectKey,
                create_subtasks: createSubtasks,
                subtask_type: subtaskType
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            await handleSuccess(result);
        } else {
            showError(result.error || 'Unknown error occurred');
        }
    } catch (error) {
        showError(`Network error: ${error.message}`);
    }
}

/**
 * Show loading state in modal
 */
function showLoadingState() {
    const body = document.getElementById('jira-modal-body');
    const footer = document.getElementById('jira-modal-footer');
    
    body.innerHTML = `
        <div class="jira-loading-state">
            <div class="jira-spinner"></div>
            <p>Creating Jira ticket...</p>
            <small>The AI agent is creating your story and subtasks.</small>
        </div>
    `;
    
    footer.innerHTML = `
        <button class="btn btn-secondary" id="jira-modal-cancel">Cancel</button>
    `;
    document.getElementById('jira-modal-cancel').onclick = hideJiraModal;
}

/**
 * Handle successful ticket creation
 * @param {Object} result - The API response
 */
async function handleSuccess(result) {
    const title = document.getElementById('jira-modal-title');
    const body = document.getElementById('jira-modal-body');
    const footer = document.getElementById('jira-modal-footer');
    
    // Check for partial failures
    const failedSubtasks = result.subtasks.filter(s => !s.success);
    const hasFailures = failedSubtasks.length > 0;
    
    title.textContent = hasFailures ? '⚠ Partially Created' : '✓ Jira Ticket Created';
    
    let subtasksHtml = '';
    if (result.subtasks && result.subtasks.length > 0) {
        const successCount = result.subtasks.filter(s => s.success).length;
        subtasksHtml = `
            <div class="jira-subtasks-list">
                <h4>Subtasks: ${successCount} of ${result.subtasks.length} created</h4>
                <ul>
                    ${result.subtasks.map(s => `
                        <li class="${s.success ? 'success' : 'failed'}">
                            ${s.success ? '✓' : '✗'} 
                            ${s.key ? `${escapeHtml(s.key)}: ` : ''}${escapeHtml(s.summary)}
                            ${s.error ? `<span class="error-msg">(${escapeHtml(s.error)})</span>` : ''}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }
    
    body.innerHTML = `
        <div class="jira-success-state">
            <p class="jira-story-link">
                <strong>Story:</strong> 
                <a href="${escapeHtml(result.story.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.story.key)}</a> 
                - ${escapeHtml(result.story.summary)}
            </p>
            ${subtasksHtml}
            <p class="jira-update-notice">✓ feature.md will be updated with Jira link</p>
        </div>
    `;
    
    footer.innerHTML = `
        <button class="btn btn-primary" id="jira-modal-done">Done</button>
    `;
    
    document.getElementById('jira-modal-done').onclick = async () => {
        // Update feature.md with Jira link
        await updateFeatureWithJiraLink(result.jira_link_markdown);
        hideJiraModal();
    };
}

/**
 * Show error state in modal
 * @param {string} message - The error message
 */
function showError(message) {
    const title = document.getElementById('jira-modal-title');
    const body = document.getElementById('jira-modal-body');
    const footer = document.getElementById('jira-modal-footer');
    
    title.textContent = 'Error';
    
    body.innerHTML = `
        <div class="jira-error-state">
            <p class="error-icon">✗</p>
            <p class="error-message">${escapeHtml(message)}</p>
        </div>
    `;
    
    footer.innerHTML = `
        <button class="btn btn-secondary" id="jira-modal-cancel">Close</button>
        <button class="btn btn-primary" id="jira-modal-retry">Retry</button>
    `;
    
    document.getElementById('jira-modal-cancel').onclick = hideJiraModal;
    document.getElementById('jira-modal-retry').onclick = showJiraModal;
}

/**
 * Update feature.md with Jira link after the title
 * @param {string} jiraLinkMarkdown - The markdown link to insert
 */
async function updateFeatureWithJiraLink(jiraLinkMarkdown) {
    if (!currentFeatureHandle || !currentFeatureContent) {
        console.warn('No feature handle or content available');
        return;
    }
    
    // Insert Jira link after the first # heading
    const lines = currentFeatureContent.split('\n');
    let insertIndex = 1;
    
    // Find the first # heading and insert after it
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('# ')) {
            insertIndex = i + 1;
            // Skip any empty lines after title
            while (insertIndex < lines.length && lines[insertIndex].trim() === '') {
                insertIndex++;
            }
            break;
        }
    }
    
    // Insert the Jira link with proper spacing
    lines.splice(insertIndex, 0, '', jiraLinkMarkdown);
    
    const newContent = lines.join('\n');
    
    // Write back to file
    try {
        const writable = await currentFeatureHandle.createWritable();
        await writable.write(newContent);
        await writable.close();
        
        // Update current content
        currentFeatureContent = newContent;
        
        // Trigger refresh of the displayed content
        window.dispatchEvent(new CustomEvent('feature-updated', {
            detail: { content: newContent, path: currentFeaturePath }
        }));
    } catch (error) {
        console.error('Failed to update feature.md:', error);
        alert('Created Jira ticket but failed to update feature.md: ' + error.message);
    }
}
