// app.js - Main application coordinator
// Entry point for the AI Workbench Folder Structure Visualizer

import { selectDirectory, scanDirectory, readFile } from './scanner.js';
import { renderTree, displayContent } from './renderer.js';
import { hasJiraLink, setCurrentFeature, showJiraModal } from './jira.js';

// Application state
let currentDirHandle = null;

// DOM element references
const btnSelect = document.getElementById('btn-select');
const btnRefresh = document.getElementById('btn-refresh');
const btnCreateJira = document.getElementById('btn-create-jira');
const workspacePath = document.getElementById('workspace-path');
const treePanel = document.getElementById('tree-panel');
const contentPanel = document.getElementById('content-panel');

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
    btnCreateJira.addEventListener('click', handleCreateJira);
    
    // Listen for feature updates (after Jira link is added)
    window.addEventListener('feature-updated', handleFeatureUpdated);
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
        
        // Enable refresh button
        btnRefresh.disabled = false;
        
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
        
        // Check if structure has any children
        if (structure.children.length === 0) {
            treePanel.innerHTML = '<p class="placeholder">No recognized structure found. ' +
                'Expected folders: <code>projects/</code> or <code>features/</code></p>';
            return;
        }
        
        // Render the tree view
        renderTree(structure, treePanel, handleFileClick);
        
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

// Initialize the application when DOM is ready
init();
