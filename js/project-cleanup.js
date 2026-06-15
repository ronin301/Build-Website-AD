// ============================================================================
// PROJECT CLEANUP & MANAGEMENT
// Remove projects from recents, clear caches
// ============================================================================

function initProjectCleanup() {
    // Recent projects remove buttons
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('remove-project-btn')) {
            const projectId = e.target.dataset.projectId;
            const projectName = e.target.dataset.projectName;
            
            if (!confirm(`Remove "${projectName}" from recent projects?\n\nThis only removes local data, not the GitHub repository.`)) {
                return;
            }

            removeProjectFromRecents(projectId);
            e.target.closest('.recent-project-item')?.remove();
            showNotification(`Removed "${projectName}"`, 'success');
        }
    });

    // Clear all recents button
    const clearBtn = document.getElementById('clear-all-recents');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (!confirm("Clear all recent projects? This cannot be undone.\n\nGitHub repositories will not be deleted.")) {
                return;
            }
            clearAllRecentProjects();
            document.querySelectorAll('.recent-project-item').forEach(item => item.remove());
            showNotification("Cleared all recent projects", 'success');
        });
    }
}

function getRecentProjects() {
    return parseJsonSafely(localStorage.getItem('recent_projects'), []);
}

function removeProjectFromRecents(projectId) {
    const recents = getRecentProjects();
    const filtered = recents.filter(p => p.id !== projectId);
    localStorage.setItem('recent_projects', JSON.stringify(filtered));
    
    // Clear project-specific caches
    clearProjectCaches(projectId);
}

function clearAllRecentProjects() {
    localStorage.setItem('recent_projects', JSON.stringify([]));
    
    // Clear all project caches
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
        if (key.includes('project_') || key.includes('scan_') || key.includes('preview_')) {
            localStorage.removeItem(key);
        }
    });
}

function clearProjectCaches(projectId) {
    const cacheKeys = [
        `project_cache_${projectId}`,
        `project_scan_results_${projectId}`,
        `preview_cache_${projectId}`,
        `preview_urls_${projectId}`,
        `workflow_history_${projectId}`,
        `project_state_${projectId}`
    ];

    cacheKeys.forEach(key => {
        if (localStorage.getItem(key)) {
            localStorage.removeItem(key);
        }
    });

    console.log(`[CLEANUP] Cleared caches for project ${projectId}`);
}

// Remove all local data for a project without touching remote GitHub repository
function removeLocalProject(projectId) {
    try {
        const project = findProjectById(projectId);
        if (!project) {
            console.warn('[CLEANUP] Project not found for local removal:', projectId);
            return false;
        }

        // Clear caches and temporary data
        clearProjectCaches(projectId);
        clearProjectActivityLogs(projectId);

        // Remove from recent projects list
        const recents = parseJsonSafely(localStorage.getItem('recent_projects'), []);
        const filtered = (recents || []).filter(p => p.id !== projectId);
        localStorage.setItem('recent_projects', JSON.stringify(filtered));

        // Remove project record (local only)
        if (typeof deleteProjectRecord === 'function') {
            deleteProjectRecord(projectId);
        }

        // If this project is currently open, close workspace and clear last opened
        if (getCurrentProject()?.id === projectId) {
            setCurrentProject(null);
            if (typeof hideWorkspace === 'function') hideWorkspace();
        }

        if (typeof getLastOpenedProject === 'function' && getLastOpenedProject() === projectId) {
            if (typeof clearLastOpenedProject === 'function') clearLastOpenedProject();
        }

        console.log(`[CLEANUP] Removed local project ${projectId}`);
        if (typeof renderProjects === 'function') renderProjects();
        showNotification(`Removed local project: ${project.name}`, 'success');
        return true;
    } catch (error) {
        console.error('[CLEANUP] removeLocalProject failed:', error);
        return false;
    }
}
