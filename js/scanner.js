// scanner.js - File System Access API logic with path filtering
// Implements recursive directory scanning following documented structure rules

/**
 * Opens native directory picker and returns the directory handle
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
export async function selectDirectory() {
    return await window.showDirectoryPicker();
}

/**
 * Gets the depth of a path (number of segments)
 * @param {string} path - The path to analyze
 * @returns {number} - Path depth (0 for root)
 */
function getPathDepth(path) {
    return path ? path.split('/').length : 0;
}

/**
 * Gets the segments of a path as an array
 * @param {string} path - The path to split
 * @returns {string[]} - Array of path segments
 */
function getPathSegments(path) {
    return path ? path.split('/') : [];
}

/**
 * Determines if an entry is allowed based on the current path context
 * Implements the documented structure rules for AI Workbench
 * 
 * Structure rules:
 * - Root: only 'projects' and 'features' directories
 * - projects/: any project directory
 * - projects/{name}/: 'features' dir and 'overview.md' file
 * - projects/{name}/features/: any feature directory
 * - features/ (root level): any feature directory
 * - */features/{name}/: 'feature.md' file and 'agents' directory
 * - */agents/: any agent directory
 * - */agents/{name}/: 'task-instructions.md' and 'status.md' files
 * 
 * @param {string} entryName - Name of the entry
 * @param {string} entryKind - 'file' or 'directory'
 * @param {string} currentPath - Current path context
 * @returns {boolean} - Whether the entry should be included
 */
function isAllowedEntry(entryName, entryKind, currentPath) {
    const segments = getPathSegments(currentPath);
    const depth = segments.length;

    // Root level: only allow 'projects' and 'features' directories
    if (depth === 0) {
        if (entryKind === 'directory') {
            return entryName === 'projects' || entryName === 'features';
        }
        return false;
    }

    // Inside 'projects': allow any project directory
    if (segments[0] === 'projects' && depth === 1) {
        return entryKind === 'directory';
    }

    // Inside a project (projects/{name}/): allow 'features' dir and 'overview.md'
    if (segments[0] === 'projects' && depth === 2) {
        if (entryKind === 'directory') {
            return entryName === 'features';
        }
        if (entryKind === 'file') {
            return entryName === 'overview.md';
        }
        return false;
    }

    // Inside project features (projects/{name}/features/): allow any feature directory
    if (segments[0] === 'projects' && depth === 3 && segments[2] === 'features') {
        return entryKind === 'directory';
    }

    // Inside root-level features: allow any feature directory
    if (segments[0] === 'features' && depth === 1) {
        return entryKind === 'directory';
    }

    // Inside a feature folder (*/features/{name}/ or features/{name}/):
    // Allow 'feature.md' file and 'agents' directory
    if (isFeatureFolder(segments)) {
        if (entryKind === 'directory') {
            return entryName === 'agents';
        }
        if (entryKind === 'file') {
            return entryName === 'feature.md';
        }
        return false;
    }

    // Inside agents folder: allow any agent directory
    if (isAgentsFolder(segments)) {
        return entryKind === 'directory';
    }

    // Inside an agent folder (*/agents/{name}/):
    // Allow 'task-instructions.md' and 'status.md' files only
    if (isAgentFolder(segments)) {
        if (entryKind === 'file') {
            return entryName === 'task-instructions.md' || entryName === 'status.md';
        }
        return false;
    }

    // Default: don't allow
    return false;
}

/**
 * Checks if the path represents a feature folder
 * Pattern: features/{name} or projects/{name}/features/{name}
 * @param {string[]} segments - Path segments
 * @returns {boolean}
 */
function isFeatureFolder(segments) {
    const depth = segments.length;
    
    // Root-level feature: features/{name}
    if (depth === 2 && segments[0] === 'features') {
        return true;
    }
    
    // Project feature: projects/{name}/features/{name}
    if (depth === 4 && segments[0] === 'projects' && segments[2] === 'features') {
        return true;
    }
    
    return false;
}

/**
 * Checks if the path represents an agents folder
 * Pattern: */features/{name}/agents or features/{name}/agents
 * @param {string[]} segments - Path segments
 * @returns {boolean}
 */
function isAgentsFolder(segments) {
    const depth = segments.length;
    const lastSegment = segments[depth - 1];
    
    if (lastSegment !== 'agents') {
        return false;
    }
    
    // Root-level feature agents: features/{name}/agents
    if (depth === 3 && segments[0] === 'features') {
        return true;
    }
    
    // Project feature agents: projects/{name}/features/{name}/agents
    if (depth === 5 && segments[0] === 'projects' && segments[2] === 'features') {
        return true;
    }
    
    return false;
}

/**
 * Checks if the path represents an agent folder
 * Pattern: */agents/{name}
 * @param {string[]} segments - Path segments
 * @returns {boolean}
 */
function isAgentFolder(segments) {
    const depth = segments.length;
    
    // Root-level feature agent: features/{name}/agents/{name}
    if (depth === 4 && segments[0] === 'features' && segments[2] === 'agents') {
        return true;
    }
    
    // Project feature agent: projects/{name}/features/{name}/agents/{name}
    if (depth === 6 && segments[0] === 'projects' && segments[2] === 'features' && segments[4] === 'agents') {
        return true;
    }
    
    return false;
}

/**
 * Recursively scans a directory following documented structure rules
 * @param {FileSystemDirectoryHandle} dirHandle - The directory handle to scan
 * @param {string} path - Current path for context (empty string for root)
 * @returns {Promise<Object>} - Tree structure object
 */
export async function scanDirectory(dirHandle, path = '') {
    const structure = {
        name: dirHandle.name,
        type: 'directory',
        path: path || dirHandle.name,
        children: [],
        handle: dirHandle
    };

    try {
        for await (const entry of dirHandle.values()) {
            const entryPath = path ? `${path}/${entry.name}` : entry.name;
            
            // Apply path-based filtering
            if (!isAllowedEntry(entry.name, entry.kind, path)) {
                continue;
            }

            if (entry.kind === 'directory') {
                // Recursively scan subdirectories
                const child = await scanDirectory(entry, entryPath);
                structure.children.push(child);
            } else if (entry.kind === 'file') {
                structure.children.push({
                    name: entry.name,
                    type: 'file',
                    path: entryPath,
                    handle: entry
                });
            }
        }
    } catch (error) {
        console.warn(`Error scanning directory ${path}:`, error);
    }

    // Sort children: directories first, then alphabetically by name
    structure.children.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });

    return structure;
}

/**
 * Reads the content of a file from its handle
 * @param {FileSystemFileHandle} fileHandle - The file handle to read
 * @returns {Promise<string>} - The file content as text
 */
export async function readFile(fileHandle) {
    const file = await fileHandle.getFile();
    return await file.text();
}
