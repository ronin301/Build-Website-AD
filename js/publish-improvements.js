// ============================================================================
// PUBLISH WORKFLOW ENHANCEMENTS
// Validation, status info, and improved publishing
// ============================================================================

function initPublishWorkflow() {
    const publishBtn = document.getElementById('publish-btn');
    if (publishBtn) {
        publishBtn.addEventListener('click', validateAndPublish);
    }

    updatePublishInfo();
}

function updatePublishInfo() {
    try {
        const project = getCurrentProject();
        if (!project) return;

        const publishInfo = {
            repository: project.githubPath || 'Not set',
            branch: getCurrentGitHubBranch() || 'Not set',
            lastPublish: localStorage.getItem('last_publish_time') || 'Never',
            lastCommit: localStorage.getItem('last_commit_hash') || 'None',
            url: localStorage.getItem('published_url') || 'Not available'
        };

        const infoPanel = document.getElementById('publish-info-panel');
        if (infoPanel) {
            infoPanel.innerHTML = `
                <div class="publish-info">
                    <p><strong>Repository:</strong> ${publishInfo.repository}</p>
                    <p><strong>Branch:</strong> ${publishInfo.branch}</p>
                    <p><strong>Last Publish:</strong> ${publishInfo.lastPublish}</p>
                    <p><strong>Last Commit:</strong> <code>${publishInfo.lastCommit}</code></p>
                    ${publishInfo.url !== 'Not available' ? `<p><strong>Published URL:</strong> <a href="${publishInfo.url}" target="_blank">${publishInfo.url}</a></p>` : ''}
                </div>
            `;
        }
    } catch (e) {
        console.error("Failed to update publish info:", e);
    }
}

async function validateAndPublish() {
    console.group("Publish Validation");

    const validation = {
        issues: [],
        warnings: [],
        ready: true
    };

    try {
        // Check repository selected
        const repo = getCurrentGitHubRepository();
        if (!repo) {
            validation.issues.push("No GitHub repository selected");
            validation.ready = false;
        }

        // Check branch selected
        const branch = getCurrentGitHubBranch();
        if (!branch) {
            validation.issues.push("No branch selected");
            validation.ready = false;
        }

        // Check token
        const token = getSecureGitHubToken();
        if (!token) {
            validation.issues.push("GitHub authentication required");
            validation.ready = false;
        }

        // Check for credential leaks
        const project = getCurrentProject();
        if (project) {
            const files = parseJsonSafely(localStorage.getItem(`project_files_${project.id}`), []);
            const hasLeaks = await checkForCredentialLeaks(files, project);
            if (hasLeaks.found) {
                validation.warnings.push(`Potential secrets detected in ${hasLeaks.count} files - review before publishing`);
            }
        }

        // Check required files
        const preview = document.querySelector('iframe[name="preview"]');
        if (!preview?.src || preview.src === 'about:blank') {
            validation.warnings.push("Preview not available - files may not render correctly");
        }

        console.table(validation);

        // Show validation results
        showPublishValidationDialog(validation);

        if (validation.ready) {
            showNotification("Ready to publish", 'success');
        } else {
            showNotification("Fix issues before publishing", 'error');
        }

    } catch (error) {
        console.error("Validation failed:", error);
        validation.issues.push(error.message);
        showPublishValidationDialog(validation);
    } finally {
        console.groupEnd();
    }
}

async function checkForCredentialLeaks(files, project) {
    const result = { found: false, count: 0 };

    try {
        const contents = await readProjectFiles(project);
        const secretPatterns = [
            /sk-[\w\-]{20,}/gi,
            /ghp_[\w\-]{20,}/gi,
            /github_pat_[\w\-]{20,}/gi,
            /AIza[0-9A-Za-z\-_]{35}[\w]/gi
        ];

        Object.entries(contents).forEach(([fileName, content]) => {
            if (!content) return;
            const text = String(content).substring(0, 50000);
            
            secretPatterns.forEach(pattern => {
                if (pattern.test(text)) {
                    result.found = true;
                    result.count++;
                }
            });
        });
    } catch (e) {
        console.warn("Credential check failed:", e);
    }

    return result;
}

function showPublishValidationDialog(validation) {
    const modal = document.createElement('div');
    modal.className = 'validation-modal';
    modal.innerHTML = `
        <div class="validation-content">
            <h3>🚀 Publish Validation</h3>
            
            ${validation.issues.length ? `
                <div class="validation-issues">
                    <h4>❌ Issues (must fix):</h4>
                    <ul>
                        ${validation.issues.map(i => `<li>${i}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}

            ${validation.warnings.length ? `
                <div class="validation-warnings">
                    <h4>⚠️ Warnings:</h4>
                    <ul>
                        ${validation.warnings.map(w => `<li>${w}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}

            ${validation.issues.length === 0 ? `
                <div class="validation-success">
                    <h4>✓ Ready to publish!</h4>
                    <button class="btn-primary" onclick="executePublish()">Publish Now</button>
                </div>
            ` : ''}

            <button class="btn-secondary" onclick="this.closest('.validation-modal').remove()">Close</button>
        </div>
    `;

    document.body.appendChild(modal);
}

async function executePublish() {
    try {
        showNotification("Publishing...", 'info');
        
        const result = await publishToGitHub();
        
        if (result.success) {
            localStorage.setItem('last_publish_time', new Date().toISOString());
            localStorage.setItem('published_url', result.url || '');
            updatePublishInfo();
            showNotification("Published successfully!", 'success');
            document.querySelector('.validation-modal')?.remove();
        } else {
            showNotification(`Publish failed: ${result.message}`, 'error');
        }
    } catch (error) {
        showNotification(`Publish error: ${error.message}`, 'error');
    }
}
