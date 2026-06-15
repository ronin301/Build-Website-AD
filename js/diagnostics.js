// ============================================================================
// DIAGNOSTICS CENTER
// System status monitoring and debugging
// ============================================================================

function initDiagnosticsCenter() {
    const diagnosticsBtn = document.getElementById('show-diagnostics-btn');
    if (diagnosticsBtn) {
        diagnosticsBtn.addEventListener('click', showDiagnosticsPanel);
    }

    // Auto-populate diagnostics on load
    scheduleDiagnosticsRefresh();
}

function getDiagnosticsStatus() {
    return {
        timestamp: new Date().toISOString(),
        github: getGitHubStatus(),
        ai: getAIProviderStatus(),
        storage: getStorageStatus(),
        project: getProjectStatus(),
        preview: getPreviewStatus(),
        publish: getPublishStatus(),
        performance: getPerformanceMetrics(),
        lastError: getLastError(),
        recentActions: getRecentActions()
    };
}

function getGitHubStatus() {
    try {
        const token = getSecureGitHubToken();
        const repo = getCurrentGitHubRepository();
        const branch = getCurrentGitHubBranch();
        
        return {
            status: token ? 'connected' : 'disconnected',
            repository: repo,
            branch: branch,
            authenticated: !!token,
            icon: token ? '🟢' : '🔴'
        };
    } catch (e) {
        return { status: 'error', message: e.message, icon: '🟡' };
    }
}

function getAIProviderStatus() {
    try {
        const provider = localStorage.getItem('ai_provider') || 'none';
        const hasKey = !!getSecureAIKey(provider);
        
        return {
            provider: provider,
            configured: hasKey,
            status: hasKey ? 'ready' : 'unconfigured',
            icon: hasKey ? '🟢' : '🟡'
        };
    } catch (e) {
        return { status: 'error', message: e.message, icon: '🔴' };
    }
}

function getStorageStatus() {
    try {
        let usage = 0;
        let count = 0;
        const quotaEstimate = {};

        if (navigator.storage?.estimate) {
            return new Promise((resolve) => {
                navigator.storage.estimate().then(estimate => {
                    resolve({
                        usage: estimate.usage,
                        quota: estimate.quota,
                        percentage: Math.round((estimate.usage / estimate.quota) * 100),
                        icon: estimate.usage / estimate.quota > 0.9 ? '🔴' : '🟢'
                    });
                });
            });
        }

        // Fallback: count localStorage items
        const keys = Object.keys(localStorage);
        keys.forEach(k => {
            usage += localStorage.getItem(k).length;
            count++;
        });

        return {
            items: count,
            estimatedSize: `${formatBytes(usage)}`,
            icon: '🟢'
        };
    } catch (e) {
        return { status: 'error', message: e.message, icon: '🟡' };
    }
}

function getProjectStatus() {
    try {
        const current = getCurrentProject();
        const recents = getRecentProjects();
        
        return {
            current: current ? current.name : 'none',
            recentCount: recents.length,
            hasOpenFile: !!getOpenFileInEditor(),
            status: current ? 'active' : 'idle',
            icon: current ? '🟢' : '🟡'
        };
    } catch (e) {
        return { status: 'error', message: e.message, icon: '🔴' };
    }
}

function getPreviewStatus() {
    try {
        const preview = document.querySelector('iframe[name="preview"]');
        const url = preview?.src;
        
        return {
            active: !!preview?.contentDocument,
            url: url,
            status: preview?.contentDocument ? 'ready' : 'not ready',
            icon: preview?.contentDocument ? '🟢' : '🟡'
        };
    } catch (e) {
        return { status: 'error', message: e.message, icon: '🟡' };
    }
}

function getPublishStatus() {
    try {
        const lastPublish = localStorage.getItem('last_publish_time');
        const lastCommit = localStorage.getItem('last_commit_hash');
        
        return {
            lastPublish: lastPublish ? new Date(lastPublish).toLocaleString() : 'never',
            lastCommit: lastCommit ? lastCommit.substring(0, 8) : 'none',
            status: lastPublish ? 'published' : 'not published',
            icon: '🟢'
        };
    } catch (e) {
        return { status: 'error', message: e.message, icon: '🟡' };
    }
}

function getPerformanceMetrics() {
    if (!window.performance) return { unavailable: true };

    const perf = performance.getEntriesByType('navigation')[0];
    return {
        pageLoadTime: perf ? `${Math.round(perf.loadEventEnd - perf.fetchStart)}ms` : 'N/A',
        domReady: perf ? `${Math.round(perf.domContentLoadedEventEnd - perf.fetchStart)}ms` : 'N/A',
        memory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'N/A'
    };
}

function getLastError() {
    return localStorage.getItem('last_error_message') || 'none';
}

function getRecentActions(limit = 5) {
    const log = getActivityLog();
    return log.slice(-limit).map(entry => ({
        type: entry.type,
        message: entry.message.substring(0, 50),
        time: new Date(entry.timestamp).toLocaleTimeString()
    }));
}

function showDiagnosticsPanel() {
    const diagnostics = getDiagnosticsStatus();
    
    const html = `
        <div class="diagnostics-modal">
            <div class="diagnostics-content">
                <div class="diagnostics-header">
                    <h3>🔧 System Diagnostics</h3>
                    <button class="close-btn" onclick="this.closest('.diagnostics-modal').remove()">×</button>
                </div>
                
                <div class="diagnostics-sections">
                    <section class="diagnostics-section">
                        <h4>${diagnostics.github.icon} GitHub</h4>
                        <p>Status: ${diagnostics.github.status}</p>
                        <p>Repository: ${diagnostics.github.repository || 'none'}</p>
                        <p>Branch: ${diagnostics.github.branch || 'none'}</p>
                    </section>

                    <section class="diagnostics-section">
                        <h4>${diagnostics.ai.icon} AI Provider</h4>
                        <p>Provider: ${diagnostics.ai.provider}</p>
                        <p>Status: ${diagnostics.ai.status}</p>
                    </section>

                    <section class="diagnostics-section">
                        <h4>${diagnostics.project.icon} Project</h4>
                        <p>Current: ${diagnostics.project.current}</p>
                        <p>Recent Projects: ${diagnostics.project.recentCount}</p>
                        <p>Open File: ${diagnostics.project.hasOpenFile ? 'yes' : 'no'}</p>
                    </section>

                    <section class="diagnostics-section">
                        <h4>${diagnostics.preview.icon} Preview</h4>
                        <p>Status: ${diagnostics.preview.status}</p>
                        <p>URL: ${diagnostics.preview.url ? diagnostics.preview.url.substring(0, 40) + '...' : 'none'}</p>
                    </section>

                    <section class="diagnostics-section">
                        <h4>${diagnostics.publish.icon} Publish</h4>
                        <p>Last Publish: ${diagnostics.publish.lastPublish}</p>
                        <p>Last Commit: ${diagnostics.publish.lastCommit}</p>
                    </section>

                    <section class="diagnostics-section">
                        <h4>⚙️ Performance</h4>
                        <p>Page Load: ${diagnostics.performance.pageLoadTime}</p>
                        <p>DOM Ready: ${diagnostics.performance.domReady}</p>
                        <p>Memory: ${diagnostics.performance.memory}</p>
                    </section>

                    <section class="diagnostics-section">
                        <h4>📋 Last Error</h4>
                        <p>${diagnostics.lastError}</p>
                    </section>
                </div>

                <div class="diagnostics-footer">
                    <button class="btn-secondary" onclick="exportDiagnostics()">Export</button>
                    <button class="btn-secondary" onclick="clearDiagnosticsData()">Clear Logs</button>
                </div>
            </div>
        </div>
    `;

    const modal = document.createElement('div');
    modal.innerHTML = html;
    document.body.appendChild(modal.firstElementChild);
}

function exportDiagnostics() {
    const diagnostics = getDiagnosticsStatus();
    const text = Object.entries(diagnostics).map(([key, value]) => {
        if (typeof value === 'object') {
            return `${key}:\n  ${JSON.stringify(value, null, 2)}`;
        }
        return `${key}: ${value}`;
    }).join('\n\n');

    downloadTextFile(text, 'diagnostics.txt');
}

function clearDiagnosticsData() {
    if (!confirm("Clear all diagnostic data?")) return;
    
    const keys = Object.keys(localStorage);
    keys.filter(k => k.includes('error') || k.includes('log') || k.includes('diagnostic')).forEach(k => {
        localStorage.removeItem(k);
    });

    showNotification("Diagnostic data cleared", 'success');
    document.querySelector('.diagnostics-modal')?.remove();
}

function scheduleDiagnosticsRefresh() {
    // Refresh diagnostics every 30 seconds if panel open
    setInterval(() => {
        if (document.querySelector('.diagnostics-modal')) {
            showDiagnosticsPanel();
        }
    }, 30000);
}
