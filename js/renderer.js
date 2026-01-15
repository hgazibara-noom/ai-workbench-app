// renderer.js - Tree view DOM rendering and content display
// Renders folder structure as interactive, collapsible tree view

import { parseStatus, getStatusClass, getStatusText } from './status.js';
import { readFile, writeFile } from './scanner.js';

/**
 * Renders the tree structure to the DOM
 * @param {Object} structure - The scanned tree structure
 * @param {HTMLElement} container - The container element to render into
 * @param {Function} onFileClick - Callback function when a file is clicked
 * @param {Function} onAnalyzeClick - Callback function when analyze button is clicked on a feature folder
 */
export function renderTree(structure, container, onFileClick, onAnalyzeClick) {
    container.innerHTML = '';
    
    // Create root list
    const ul = document.createElement('ul');
    ul.className = 'tree-root';
    
    // Render children of root (skip rendering the root directory itself)
    for (const child of structure.children) {
        const node = renderNode(child, onFileClick, onAnalyzeClick);
        ul.appendChild(node);
    }
    
    container.appendChild(ul);
}

/**
 * Renders a single tree node (directory or file)
 * @param {Object} node - The node to render
 * @param {Function} onFileClick - Callback for file clicks
 * @param {Function} onAnalyzeClick - Callback for analyze button clicks
 * @returns {HTMLElement} - The rendered list item element
 */
function renderNode(node, onFileClick, onAnalyzeClick) {
    const li = document.createElement('li');
    li.className = `tree-node tree-${node.type}`;
    
    if (node.type === 'directory') {
        return renderDirectoryNode(li, node, onFileClick, onAnalyzeClick);
    } else {
        return renderFileNode(li, node, onFileClick);
    }
}

/**
 * Renders a directory node with expand/collapse functionality
 * @param {HTMLElement} li - The list item element
 * @param {Object} node - The directory node data
 * @param {Function} onFileClick - Callback for file clicks
 * @param {Function} onAnalyzeClick - Callback for analyze button clicks
 * @returns {HTMLElement} - The rendered list item
 */
function renderDirectoryNode(li, node, onFileClick, onAnalyzeClick) {
    // Create the node row (toggle, icon, name, optional status badge)
    const row = document.createElement('div');
    row.className = 'node-row';
    
    // Toggle arrow
    const toggle = document.createElement('span');
    toggle.className = 'node-toggle';
    toggle.textContent = '▶';
    
    // Folder icon
    const icon = document.createElement('span');
    icon.className = 'node-icon';
    icon.textContent = '📁';
    
    // Folder name
    const name = document.createElement('span');
    name.className = 'node-name';
    name.textContent = node.name;
    
    row.appendChild(toggle);
    row.appendChild(icon);
    row.appendChild(name);
    
    // Check if this is an agent folder and add status badge
    if (isAgentFolderNode(node)) {
        addStatusBadgeAsync(row, node);
    }
    
    // Check if this is a feature folder and add analyze button
    if (isFeatureFolderNode(node)) {
        const analyzeBtn = document.createElement('button');
        analyzeBtn.className = 'node-analyze-btn';
        analyzeBtn.innerHTML = '🔍';
        analyzeBtn.title = 'Analyze feature';
        
        analyzeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (onAnalyzeClick) onAnalyzeClick(node);
        });
        
        row.appendChild(analyzeBtn);
    }
    
    li.appendChild(row);
    
    // Create children container
    const childrenUl = document.createElement('ul');
    childrenUl.className = 'tree-children collapsed';
    
    // Render all child nodes
    for (const child of node.children) {
        childrenUl.appendChild(renderNode(child, onFileClick, onAnalyzeClick));
    }
    
    li.appendChild(childrenUl);
    
    // Toggle expand/collapse on row click
    row.addEventListener('click', (e) => {
        e.stopPropagation();
        
        const isCollapsed = childrenUl.classList.toggle('collapsed');
        toggle.classList.toggle('expanded', !isCollapsed);
        toggle.textContent = isCollapsed ? '▶' : '▼';
    });
    
    return li;
}

/**
 * Renders a file node with click handler
 * @param {HTMLElement} li - The list item element
 * @param {Object} node - The file node data
 * @param {Function} onFileClick - Callback for file clicks
 * @returns {HTMLElement} - The rendered list item
 */
function renderFileNode(li, node, onFileClick) {
    const row = document.createElement('div');
    row.className = 'node-row';
    
    // Empty toggle (for alignment)
    const toggle = document.createElement('span');
    toggle.className = 'node-toggle hidden';
    
    // File icon
    const icon = document.createElement('span');
    icon.className = 'node-icon';
    icon.textContent = '📄';
    
    // File name
    const name = document.createElement('span');
    name.className = 'node-name';
    name.textContent = node.name;
    
    row.appendChild(toggle);
    row.appendChild(icon);
    row.appendChild(name);
    li.appendChild(row);
    
    // Handle file click
    row.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Remove 'selected' class from all nodes
        document.querySelectorAll('.tree-node.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Add 'selected' class to this node
        li.classList.add('selected');
        
        // Trigger callback
        onFileClick(node);
    });
    
    return li;
}

/**
 * Checks if a node is an agent folder
 * Agent folders contain task-instructions.md and/or status.md
 * @param {Object} node - The directory node
 * @returns {boolean} - True if this is an agent folder
 */
function isAgentFolderNode(node) {
    if (node.type !== 'directory' || !node.children) {
        return false;
    }
    
    return node.children.some(child => 
        child.type === 'file' && 
        (child.name === 'task-instructions.md' || child.name === 'status.md')
    );
}

/**
 * Checks if a node is a feature folder
 * Feature folders contain feature.md but are NOT agent folders
 * @param {Object} node - The directory node
 * @returns {boolean} - True if this is a feature folder
 */
function isFeatureFolderNode(node) {
    if (node.type !== 'directory' || !node.children) {
        return false;
    }
    
    // Must contain feature.md
    const hasFeatureMd = node.children.some(child => 
        child.type === 'file' && child.name === 'feature.md'
    );
    
    // Must NOT be an agent folder (those have task-instructions.md)
    if (!hasFeatureMd) {
        return false;
    }
    
    // Exclude agent folders
    return !isAgentFolderNode(node);
}

/**
 * Asynchronously adds a status badge to an agent folder
 * @param {HTMLElement} row - The node row element
 * @param {Object} node - The directory node
 */
async function addStatusBadgeAsync(row, node) {
    const statusFile = node.children.find(child => 
        child.type === 'file' && child.name === 'status.md'
    );
    
    if (!statusFile) {
        // No status.md file - don't show a badge
        return;
    }
    
    try {
        const content = await readFile(statusFile.handle);
        const status = parseStatus(content);
        
        const badge = document.createElement('span');
        badge.className = getStatusClass(status);
        badge.textContent = getStatusText(status);
        
        row.appendChild(badge);
    } catch (error) {
        console.warn('Could not read status.md:', error);
    }
}

/**
 * Checks if filename is a Markdown file
 * @param {string} fileName - The file name to check
 * @returns {boolean} - True if this is a Markdown file
 */
function isMarkdownFile(fileName) {
    return fileName.toLowerCase().endsWith('.md');
}

// Track if marked.js has been configured
let markedConfigured = false;

/**
 * Configures marked.js for GFM with external link handling
 * Only configures once to avoid issues with multiple marked.use() calls
 * @returns {boolean} - True if marked.js is available and configured
 */
function configureMarked() {
    if (typeof marked === 'undefined') {
        console.warn('marked.js not loaded');
        return false;
    }
    
    if (markedConfigured) {
        return true;
    }
    
    marked.use({
        gfm: true,
        breaks: true
    });
    
    markedConfigured = true;
    return true;
}

/**
 * Post-processes HTML to add target="_blank" to external links
 * @param {string} html - The rendered HTML
 * @returns {string} - The processed HTML with external link attributes
 */
function processExternalLinks(html) {
    return html.replace(
        /<a href="(https?:\/\/[^"]+)"/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer"'
    );
}

/**
 * Displays file content in the content panel
 * @param {string} content - The file content to display
 * @param {string} fileName - The name of the file
 * @param {HTMLElement} container - The container element to display in
 * @param {FileSystemFileHandle} fileHandle - The file handle for editing
 */
export function displayContent(content, fileName, container, fileHandle = null) {
    if (isMarkdownFile(fileName)) {
        displayMarkdownContent(content, fileName, container, fileHandle);
    } else {
        displayRawContent(content, fileName, container);
    }
}

/**
 * Displays raw file content (non-Markdown files)
 * @param {string} content - The file content to display
 * @param {string} fileName - The name of the file
 * @param {HTMLElement} container - The container element to display in
 */
function displayRawContent(content, fileName, container) {
    container.innerHTML = `
        <header class="content-header">
            <span class="content-filename">${escapeHtml(fileName)}</span>
        </header>
        <pre class="content-body">${escapeHtml(content)}</pre>
    `;
}

/**
 * Displays Markdown file content with toggle for split view preview and edit button
 * @param {string} content - The file content to display
 * @param {string} fileName - The name of the file
 * @param {HTMLElement} container - The container element to display in
 * @param {FileSystemFileHandle} fileHandle - The file handle for editing
 */
function displayMarkdownContent(content, fileName, container, fileHandle) {
    configureMarked();
    
    let renderedHtml = '<p class="error">Markdown parser not available</p>';
    if (typeof marked !== 'undefined') {
        renderedHtml = processExternalLinks(marked.parse(content));
    }
    
    container.innerHTML = `
        <header class="content-header">
            <span class="content-filename">${escapeHtml(fileName)}</span>
            <div class="content-actions">
                <button class="content-edit-btn" title="Edit file">
                    ✏️ Edit
                </button>
                <button class="content-toggle" title="Toggle Preview">
                    <span class="toggle-icon">◧</span> Preview
                </button>
            </div>
        </header>
        <div class="content-split">
            <pre class="content-body content-raw">${escapeHtml(content)}</pre>
            <div class="content-preview markdown-body">${renderedHtml}</div>
        </div>
    `;
    
    // Add toggle functionality
    const toggleBtn = container.querySelector('.content-toggle');
    const splitContainer = container.querySelector('.content-split');
    
    toggleBtn.addEventListener('click', () => {
        toggleBtn.classList.toggle('active');
        splitContainer.classList.toggle('split-active');
    });
    
    // Add edit functionality
    const editBtn = container.querySelector('.content-edit-btn');
    if (fileHandle) {
        editBtn.addEventListener('click', () => {
            enterEditMode(container, content, fileName, fileHandle);
        });
    } else {
        editBtn.style.display = 'none';
    }
}

// Track current edit state
let currentEditState = null;

/**
 * Enters edit mode for a Markdown file
 * @param {HTMLElement} container - The content panel container
 * @param {string} content - Current file content
 * @param {string} fileName - The file name
 * @param {FileSystemFileHandle} fileHandle - The file handle for saving
 */
function enterEditMode(container, content, fileName, fileHandle) {
    currentEditState = { container, fileName, fileHandle };
    
    container.innerHTML = `
        <header class="content-header">
            <span class="content-filename">${escapeHtml(fileName)}</span>
            <span class="save-status"></span>
            <button class="content-done-btn" title="Exit edit mode (Esc)">
                ✓ Done
            </button>
        </header>
        <textarea class="content-editor">${escapeHtml(content)}</textarea>
    `;
    
    const textarea = container.querySelector('.content-editor');
    const statusEl = container.querySelector('.save-status');
    const doneBtn = container.querySelector('.content-done-btn');
    
    // Focus the textarea
    textarea.focus();
    
    // Set up debounced auto-save
    let saveTimeout = null;
    textarea.addEventListener('input', () => {
        statusEl.textContent = '';
        statusEl.className = 'save-status';
        
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveContent(textarea.value, fileHandle, statusEl);
        }, 500);
    });
    
    // Handle Done button
    doneBtn.addEventListener('click', () => {
        exitEditMode(textarea.value, fileName, fileHandle, container);
    });
    
    // Handle Escape key
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            exitEditMode(textarea.value, fileName, fileHandle, container);
        }
    });
}

/**
 * Saves content to file with status feedback
 * @param {string} content - Content to save
 * @param {FileSystemFileHandle} fileHandle - File handle
 * @param {HTMLElement} statusEl - Status element for feedback
 */
async function saveContent(content, fileHandle, statusEl) {
    statusEl.textContent = 'Saving...';
    statusEl.className = 'save-status saving';
    
    try {
        await writeFile(fileHandle, content);
        statusEl.textContent = 'Saved ✓';
        statusEl.className = 'save-status saved';
        
        // Clear "Saved" message after 2 seconds
        setTimeout(() => {
            if (statusEl.textContent === 'Saved ✓') {
                statusEl.textContent = '';
            }
        }, 2000);
    } catch (error) {
        console.error('Failed to save file:', error);
        statusEl.textContent = 'Error saving';
        statusEl.className = 'save-status error';
    }
}

/**
 * Exits edit mode and returns to view mode
 * @param {string} content - Current editor content
 * @param {string} fileName - The file name
 * @param {FileSystemFileHandle} fileHandle - The file handle
 * @param {HTMLElement} container - The container element
 */
function exitEditMode(content, fileName, fileHandle, container) {
    currentEditState = null;
    displayMarkdownContent(content, fileName, container, fileHandle);
}

/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} text - The text to escape
 * @returns {string} - The escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
