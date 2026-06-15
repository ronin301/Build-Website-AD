// ============================================================================
// WORKFLOW OUTPUT IMPROVEMENTS
// Structured card-based AI output formatting
// ============================================================================

function initWorkflowOutputImprovements() {
    // Override workflow response rendering
    window.displayWorkflowResponse = displayStructuredWorkflowResponse;
}

function displayStructuredWorkflowResponse(response) {
    const output = parseWorkflowResponse(response);
    const container = document.getElementById('workflow-output') || createWorkflowOutputContainer();

    container.innerHTML = `
        <div class="workflow-structured-output">
            ${output.analysis ? renderAnalysisCard(output.analysis) : ''}
            ${output.affectedFiles?.length ? renderAffectedFilesCard(output.affectedFiles) : ''}
            ${output.generatedChanges?.length ? renderChangesCard(output.generatedChanges) : ''}
            ${output.warnings?.length ? renderWarningsCard(output.warnings) : ''}
            ${output.nextActions?.length ? renderActionsCard(output.nextActions) : ''}
            ${output.raw ? renderRawCard(output.raw) : ''}
        </div>
    `;

    // Add copy buttons to all cards
    container.querySelectorAll('.workflow-card').forEach(card => {
        const copyBtn = document.createElement('button');
        copyBtn.className = 'card-copy-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => copyCardContent(card);
        card.querySelector('.card-header')?.appendChild(copyBtn);
    });

    // Add expand/collapse
    container.querySelectorAll('.card-collapse-btn').forEach(btn => {
        btn.onclick = () => {
            const card = btn.closest('.workflow-card');
            card.classList.toggle('collapsed');
        };
    });
}

function renderAnalysisCard(analysis) {
    return `
        <div class="workflow-card">
            <div class="card-header">
                <h4>📊 Project Analysis</h4>
                <button class="card-collapse-btn">−</button>
            </div>
            <div class="card-content">
                <div class="analysis-text">${escapeHtml(analysis)}</div>
            </div>
        </div>
    `;
}

function renderAffectedFilesCard(files) {
    return `
        <div class="workflow-card">
            <div class="card-header">
                <h4>📝 Affected Files (${files.length})</h4>
                <button class="card-collapse-btn">−</button>
            </div>
            <div class="card-content">
                <ul class="affected-files-list">
                    ${files.map(f => `<li><code>${escapeHtml(f)}</code></li>`).join('')}
                </ul>
            </div>
        </div>
    `;
}

function renderChangesCard(changes) {
    return `
        <div class="workflow-card">
            <div class="card-header">
                <h4>⚙️ Generated Changes (${changes.length})</h4>
                <button class="card-collapse-btn">−</button>
            </div>
            <div class="card-content">
                <div class="changes-content">
                    ${changes.map(change => `
                        <div class="change-item">
                            <strong>${escapeHtml(change.file || 'Unknown')}</strong>
                            <pre><code>${escapeHtml(change.content?.substring(0, 500) || '')}</code></pre>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

function renderWarningsCard(warnings) {
    return `
        <div class="workflow-card warning">
            <div class="card-header">
                <h4>⚠️ Warnings</h4>
                <button class="card-collapse-btn">−</button>
            </div>
            <div class="card-content">
                <ul class="warnings-list">
                    ${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
                </ul>
            </div>
        </div>
    `;
}

function renderActionsCard(actions) {
    return `
        <div class="workflow-card">
            <div class="card-header">
                <h4>✓ Next Actions</h4>
                <button class="card-collapse-btn">−</button>
            </div>
            <div class="card-content">
                <ol class="actions-list">
                    ${actions.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
                </ol>
            </div>
        </div>
    `;
}

function renderRawCard(raw) {
    return `
        <div class="workflow-card">
            <div class="card-header">
                <h4>📋 Raw Output</h4>
                <button class="card-collapse-btn">−</button>
            </div>
            <div class="card-content">
                <pre><code>${escapeHtml(raw)}</code></pre>
            </div>
        </div>
    `;
}

function parseWorkflowResponse(response) {
    const output = {
        analysis: '',
        affectedFiles: [],
        generatedChanges: [],
        warnings: [],
        nextActions: [],
        raw: response
    };

    try {
        // Simple pattern matching for common output formats
        const lines = response.split('\n');
        let currentSection = null;

        lines.forEach(line => {
            const trimmed = line.trim();
            
            if (trimmed.toLowerCase().includes('project analysis') || trimmed.toLowerCase().includes('analysis:')) {
                currentSection = 'analysis';
            } else if (trimmed.toLowerCase().includes('affected') || trimmed.toLowerCase().includes('files:')) {
                currentSection = 'files';
            } else if (trimmed.toLowerCase().includes('change') || trimmed.toLowerCase().includes('modification:')) {
                currentSection = 'changes';
            } else if (trimmed.toLowerCase().includes('warning') || trimmed.toLowerCase().includes('issue:')) {
                currentSection = 'warnings';
            } else if (trimmed.toLowerCase().includes('next') || trimmed.toLowerCase().includes('action:')) {
                currentSection = 'actions';
            } else if (trimmed && currentSection) {
                if (currentSection === 'analysis') {
                    output.analysis += trimmed + '\n';
                } else if (currentSection === 'files' && trimmed.startsWith('-')) {
                    output.affectedFiles.push(trimmed.substring(1).trim());
                } else if (currentSection === 'warnings' && trimmed) {
                    output.warnings.push(trimmed);
                } else if (currentSection === 'actions' && trimmed) {
                    output.nextActions.push(trimmed);
                }
            }
        });
    } catch (e) {
        console.warn("Failed to parse workflow response:", e);
    }

    return output;
}

function createWorkflowOutputContainer() {
    let container = document.getElementById('workflow-output');
    if (!container) {
        container = document.createElement('div');
        container.id = 'workflow-output';
        const panel = document.querySelector('[data-section="workflow"]');
        if (panel) {
            panel.appendChild(container);
        }
    }
    return container;
}

function copyCardContent(card) {
    const content = card.querySelector('.card-content')?.textContent || '';
    navigator.clipboard.writeText(content).then(() => {
        const btn = card.querySelector('.card-copy-btn');
        if (btn) {
            btn.textContent = 'Copied ✓';
            setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        }
    });
}
