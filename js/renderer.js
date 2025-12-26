// renderer.js - Tree view DOM rendering
// Placeholder implementation - will be fully implemented by feature-logic agent

/**
 * Renders the tree structure to the DOM
 * @param {Object} structure - The scanned tree structure
 * @param {HTMLElement} container - The container element to render into
 * @param {Function} onFileClick - Callback function when a file is clicked
 */
export function renderTree(structure, container, onFileClick) {
    // Placeholder - will be fully implemented by feature-logic agent
    container.innerHTML = '<p class="placeholder">Tree view coming soon...</p>';
}

/**
 * Displays file content in the content panel
 * @param {string} content - The file content to display
 * @param {string} fileName - The name of the file
 * @param {HTMLElement} container - The container element to display in
 */
export function displayContent(content, fileName, container) {
    container.innerHTML = `
        <header class="content-header">
            <span class="content-filename">${escapeHtml(fileName)}</span>
        </header>
        <pre class="content-body">${escapeHtml(content)}</pre>
    `;
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
