// status.js - Status badge parsing from status.md files
// Extracts agent status for badge display in the tree view

/**
 * Status detection patterns with associated keywords
 * Ordered by priority - first match wins
 */
const STATUS_PATTERNS = [
    { 
        status: 'completed', 
        patterns: [/\bcompleted\b/i, /\bdone\b/i, /\bfinished\b/i] 
    },
    { 
        status: 'blocked', 
        patterns: [/\bblocked\b/i, /\bwaiting\b/i, /\bstuck\b/i] 
    },
    { 
        status: 'in-progress', 
        patterns: [/\bin progress\b/i, /\bworking\b/i, /\bstarted\b/i] 
    }
];

/**
 * Parse status from file content
 * Analyzes the first 500 characters to determine agent status
 * 
 * @param {string} content - The content of status.md file
 * @returns {'completed'|'blocked'|'in-progress'|'not-started'} - Detected status
 */
export function parseStatus(content) {
    // Only analyze first 500 characters for performance
    const sample = content.substring(0, 500);
    
    for (const { status, patterns } of STATUS_PATTERNS) {
        if (patterns.some(pattern => pattern.test(sample))) {
            return status;
        }
    }
    
    return 'not-started';
}

/**
 * Get CSS class string for status badge styling
 * 
 * @param {string} status - The status value
 * @returns {string} - CSS class string (e.g., 'status-badge status-completed')
 */
export function getStatusClass(status) {
    return `status-badge status-${status}`;
}

/**
 * Get display text for status badge
 * Converts status slug to human-readable format
 * 
 * @param {string} status - The status value (e.g., 'in-progress')
 * @returns {string} - Display text (e.g., 'in progress')
 */
export function getStatusText(status) {
    return status.replace(/-/g, ' ');
}
