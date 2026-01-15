// app.js - Main application coordinator
// Entry point for the AI Workbench Folder Structure Visualizer

import { selectDirectory, scanDirectory, readFile, createFeatureDirectory, checkDirectoryExists } from './scanner.js';
import { renderTree, displayContent } from './renderer.js';
import { hasJiraLink, setCurrentFeature, showJiraModal } from './jira.js';
import { initAnalysisPanel, showAnalysisPanel, connectAnalysisWebSocket, showAnalysisError } from './analyze.js';

// Application state
let currentDirHandle = null;
let currentStructure = null;  // Store scanned structure for project dropdown

// DOM element references
const btnSelect = document.getElementById('btn-select');
const btnRefresh = document.getElementById('btn-refresh');
const btnCreateFeature = document.getElementById('btn-create-feature');
const btnCreateJira = document.getElementById('btn-create-jira');
const workspacePath = document.getElementById('workspace-path');
const treePanel = document.getElementById('tree-panel');
const contentPanel = document.getElementById('content-panel');
const createFeatureModal = document.getElementById('create-feature-modal');

// Track current selected file for Jira button updates
let currentFileNode = null;

/**
 * Initialize the application
 */
function init() {
    // Check for File System Access API support
    if (!('showDirectoryPicker' in window)) {
        showError(
            'Your browser does not support the File System Access API. ' +
            'Please use Chrome or another Chromium-based browser.'
        );
        btnSelect.disabled = true;
        return;
    }

    // Set up event listeners
    btnSelect.addEventListener('click', handleSelectWorkspace);
    btnRefresh.addEventListener('click', handleRefresh);
    
    // Create feature listeners
    btnCreateFeature.addEventListener('click', handleCreateFeatureClick);
    
    // Create Jira listeners
    btnCreateJira.addEventListener('click', handleCreateJira);
    
    // Listen for feature updates (after Jira link is added)
    window.addEventListener('feature-updated', handleFeatureUpdated);
    
    // Modal listeners for Create Feature modal
    document.getElementById('btn-cancel-create').addEventListener('click', closeCreateModal);
    document.querySelector('#create-feature-modal .modal-close').addEventListener('click', closeCreateModal);
    document.querySelector('#create-feature-modal .modal-backdrop').addEventListener('click', closeCreateModal);
    document.getElementById('create-feature-form').addEventListener('submit', handleCreateFeatureSubmit);
    
    // Feature type toggle
    document.querySelectorAll('input[name="feature-type"]').forEach(radio => {
        radio.addEventListener('change', handleFeatureTypeChange);
    });
    
    // Feature name input with debounced validation
    const nameInput = document.getElementById('feature-name-input');
    let debounceTimer;
    nameInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => validateFeatureName(), 200);
        updateLocationPreview();
    });
    
    // Project select change should also update preview and revalidate
    document.getElementById('project-select').addEventListener('change', () => {
        updateLocationPreview();
        validateFeatureName();
    });
    
    // Keyboard: Escape to close modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!createFeatureModal.classList.contains('hidden')) {
                closeCreateModal();
            }
        }
    });
    
    // Initialize analysis panel
    initAnalysisPanel();
    
    // Listen for refresh-tree events (from analysis panel on completion)
    window.addEventListener('refresh-tree', async () => {
        await refresh();
    });
}

/**
 * Handle "Create Jira" button click
 */
function handleCreateJira() {
    showJiraModal();
}

/**
 * Handle feature-updated event (after Jira link is added)
 */
async function handleFeatureUpdated(event) {
    // Re-read and re-display the current file to show updated content
    if (currentFileNode && currentFileNode.handle) {
        try {
            const content = await readFile(currentFileNode.handle);
            displayContent(content, currentFileNode.name, contentPanel, currentFileNode.handle);
            
            // Update button state - file now has Jira link
            const jiraKey = hasJiraLink(content);
            if (jiraKey) {
                btnCreateJira.disabled = true;
                btnCreateJira.title = `Already linked to ${jiraKey}`;
            }
            
            // Update current feature context
            setCurrentFeature(currentFileNode.handle, content, currentFileNode.path);
        } catch (error) {
            console.error('Failed to refresh file:', error);
        }
    }
}

/**
 * Handle "Select Workspace" button click
 */
async function handleSelectWorkspace() {
    try {
        // Open native directory picker
        currentDirHandle = await selectDirectory();
        
        // Update UI to show selected workspace
        workspacePath.textContent = currentDirHandle.name;
        workspacePath.classList.add('active');
        
        // Enable buttons
        btnRefresh.disabled = false;
        btnCreateFeature.disabled = false;
        
        // Trigger initial scan
        await refresh();
        
    } catch (error) {
        // User cancelled the picker - this is not an error
        if (error.name === 'AbortError') {
            return;
        }
        
        // Handle other errors
        console.error('Failed to select directory:', error);
        showError(`Failed to select directory: ${error.message}`);
    }
}

/**
 * Handle "Refresh" button click
 */
async function handleRefresh() {
    if (!currentDirHandle) {
        return;
    }
    
    await refresh();
}

/**
 * Refresh the tree view by re-scanning the current directory
 */
async function refresh() {
    if (!currentDirHandle) {
        return;
    }
    
    // Show loading state
    treePanel.innerHTML = '<p class="loading">Scanning...</p>';
    
    try {
        // Scan the directory structure
        const structure = await scanDirectory(currentDirHandle);
        currentStructure = structure;  // Store for project dropdown
        
        // Check if structure has any children
        if (structure.children.length === 0) {
            treePanel.innerHTML = '<p class="placeholder">No recognized structure found. ' +
                'Expected folders: <code>projects/</code> or <code>features/</code></p>';
            return;
        }
        
        // Render the tree view
        renderTree(structure, treePanel, handleFileClick, handleAnalyzeClick);
        
    } catch (error) {
        console.error('Scan failed:', error);
        treePanel.innerHTML = `<p class="error">Scan failed: ${error.message}</p>`;
    }
}

/**
 * Handle file click in the tree view
 * @param {Object} fileNode - The file node that was clicked
 */
async function handleFileClick(fileNode) {
    try {
        // Show loading state in content panel
        contentPanel.innerHTML = '<p class="loading">Loading file...</p>';
        
        // Store current file node for feature updates
        currentFileNode = fileNode;
        
        // Read the file content
        const content = await readFile(fileNode.handle);
        
        // Check if this is a feature.md file and update Jira button state
        if (fileNode.name === 'feature.md') {
            const existingJiraKey = hasJiraLink(content);
            
            if (existingJiraKey) {
                btnCreateJira.disabled = true;
                btnCreateJira.title = `Already linked to ${existingJiraKey}`;
            } else {
                btnCreateJira.disabled = false;
                btnCreateJira.title = 'Create Jira ticket from this feature';
            }
            
            // Set context for jira module
            setCurrentFeature(fileNode.handle, content, fileNode.path);
        } else {
            btnCreateJira.disabled = true;
            btnCreateJira.title = 'Select a feature.md to enable';
            setCurrentFeature(null, null, null);
        }
        
        // Display the content
        displayContent(content, fileNode.name, contentPanel, fileNode.handle);
        
    } catch (error) {
        console.error('Failed to read file:', error);
        contentPanel.innerHTML = `<p class="error">Failed to read file: ${error.message}</p>`;
    }
}

/**
 * Show an error message in the tree panel
 * @param {string} message - The error message to display
 */
function showError(message) {
    treePanel.innerHTML = `<p class="error">${message}</p>`;
}

/**
 * Handle analyze button click on a feature folder
 * @param {Object} featureNode - The feature folder node that was clicked
 */
async function handleAnalyzeClick(featureNode) {
    // Get the feature path relative to workspace
    const featurePath = featureNode.path;
    
    // Show analysis panel with loading state
    showAnalysisPanel(featureNode.name);
    
    // Mark button as analyzing (find the button by searching through the tree)
    const allAnalyzeBtns = document.querySelectorAll('.node-analyze-btn');
    allAnalyzeBtns.forEach(btn => {
        // Check if this button's parent row contains the matching folder name
        const row = btn.closest('.node-row');
        const nameSpan = row?.querySelector('.node-name');
        if (nameSpan && nameSpan.textContent === featureNode.name) {
            btn.classList.add('analyzing');
        }
    });
    
    try {
        // Note: We need the full workspace path. The File System Access API
        // doesn't give us the full path, so we use a workaround via the backend.
        const response = await fetch('/api/analyze/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                // Backend will need to resolve the workspace path
                workspace_path: window.WORKSPACE_PATH || '/Users/hrvojegazibara/projects/ai-workbench/ai-workbench-workspace',
                feature_path: featurePath
            })
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Connect WebSocket for real-time updates
        connectAnalysisWebSocket(data.session_id, featureNode);
        
    } catch (error) {
        console.error('Failed to start analysis:', error);
        showAnalysisError(`Failed to start analysis: ${error.message}`);
        
        // Remove analyzing state from buttons
        document.querySelectorAll('.node-analyze-btn.analyzing').forEach(btn => {
            btn.classList.remove('analyzing');
        });
    }
}

// ============================================================
// Create Feature Modal Functions
// ============================================================

/**
 * Opens the create feature modal
 */
function handleCreateFeatureClick() {
    // Reset form
    document.getElementById('create-feature-form').reset();
    document.getElementById('feature-name-error').textContent = '';
    document.getElementById('feature-name-input').classList.remove('invalid');
    document.getElementById('btn-submit-create').disabled = true;
    
    // Populate projects dropdown
    populateProjectDropdown();
    
    // Show standalone by default
    document.getElementById('project-select-group').style.display = 'none';
    updateLocationPreview();
    
    // Show modal
    createFeatureModal.classList.remove('hidden');
    document.getElementById('feature-name-input').focus();
}

/**
 * Closes the create feature modal
 */
function closeCreateModal() {
    createFeatureModal.classList.add('hidden');
}

/**
 * Populates the project dropdown from current structure
 */
function populateProjectDropdown() {
    const select = document.getElementById('project-select');
    select.innerHTML = '<option value="">Select a project...</option>';
    
    if (!currentStructure) return;
    
    const projectsDir = currentStructure.children.find(c => c.name === 'projects');
    if (!projectsDir) return;
    
    const projects = projectsDir.children
        .filter(c => c.type === 'directory')
        .map(c => c.name)
        .sort();
    
    projects.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
}

/**
 * Handles feature type radio change
 */
function handleFeatureTypeChange(e) {
    const projectGroup = document.getElementById('project-select-group');
    projectGroup.style.display = e.target.value === 'project' ? 'block' : 'none';
    updateLocationPreview();
    validateFeatureName();
}

/**
 * Updates the location preview based on current selections
 */
function updateLocationPreview() {
    const preview = document.getElementById('location-preview');
    const featureType = document.querySelector('input[name="feature-type"]:checked').value;
    const projectName = document.getElementById('project-select').value;
    const featureName = document.getElementById('feature-name-input').value.trim() || '{feature-name}';
    
    if (featureType === 'standalone') {
        preview.textContent = `features/${featureName}/`;
    } else {
        const project = projectName || '{project}';
        preview.textContent = `projects/${project}/features/${featureName}/`;
    }
}

/**
 * Validates the feature name input
 * @returns {Promise<boolean>} - True if valid
 */
async function validateFeatureName() {
    const input = document.getElementById('feature-name-input');
    const errorSpan = document.getElementById('feature-name-error');
    const submitBtn = document.getElementById('btn-submit-create');
    const name = input.value.trim();
    
    // Reset state
    input.classList.remove('invalid');
    errorSpan.textContent = '';
    submitBtn.disabled = true;
    
    // Empty check
    if (!name) {
        return false;
    }
    
    // Length check
    if (name.length < 2) {
        input.classList.add('invalid');
        errorSpan.textContent = 'Name must be at least 2 characters';
        return false;
    }
    
    // Kebab-case format check
    const kebabRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    if (!kebabRegex.test(name)) {
        input.classList.add('invalid');
        errorSpan.textContent = 'Use lowercase letters, numbers, and hyphens only (e.g., my-feature)';
        return false;
    }
    
    // Project selection check (if project feature)
    const featureType = document.querySelector('input[name="feature-type"]:checked').value;
    if (featureType === 'project') {
        const projectName = document.getElementById('project-select').value;
        if (!projectName) {
            // Don't show error for feature name, but keep submit disabled
            return false;
        }
    }
    
    // Duplicate check
    const pathSegments = getTargetPathSegments();
    const fullPath = [...pathSegments, name];
    
    try {
        const exists = await checkDirectoryExists(currentDirHandle, fullPath);
        if (exists) {
            input.classList.add('invalid');
            errorSpan.textContent = 'A feature with this name already exists';
            return false;
        }
    } catch (error) {
        console.warn('Could not check for duplicates:', error);
    }
    
    // All valid
    submitBtn.disabled = false;
    return true;
}

/**
 * Gets the target path segments based on current modal state
 * @returns {string[]} - Path segments
 */
function getTargetPathSegments() {
    const featureType = document.querySelector('input[name="feature-type"]:checked').value;
    
    if (featureType === 'standalone') {
        return ['features'];
    } else {
        const projectName = document.getElementById('project-select').value;
        return ['projects', projectName, 'features'];
    }
}

/**
 * Handles the create feature form submission
 * @param {Event} e - Submit event
 */
async function handleCreateFeatureSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('btn-submit-create');
    const featureName = document.getElementById('feature-name-input').value.trim();
    const pathSegments = getTargetPathSegments();
    
    // Validate one more time
    const isValid = await validateFeatureName();
    if (!isValid) return;
    
    // Show loading state
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    
    try {
        // Create the feature directory and file
        const { fileHandle } = await createFeatureDirectory(currentDirHandle, pathSegments, featureName);
        
        // Close modal
        closeCreateModal();
        
        // Refresh tree to show new feature
        await refresh();
        
        // Auto-open the created feature.md in edit mode
        const content = await readFile(fileHandle);
        displayContent(content, 'feature.md', contentPanel, fileHandle);
        
        // Find and click on the file to enter edit mode
        // The displayContent shows the file, and we want to auto-enter edit mode
        setTimeout(() => {
            const editBtn = contentPanel.querySelector('.content-edit-btn');
            if (editBtn) editBtn.click();
        }, 100);
        
    } catch (error) {
        console.error('Failed to create feature:', error);
        
        const errorSpan = document.getElementById('feature-name-error');
        if (error.name === 'NotAllowedError') {
            errorSpan.textContent = 'Permission denied. Please grant write access.';
        } else {
            errorSpan.textContent = `Error: ${error.message}`;
        }
        document.getElementById('feature-name-input').classList.add('invalid');
    } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

// Initialize the application when DOM is ready
init();
