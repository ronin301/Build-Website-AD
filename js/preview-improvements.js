// ============================================================================
// PREVIEW WORKSPACE ENHANCEMENTS
// Better preview detection, controls, and error handling
// ============================================================================

function initPreviewWorkspace() {
    // Preview refresh button
    const refreshBtn = document.getElementById('refresh-preview-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshPreview);
    }

    // Open preview in new tab
    const openTabBtn = document.getElementById('open-preview-tab-btn');
    if (openTabBtn) {
        openTabBtn.addEventListener('click', () => {
            const preview = document.querySelector('iframe[name="preview"]');
            if (preview?.src && preview.src !== 'about:blank') {
                window.open(preview.src, '_blank');
            } else {
                showNotification('Preview not available', 'error');
            }
        });
    }

    // Copy preview URL
    const copyUrlBtn = document.getElementById('copy-preview-url-btn');
    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', () => {
            const preview = document.querySelector('iframe[name="preview"]');
            if (preview?.src && preview.src !== 'about:blank') {
                navigator.clipboard.writeText(preview.src).then(() => {
                    showNotification('URL copied', 'success');
                    copyUrlBtn.textContent = 'Copied ✓';
                    setTimeout(() => { copyUrlBtn.textContent = 'Copy URL'; }, 2000);
                });
            }
        });
    }

    updatePreviewInfo();
}

function updatePreviewInfo() {
    try {
        const project = getCurrentProject();
        if (!project) return;

        const files = parseJsonSafely(localStorage.getItem(`project_files_${project.id}`), []);
        const entryFile = detectEntryFile(files);
        const cssFiles = files.filter(f => f.name.endsWith('.css'));
        const jsFiles = files.filter(f => f.name.endsWith('.js'));

        const infoPanel = document.getElementById('preview-info-panel');
        if (infoPanel) {
            infoPanel.innerHTML = `
                <div class="preview-info">
                    <p><strong>Entry File:</strong> ${entryFile ? entryFile.name : 'Not detected'}</p>
                    <p><strong>CSS Files:</strong> ${cssFiles.length}</p>
                    <p><strong>JS Files:</strong> ${jsFiles.length}</p>
                    <p><strong>Last Built:</strong> ${localStorage.getItem('last_preview_build') || 'Never'}</p>
                </div>
            `;
        }
    } catch (e) {
        console.error("Failed to update preview info:", e);
    }
}

function detectEntryFile(files) {
    const filenames = files.map(f => f.name.toLowerCase());
    
    // Try common entry points
    const common = ['index.html', 'home.html', 'main.html', 'app.html'];
    for (const name of common) {
        if (filenames.includes(name)) {
            return files.find(f => f.name.toLowerCase() === name);
        }
    }
    
    // Fallback to first HTML file
    return files.find(f => f.name.endsWith('.html'));
}

function refreshPreview() {
    const preview = document.querySelector('iframe[name="preview"]');
    if (preview) {
        const src = preview.src;
        preview.src = 'about:blank';
        setTimeout(() => {
            preview.src = src;
            localStorage.setItem('last_preview_build', new Date().toLocaleString());
            updatePreviewInfo();
            showNotification('Preview refreshed', 'success');
        }, 100);
    }
}

function validatePreviewSetup(project) {
    const issues = [];
    const files = parseJsonSafely(localStorage.getItem(`project_files_${project.id}`), []);
    
    if (files.length === 0) {
        issues.push("No files in project");
    }
    
    const hasHtml = files.some(f => f.name.endsWith('.html'));
    if (!hasHtml) {
        issues.push("No HTML files found");
    }

    return {
        valid: issues.length === 0,
        issues
    };
}
