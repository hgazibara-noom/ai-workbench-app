// scanner.js - File System Access API logic
// Placeholder implementation - will be fully implemented by feature-logic agent

/**
 * Opens native directory picker and returns the directory handle
 * @returns {Promise<FileSystemDirectoryHandle>}
 */
export async function selectDirectory() {
    return await window.showDirectoryPicker();
}

/**
 * Recursively scans a directory and returns its structure
 * @param {FileSystemDirectoryHandle} dirHandle - The directory handle to scan
 * @param {string} path - Current path for context
 * @returns {Promise<Object>} - Tree structure object
 */
export async function scanDirectory(dirHandle, path = '') {
    // Placeholder - will be fully implemented by feature-logic agent
    // Returns basic structure for now
    return { 
        name: dirHandle.name, 
        type: 'directory', 
        path: path || dirHandle.name,
        children: [], 
        handle: dirHandle 
    };
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
