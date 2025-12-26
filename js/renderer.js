// renderer.js - Tree view DOM rendering and content display
// Renders folder structure as interactive, collapsible tree view

import { parseStatus, getStatusClass, getStatusText } from './status.js';
import { readFile } from './scanner.js';

/**
 * Renders the tree structure to the DOM
 * @param {Object} structure - The scanned tree structure
 * @param {HTMLElement} container - The container element to render into
 * @param {Function} onFileClick - Callback function when a file is clicked
 */
export function renderTree(structure, container, onFileClick) {
    container.innerHTML = '';
    
    // Create root list
    const ul = document.createElement('ul');
    ul.className = 'tree-root';
    
    // Render children of root (skip rendering the root directory itself)
    for (const child of structure.children) {
        const node = renderNode(child, onFileClick);
        ul.appendChild(node);
    }
    
    container.appendChild(ul);
}

/**
 * Renders a single tree node (directory or file)
 * @param {Object} node - The node to render
 * @param {Function} onFileClick - Callback for file clicks
 * @returns {HTMLElement} - The rendered list item element
 */
function renderNode(node, onFileClick) {
    const li = document.createElement('li');
    li.className = `tree-node tree-${node.type}`;
    
    if (node.type === 'directory') {
        return renderDirectoryNode(li, node, onFileClick);
    } else {
        return renderFileNode(li, node, onFileClick);
    }
}

/**
 * Renders a directory node with expand/collapse functionality
 * @param {HTMLElement} li - The list item element
 * @param {Object} node - The directory node data
 * @param {Function} onFileClick - Callback for file clicks
 * @returns {HTMLElement} - The rendered list item
 */
function renderDirectoryNode(li, node, onFileClick) {
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
    
    li.appendChild(row);
    
    // Create children container
    const childrenUl = document.createElement('ul');
    childrenUl.className = 'tree-children collapsed';
    
    // Render all child nodes
    for (const child of node.children) {
        childrenUl.appendChild(renderNode(child, onFileClick));
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
 */
export function displayContent(content, fileName, container) {
    if (isMarkdownFile(fileName)) {
        displayMarkdownContent(content, fileName, container);
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
 * Displays Markdown file content with toggle for split view preview
 * @param {string} content - The file content to display
 * @param {string} fileName - The name of the file
 * @param {HTMLElement} container - The container element to display in
 */
function displayMarkdownContent(content, fileName, container) {
    configureMarked();
    
    let renderedHtml = '<p class="error">Markdown parser not available</p>';
    if (typeof marked !== 'undefined') {
        renderedHtml = processExternalLinks(marked.parse(content));
    }
    
    container.innerHTML = `
        <header class="content-header">
            <span class="content-filename">${escapeHtml(fileName)}</span>
            <button class="content-toggle" title="Toggle Preview">
                <span class="toggle-icon">◧</span> Preview
            </button>
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
