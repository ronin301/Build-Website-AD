// ============================================================================
// FILE EXPLORER ENHANCEMENTS
// Search, expand/collapse, file icons, etc
// ============================================================================

function initFileExplorerEnhancements() {
    // Expand all button
    const expandAllBtn = document.getElementById('expand-all-files-btn');
    if (expandAllBtn) {
        expandAllBtn.addEventListener('click', expandAllFolders);
    }

    // Collapse all button
    const collapseAllBtn = document.getElementById('collapse-all-files-btn');
    if (collapseAllBtn) {
        collapseAllBtn.addEventListener('click', collapseAllFolders);
    }

    // Search files
    const searchInput = document.getElementById('file-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterFiles(e.target.value));
    }

    // Remember expanded state
    loadExpandedFolderState();
    
    // Save expanded state on changes
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('folder-toggle')) {
            setTimeout(saveExpandedFolderState, 100);
        }
    });
}

const EXPANDED_FOLDERS_KEY = 'expanded_folders_state_v1';

function saveExpandedFolderState() {
    const expanded = [];
    document.querySelectorAll('.folder-item.expanded').forEach(item => {
        const name = item.getAttribute('data-folder-path');
        if (name) expanded.push(name);
    });
    localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify(expanded));
}

function loadExpandedFolderState() {
    const expanded = parseJsonSafely(localStorage.getItem(EXPANDED_FOLDERS_KEY), []);
    expanded.forEach(path => {
        const item = document.querySelector(`[data-folder-path="${path}"]`);
        if (item) item.classList.add('expanded');
    });
}

function expandAllFolders() {
    document.querySelectorAll('.folder-item').forEach(folder => {
        folder.classList.add('expanded');
    });
    saveExpandedFolderState();
    showNotification('All folders expanded', 'success');
}

function collapseAllFolders() {
    document.querySelectorAll('.folder-item').forEach(folder => {
        folder.classList.remove('expanded');
    });
    saveExpandedFolderState();
    showNotification('All folders collapsed', 'success');
}

function filterFiles(searchTerm) {
    const term = searchTerm.toLowerCase();
    let visibleCount = 0;

    document.querySelectorAll('.file-item, .folder-item').forEach(item => {
        const name = item.textContent.toLowerCase();
        const match = name.includes(term);
        
        if (match) {
            item.style.display = '';
            item.classList.add('search-highlight');
            visibleCount++;
        } else {
            item.style.display = 'none';
            item.classList.remove('search-highlight');
        }
    });

    // Show/hide empty parent folders
    document.querySelectorAll('.folder-item').forEach(folder => {
        const children = folder.querySelectorAll('.file-item, .folder-item');
        const visibleChildren = Array.from(children).filter(c => c.style.display !== 'none');
        
        if (visibleChildren.length === 0 && folder.classList.contains('search-highlight')) {
            folder.style.display = 'none';
        } else if (visibleChildren.length > 0) {
            folder.style.display = '';
        }
    });

    console.log(`[SEARCH] Found ${visibleCount} matching items`);
}

function getFileIcon(filename) {
    const ext = filename.includes('.') ? '.' + filename.split('.').pop().toLowerCase() : '';
    
    const iconMap = {
        '.html': '🌐',
        '.css': '🎨',
        '.js': '⚙️',
        '.json': '📋',
        '.md': '📝',
        '.txt': '📄',
        '.png': '🖼️',
        '.jpg': '🖼️',
        '.jpeg': '🖼️',
        '.gif': '🖼️',
        '.svg': '🎭',
        '.webp': '🖼️',
        '.ico': '🎯',
        '.zip': '📦',
        '.tar': '📦',
        '.gz': '📦',
        '.yml': '⚙️',
        '.yaml': '⚙️',
        '.xml': '📋',
        '.env': '🔐',
        '.git': '🔧',
        '.folder': '📁'
    };
    
    return iconMap[ext] || '📄';
}

function getRecentlyOpenedFiles() {
    const history = parseJsonSafely(localStorage.getItem('file_open_history'), []);
    return history.slice(-10).reverse(); // Return last 10, most recent first
}

function recordFileOpen(filePath) {
    let history = parseJsonSafely(localStorage.getItem('file_open_history'), []);
    history = history.filter(f => f !== filePath); // Remove if exists
    history.push(filePath); // Add to end
    history = history.slice(-50); // Keep last 50
    localStorage.setItem('file_open_history', JSON.stringify(history));
}

function renderRecentlyOpenedFiles() {
    const recent = getRecentlyOpenedFiles();
    const container = document.getElementById('recently-opened-files');
    
    if (!container || recent.length === 0) return;

    container.innerHTML = `
        <div class="recently-opened-list">
            ${recent.map(file => `
                <div class="recent-file-item" onclick="openFileInEditor('${escapeHtml(file)}')">
                    ${getFileIcon(file)} ${file}
                </div>
            `).join('')}
        </div>
    `;
}

function highlightCurrentFile(fileName) {
    document.querySelectorAll('.file-item').forEach(item => {
        item.classList.remove('current-file');
    });

    const match = document.querySelector(`.file-item[data-filename="${fileName}"]`);
    if (match) {
        match.classList.add('current-file');
    }
}

function addUnsavedIndicator(fileName) {
    const item = document.querySelector(`.file-item[data-filename="${fileName}"]`);
    if (item) {
        item.classList.add('unsaved');
        const indicator = document.createElement('span');
        indicator.className = 'unsaved-indicator';
        indicator.textContent = ' •';
        item.appendChild(indicator);
    }
}

function removeUnsavedIndicator(fileName) {
    const item = document.querySelector(`.file-item[data-filename="${fileName}"]`);
    if (item) {
        item.classList.remove('unsaved');
        item.querySelector('.unsaved-indicator')?.remove();
    }
}
