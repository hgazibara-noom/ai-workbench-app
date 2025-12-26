# AI Workbench - Folder Structure Visualizer

A browser-based tool for visualizing and navigating the AI Workbench folder structure.

## Overview

This application provides a visual representation of projects, features, and agent work items in the AI Workbench system.

## Features

- **Directory Selection**: Use the native File System Access API to select a workspace
- **Tree View Navigation**: Expandable/collapsible folder structure in the left panel
- **File Preview**: View file contents in the right panel with monospace font
- **Status Badges**: Color-coded status indicators for agent folders
- **Dark Theme**: Modern, IDE-like dark theme (Catppuccin-inspired)

## Requirements

- **Browser**: Chrome or Chromium-based browser (required for File System Access API)
- **No build tools**: Pure HTML, CSS, and JavaScript

## Usage

1. Open `index.html` in Chrome
2. Click "Select Workspace" button
3. Choose your workspace directory (e.g., `work/` folder)
4. Navigate the tree view and click files to preview their contents
5. Use "Refresh" to re-scan the directory

## Project Structure

```
app/
├── index.html          # Main HTML entry point
├── css/
│   └── styles.css      # Complete dark theme styling
└── js/
    ├── app.js          # Application entry, event coordination
    ├── scanner.js      # File System Access API logic
    └── renderer.js     # Tree view DOM rendering
```

## Color Palette

| Variable | Color | Purpose |
|----------|-------|---------|
| `--bg-primary` | `#1e1e2e` | Main background |
| `--bg-secondary` | `#2a2a3e` | Panel backgrounds |
| `--text-primary` | `#cdd6f4` | Main text |
| `--accent` | `#89b4fa` | Accent/links |

## Status Badge Colors

- 🟢 **Completed** - Green (`#a6e3a1`)
- 🔴 **Blocked** - Red (`#f38ba8`)
- 🔵 **In Progress** - Blue (`#89b4fa`)
- ⚪ **Not Started** - Gray (`#6c7086`)

## License

Internal use only - AI Workbench Project
