// ============================================================================
// EDITOR ENHANCEMENTS
// File operations, save shortcuts, reload, copy, rename, delete
// ============================================================================

function initEditorEnhancements() {
    // Save shortcut (Ctrl+S / Cmd+S)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveOpenFile();
        }
    });

    // Editor action buttons
    const saveBtn = document.getElementById('save-file-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveOpenFile);

    const reloadBtn = document.getElementById('reload-file-btn');
    if (reloadBtn) reloadBtn.addEventListener('click', reloadOpenFile);

    const copyBtn = document.getElementById('copy-file-btn');
    if (copyBtn) copyBtn.addEventListener('click', copyFileContent);

    const renameBtn = document.getElementById('rename-file-btn');
    if (renameBtn) renameBtn.addEventListener('click', renameOpenFile);

    const deleteBtn = document.getElementById('delete-file-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', deleteOpenFile);

    const createFileBtn = document.getElementById('create-file-btn');
    if (createFileBtn) createFileBtn.addEventListener('click', showCreateFileDialog);

    const createFolderBtn = document.getElementById('create-folder-btn');
    if (createFolderBtn) createFolderBtn.addEventListener('click', showCreateFolderDialog);
}

let currentOpenFile = null;
let fileHasUnsavedChanges = false;

function setOpenFile(fileName) {
    currentOpenFile = fileName;
    fileHasUnsavedChanges = false;
    updateEditorUI();
}

function markFileDirty() {
    fileHasUnsavedChanges = true;
    const indicator = document.getElementById('unsaved-changes-indicator');
    if (indicator) {
        indicator.textContent = '●';
        indicator.title = 'Unsaved changes';
    }
}

function updateEditorUI() {
    const statusBar = document.getElementById('editor-status-bar');
    if (statusBar) {
        statusBar.innerHTML = `
            ${currentOpenFile ? `<span>${currentOpenFile}</span>` : '<span>No file open</span>'}
            ${fileHasUnsavedChanges ? '<span class="unsaved-indicator" id="unsaved-changes-indicator">●</span>' : ''}
        `;
    }
}

async function saveOpenFile() {
    if (!currentOpenFile) {
        showNotification('No file open', 'warning');
        return;
    }

    try {
        const editor = document.querySelector('.editor-content');
        const content = editor?.textContent || '';

        const project = getCurrentProject();
        const result = await updateProjectFile(project, currentOpenFile, content);

        if (result.success) {
            fileHasUnsavedChanges = false;
            removeUnsavedIndicator(currentOpenFile);
            updateEditorUI();
            showNotification(`Saved "${currentOpenFile}"`, 'success');
            localStorage.setItem('last_saved_time', new Date().toISOString());
        } else {
            showNotification(`Save failed: ${result.message}`, 'error');
        }
    } catch (error) {
        showNotification(`Save error: ${error.message}`, 'error');
    }
}

async function reloadOpenFile() {
    if (!currentOpenFile) {
        showNotification('No file open', 'warning');
        return;
    }

    if (fileHasUnsavedChanges && !confirm('You have unsaved changes. Reload anyway?')) {
        return;
    }

    try {
        const project = getCurrentProject();
        await openFileInEditor(currentOpenFile);
        fileHasUnsavedChanges = false;
        updateEditorUI();
        showNotification(`Reloaded "${currentOpenFile}"`, 'success');
    } catch (error) {
        showNotification(`Reload failed: ${error.message}`, 'error');
    }
}

async function copyFileContent() {
    if (!currentOpenFile) {
        showNotification('No file open', 'warning');
        return;
    }

    try {
        const editor = document.querySelector('.editor-content');
        const content = editor?.textContent || '';
        
        await navigator.clipboard.writeText(content);
        showNotification(`Copied "${currentOpenFile}" to clipboard`, 'success');
    } catch (error) {
        showNotification(`Copy failed: ${error.message}`, 'error');
    }
}

async function renameOpenFile() {
    if (!currentOpenFile) {
        showNotification('No file open', 'warning');
        return;
    }

    const newName = prompt(`Rename "${currentOpenFile}" to:`, currentOpenFile);
    if (!newName || newName === currentOpenFile) return;

    try {
        const project = getCurrentProject();
        
        // Copy to new name
        const editor = document.querySelector('.editor-content');
        const content = editor?.textContent || '';
        await updateProjectFile(project, newName, content);
        
        // Delete old
        await deleteProjectFile(project, currentOpenFile);
        
        currentOpenFile = newName;
        updateEditorUI();
        refreshProjectExplorer();
        showNotification(`Renamed to "${newName}"`, 'success');
    } catch (error) {
        showNotification(`Rename failed: ${error.message}`, 'error');
    }
}

async function deleteOpenFile() {
    if (!currentOpenFile) {
        showNotification('No file open', 'warning');
        return;
    }

    if (!confirm(`Delete "${currentOpenFile}"? This cannot be undone.`)) {
        return;
    }

    try {
        const project = getCurrentProject();
        await deleteProjectFile(project, currentOpenFile);
        
        currentOpenFile = null;
        fileHasUnsavedChanges = false;
        updateEditorUI();
        document.querySelector('.editor-content').innerHTML = '';
        refreshProjectExplorer();
        showNotification(`Deleted "${currentOpenFile}"`, 'success');
    } catch (error) {
        showNotification(`Delete failed: ${error.message}`, 'error');
    }
}

function showCreateFileDialog() {
    const fileName = prompt('New file name:', 'untitled.txt');
    if (!fileName) return;

    createNewFile(fileName);
}

function showCreateFolderDialog() {
    const folderName = prompt('New folder name:', 'new-folder');
    if (!folderName) return;

    createNewFolder(folderName);
}

async function createNewFile(fileName) {
    try {
        const project = getCurrentProject();
        await updateProjectFile(project, fileName, '');
        refreshProjectExplorer();
        showNotification(`Created "${fileName}"`, 'success');
    } catch (error) {
        showNotification(`Create failed: ${error.message}`, 'error');
    }
}

async function createNewFolder(folderName) {
    try {
        const project = getCurrentProject();
        const marker = folderName + '/.gitkeep';
        await updateProjectFile(project, marker, '');
        refreshProjectExplorer();
        showNotification(`Created folder "${folderName}"`, 'success');
    } catch (error) {
        showNotification(`Create failed: ${error.message}`, 'error');
    }
}

// Detect unsaved changes
document.addEventListener('input', () => {
    if (currentOpenFile) {
        markFileDirty();
    }
});
