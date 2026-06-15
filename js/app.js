let openFileName = null;
let editorDirty = false;
let githubConnected = false;
let activePreviewUrls = [];

function $(id) {
    return document.getElementById(id);
}

function revokePreviewUrls() {
    activePreviewUrls.forEach(url => {
        try {
            URL.revokeObjectURL(url);
        } catch (error) {
            console.warn("Failed to revoke preview URL:", url, error);
        }
    });
    activePreviewUrls = [];
}

function closePreviewModal() {
    revokePreviewUrls();
    $("previewModal").classList.add("hidden");
    $("previewFrame").src = "about:blank";
}

function resetEditorUI() {
    openFileName = null;
    editorDirty = false;
    $("editorFileName").textContent = "No file open";
    $("editorFileMeta").textContent = "Select a file from the explorer to inspect or edit.";
    $("workflowTargetFile").value = "";
    $("fileEditor").value = "";
    $("fileEditor").disabled = true;
    $("saveFileBtn").disabled = true;
}

function normalizeScanSummary(scan) {
    if (!scan) return null;

    const fileTypes = scan.fileTypes || scan.filesByType || {};
    return {
        totalFiles: scan.totalFiles || 0,
        htmlFiles: scan.htmlFiles ?? fileTypes.markup ?? fileTypes.html ?? 0,
        cssFiles: scan.cssFiles ?? fileTypes.style ?? fileTypes.css ?? 0,
        jsFiles: scan.jsFiles ?? fileTypes.script ?? fileTypes.js ?? 0,
        jsonFiles: scan.jsonFiles ?? fileTypes.data ?? fileTypes.json ?? 0,
        totalFolders: scan.totalFolders || 0
    };
}

function prepareProjectSwitchUI(nextProject, previousProject) {
    console.group("Project Switch");
    console.table([{
        fromProject: previousProject?.name || "(none)",
        toProject: nextProject?.name || "(none)",
        fromBranch: previousProject?.settings?.githubBranch || "(none)",
        toBranch: nextProject?.settings?.githubBranch || getGitHubSettings().defaultBranch || "main"
    }]);
    console.groupEnd();

    closePreviewModal();
    resetEditorUI();
    $("fileExplorer").innerHTML = '<p class="empty-state">Loading project files...</p>';
    $("activityLog").textContent = "Loading activity log...";
    $("projectSummary").textContent = nextProject
        ? `Loading ${nextProject.name}...`
        : "No project open";
    $("repoSummary").textContent = "Loading repository data...";
    $("commitHistory").textContent = "Loading commit history...";
    $("pullRequestList").textContent = "Loading pull requests...";
    $("stagedChangesList").innerHTML = '<p class="empty-state">No staged changes yet</p>';
    $("diffViewer").textContent = "Select or generate a staged change to view the diff.";
    $("commitMessageInput").value = "";
    setWorkflowStatus("idle", nextProject ? "Loading" : "Idle");
}

function openModal() {
    $("projectModal").classList.remove("hidden");
    $("projectName").focus();
}

function closeModal() {
    $("projectModal").classList.add("hidden");
    $("projectName").value = "";
}

function openSettingsModal() {
    loadGitHubSettingsToUI();
    $("settingsModal").classList.remove("hidden");
}

function closeSettingsModal() {
    $("settingsModal").classList.add("hidden");
}

function openAiSettingsModal() {
    loadAISettingsToUI(getCurrentAISettings());
    $("aiSettingsModal").classList.remove("hidden");
}

function closeAiSettingsModal() {
    $("aiSettingsModal").classList.add("hidden");
}

function hideWorkspace() {
    $("workspaceScreen").classList.add("hidden");
    $("homeScreen").classList.remove("hidden");
}

function showWorkspace() {
    $("homeScreen").classList.add("hidden");
    $("workspaceScreen").classList.remove("hidden");
}

function updateGitHubStatus(connected, message) {
    githubConnected = connected;
    const badge = $("githubStatus");
    if (!badge) return;

    badge.textContent = message || (connected ? "GitHub Connected" : "GitHub Disconnected");
    badge.classList.toggle("disconnected", !connected);
    badge.classList.toggle("neutral", false);
}

function updateProviderBadge() {
    const badge = $("providerStatus");
    if (!badge) return;

    const aiSettings = getCurrentAISettings();
    badge.textContent = getProviderLabel(aiSettings.activeProvider);
    badge.classList.add("neutral");
}

function setWorkflowStatus(status, label) {
    const badge = $("workflowStatusBadge");
    if (!badge) return;

    badge.className = `workflow-badge ${status}`;
    badge.textContent = label;
}

function renderWorkspaceUI(project) {
    showWorkspace();
    $("workspaceProjectName").textContent = project.name;
    $("workspaceFolderPath").textContent = project.githubPath || getProjectGitHubPath(project.name);
    $("activeBranchBadge").textContent = `Branch: ${getCurrentGitHubBranch()}`;
    $("workflowTargetFile").value = getWorkspaceState().openFile || "";

    updateProviderBadge();
    updateProjectSummaryUI(project);
    renderActivityLog(project.id);
    renderPendingWorkflow();
}

function updateProjectSummaryUI(project) {
    const scan = normalizeScanSummary(getWorkspaceState().scanResult);
    const settings = getGitHubSettings();
    const pending = getWorkspaceState().pendingWorkflow;
    const aiSettings = getCurrentAISettings();

    $("projectSummary").textContent = [
        `Project: ${project.name}`,
        `GitHub Path: ${project.githubPath}`,
        `Repository: ${settings.repoOwner}/${settings.repoName}`,
        `Branch: ${getCurrentGitHubBranch()}`,
        `Provider: ${getProviderLabel(aiSettings.activeProvider)} (${aiSettings.providers[aiSettings.activeProvider].model})`,
        `Files Tracked: ${Object.keys(project.fileShas || {}).length}`,
        `Chat Messages: ${(project.chatHistory || []).length}`,
        `Build History: ${(project.buildHistory || []).length}`,
        scan
            ? `Last Scan: ${scan.totalFiles} files, ${scan.htmlFiles} html, ${scan.cssFiles} css, ${scan.jsFiles} js`
            : "Last Scan: not run yet",
        pending ? `Staged Workflow Changes: ${pending.changes.length}` : "Staged Workflow Changes: 0",
        `GitHub Status: ${githubConnected ? "Connected" : "Disconnected"}`
    ].join("\n");
}

function renderProjects() {
    const projects = getProjects();
    const list = $("projectsList");
    list.innerHTML = "";

    if (projects.length === 0) {
        list.innerHTML = '<p class="empty-state">No projects yet. Configure GitHub, then create or sync a project.</p>';
        return;
    }

    projects.forEach(project => {
        const normalized = normalizeProjectSettings(project.settings);
        const card = document.createElement("div");
        card.className = "project-card";
        card.innerHTML = `
            <h3>${escapeHtml(project.name)}</h3>
            <p>${escapeHtml(project.githubPath || "GitHub project")}</p>
            <div class="meta">Branch ${escapeHtml(normalized.githubBranch)} · Updated ${new Date(project.updatedAt).toLocaleString()}</div>
        `;
        card.addEventListener("click", () => openProject(project));
        list.appendChild(card);
    });
}

async function refreshFileExplorer(force = false) {
    const project = getCurrentProject();
    const explorer = $("fileExplorer");

    if (!project) {
        explorer.innerHTML = '<p class="empty-state">No project open</p>';
        return;
    }

    try {
        console.group("Explorer Refresh");
        console.table([{
            project: project.name,
            branch: getCurrentGitHubBranch(),
            githubPath: project.githubPath || getProjectGitHubPath(project.name),
            force
        }]);
        const result = await scanProject(project, { force });
        if (!result.success) {
            explorer.innerHTML = `<p class="empty-state">${escapeHtml(result.message)}</p>`;
            console.warn("Explorer refresh returned an unsuccessful result:", result);
            return;
        }

        const tree = Array.isArray(result.tree) ? result.tree : getWorkspaceState().fileTree || [];
        renderFileTree(tree, explorer);
        updateProjectSummaryUI(findProjectById(project.id) || project);
    } catch (error) {
        explorer.innerHTML = `<p class="empty-state">Error: ${escapeHtml(error.message)}</p>`;
        console.error("Explorer refresh failed:", error);
    } finally {
        console.groupEnd();
    }
}

function renderFileTree(tree, container) {
    container.innerHTML = "";

    if (!tree || tree.length === 0) {
        container.innerHTML = '<p class="empty-state">No files found on this branch</p>';
        return;
    }

    tree.forEach(item => renderTreeItem(item, container, 0));
}

function renderTreeItem(item, container, depth) {
    if (item.type === "folder") {
        const folder = document.createElement("div");
        folder.className = "folder-item";
        folder.style.paddingLeft = `${depth * 14}px`;
        folder.textContent = `📁 ${item.name}`;
        container.appendChild(folder);

        const children = document.createElement("div");
        children.className = "folder-children";
        (item.children || []).forEach(child => {
            renderTreeItem(child, children, depth + 1);
        });
        container.appendChild(children);
        return;
    }

    container.appendChild(createFileElement(item.fullName || item.name, depth));
}

function createFileElement(fileName, depth = 0) {
    const normalizedFileName = typeof normalizeProjectRelativePath === "function"
        ? normalizeProjectRelativePath(fileName)
        : fileName;
    const element = document.createElement("div");
    element.className = "file-item";
    element.dataset.filePath = normalizedFileName;
    element.style.paddingLeft = `${depth * 14}px`;
    if (openFileName === normalizedFileName) element.classList.add("active");

    const icon = normalizedFileName.endsWith(".html")
        ? "📄"
        : normalizedFileName.endsWith(".css")
            ? "🎨"
            : normalizedFileName.endsWith(".js")
                ? "⚡"
                : normalizedFileName.endsWith(".json")
                    ? "🧾"
                    : "📄";

    element.textContent = `${icon} ${normalizedFileName}`;
    element.addEventListener("click", () => openFileInEditor(normalizedFileName));
    return element;
}

async function openFileInEditor(fileName) {
    const project = getCurrentProject();
    if (!project) return;

    try {
        const normalizedFileName = typeof normalizeProjectRelativePath === "function"
            ? normalizeProjectRelativePath(fileName)
            : fileName;

        console.group("File Open");
        console.table([{
            project: project.name,
            branch: getCurrentGitHubBranch(),
            requestedPath: String(fileName || ""),
            normalizedPath: normalizedFileName
        }]);

        const content = await readProjectFile(project, normalizedFileName);
        openFileName = normalizedFileName;
        editorDirty = false;

        $("editorFileName").textContent = normalizedFileName;
        $("editorFileMeta").textContent = `Editing ${normalizedFileName} on ${getCurrentGitHubBranch()}`;
        $("workflowTargetFile").value = normalizedFileName;
        $("fileEditor").value = content || "";
        $("fileEditor").disabled = false;
        $("saveFileBtn").disabled = false;

        updateWorkspaceState({
            openFile: normalizedFileName,
            editorContent: content || ""
        });
        saveWorkspace();

        document.querySelectorAll(".file-item").forEach(element => {
            element.classList.toggle("active", element.dataset.filePath === normalizedFileName);
        });
    } catch (error) {
        console.error("File open failed:", error);
        alert(`Could not open ${fileName}: ${error.message}`);
    } finally {
        console.groupEnd();
    }
}

function renderPendingWorkflow() {
    const pending = getWorkspaceState().pendingWorkflow;
    const list = $("stagedChangesList");
    const diff = $("diffViewer");

    $("approveWorkflowBtn").disabled = !pending || !pending.changes.some(change => change.requiresCommit);
    $("discardWorkflowBtn").disabled = !pending;
    $("commitMessageInput").value = pending?.commitMessage || "";
    $("stagedChangeCount").textContent = `${pending?.changes?.length || 0} changes`;

    if (!pending || !pending.changes.length) {
        list.innerHTML = '<p class="empty-state">No staged changes yet</p>';
        diff.textContent = "Select or generate a staged change to view the diff.";
        setWorkflowStatus("idle", "Idle");
        return;
    }

    list.innerHTML = "";
    pending.changes.forEach((change, index) => {
        const item = document.createElement("div");
        item.className = `staged-change-item ${getWorkspaceState().activeDiffIndex === index ? "active" : ""}`;
        item.innerHTML = `
            <div class="staged-change-title">${escapeHtml(change.type.toUpperCase())} · ${escapeHtml(change.displayPath || change.path || "selection")}</div>
            <div class="staged-change-meta">${escapeHtml(change.summary || change.explanation || (change.requiresCommit ? "Ready for approval" : "Explanation only"))}</div>
        `;
        item.addEventListener("click", () => {
            updateWorkspaceState({ activeDiffIndex: index });
            renderPendingWorkflow();
            saveWorkspace();
        });
        list.appendChild(item);
    });

    const activeChange = pending.changes[getWorkspaceState().activeDiffIndex] || pending.changes[0];
    diff.textContent = activeChange.diff || "No diff available.";
    setWorkflowStatus("ready", "Preview Ready");
}

function renderBranchOptions(branches) {
    const select = $("branchSelect");
    const activeBranch = getCurrentGitHubBranch();

    select.innerHTML = "";
    branches.forEach(branch => {
        const option = document.createElement("option");
        option.value = branch.name;
        option.textContent = branch.name;
        option.selected = branch.name === activeBranch;
        select.appendChild(option);
    });

    if (!select.value && activeBranch) {
        const option = document.createElement("option");
        option.value = activeBranch;
        option.textContent = activeBranch;
        option.selected = true;
        select.appendChild(option);
    }
}

function renderCommitHistory(commits) {
    const container = $("commitHistory");
    if (!commits?.length) {
        container.textContent = "No commits found for this project path on the active branch.";
        return;
    }

    container.innerHTML = commits.map(commit => {
        const sha = commit.sha.slice(0, 7);
        const message = commit.commit?.message?.split("\n")[0] || "No message";
        const author = commit.commit?.author?.name || "Unknown";
        const time = new Date(commit.commit?.author?.date || Date.now()).toLocaleString();
        return `<div><strong>${escapeHtml(sha)}</strong> ${escapeHtml(message)}\n${escapeHtml(author)} · ${escapeHtml(time)}</div>`;
    }).join("\n\n");
}

function renderPullRequestList(prs) {
    const container = $("pullRequestList");
    if (!prs?.length) {
        container.textContent = "No pull requests found.";
        return;
    }

    container.innerHTML = prs.map(pr => {
        const status = pr.state === "open" ? "Open" : pr.state;
        return `<div><strong>#${pr.number}</strong> ${escapeHtml(pr.title)}\n${escapeHtml(pr.head.ref)} -> ${escapeHtml(pr.base.ref)} · ${escapeHtml(status)}</div>`;
    }).join("\n\n");
}

function renderRepoSummary(overview) {
    $("repoSummary").textContent = [
        `Repository: ${overview.name}`,
        `Visibility: ${overview.visibility}`,
        `Default Branch: ${overview.defaultBranch}`,
        `Current Branch: ${overview.currentBranch}`,
        `Base Folder: ${overview.baseFolder}`,
        `Projects in Base Folder: ${overview.projectCount}`,
        `Branches: ${overview.branchCount}`,
        `Open Pull Requests: ${overview.openPullRequests}`,
        `Updated: ${new Date(overview.updatedAt).toLocaleString()}`
    ].join("\n");
}

async function refreshRepositoryInsights() {
    const project = getCurrentProject();
    if (!project) return;

    try {
        const [overview, branches, commits, prs] = await Promise.all([
            getRepositoryOverview(),
            listBranches(),
            listCommitHistory(project, getCurrentGitHubBranch()),
            listPullRequests("open")
        ]);

        renderRepoSummary(overview);
        renderBranchOptions(branches);
        renderCommitHistory(commits);
        renderPullRequestList(prs);

        updateWorkspaceState({
            repoInsights: { overview, branches, commits, prs }
        });
        saveWorkspace();
    } catch (error) {
        $("repoSummary").textContent = `Could not load repository insights: ${error.message}`;
    }
}

async function handleSaveFile() {
    const project = getCurrentProject();
    if (!project || !openFileName) return;

    const content = $("fileEditor").value;
    $("saveFileBtn").disabled = true;
    $("saveFileBtn").textContent = "Committing...";

    try {
        const result = await createOrUpdateFile(project, openFileName, content);
        const updated = findProjectById(project.id);
        setCurrentProject(updated);
        editorDirty = false;

        await syncManifestToGitHub(updated);
        await refreshFileExplorer();
        await refreshRepositoryInsights();
        updateProjectSummaryUI(updated);
        alert(`Committed ${openFileName} on ${getCurrentGitHubBranch()} (${result.action})`);
    } catch (error) {
        alert(`Save failed: ${error.message}`);
    } finally {
        $("saveFileBtn").disabled = false;
        $("saveFileBtn").textContent = "Save & Commit";
    }
}

async function handleCreateProject() {
    const name = $("projectName").value.trim();
    if (!name) {
        alert("Enter a project name");
        return;
    }

    $("saveProjectBtn").disabled = true;
    $("saveProjectBtn").textContent = "Creating...";

    try {
        await createProject(name);
        renderProjects();
        closeModal();
    } catch (error) {
        alert(`Create failed: ${error.message}`);
    } finally {
        $("saveProjectBtn").disabled = false;
        $("saveProjectBtn").textContent = "Create & Open";
    }
}

async function handleSaveGitHubSettings() {
    const settings = readGitHubSettingsFromUI();
    if (!settings.githubToken || !settings.repoOwner || !settings.repoName) {
        alert("GitHub token, repository owner, and repository name are required");
        return;
    }

    // Clear old UI and cached repo/project state before attempting a new connection
    console.group("Repository Load");
    try {
        console.log("Clearing old repository UI and workspace state before loading new repository");
        if (typeof resetWorkspaceState === "function") resetWorkspaceState();
        const explorer = $("fileExplorer");
        if (explorer) explorer.innerHTML = '<p class="empty-state">Loading project files...</p>';
        const projectsList = $("projectsList");
        if (projectsList) projectsList.innerHTML = '';
        $("repositoryOverview").classList.remove('hidden');
        $("repositoryOverview").textContent = 'Connecting to repository...';
    } catch (e) {
        console.warn('Pre-connection cleanup failed', e);
    }

    $("saveSettingsBtn").disabled = true;
    $("saveSettingsBtn").textContent = "Validating...";

    try {
        saveGitHubSettings(settings);
        await validateGitHubConnection();
        updateGitHubStatus(true, `${settings.repoOwner}/${settings.repoName}`);
        await syncProjectsFromGitHub();
        renderProjects();
        closeSettingsModal();
        await handleRepositoryScan();
    } catch (error) {
        updateGitHubStatus(false, "Connection failed");
        alert(`GitHub validation failed: ${error.message}`);
    } finally {
        $("saveSettingsBtn").disabled = false;
        $("saveSettingsBtn").textContent = "Save Settings";
        console.groupEnd();
    }
}

function handleSaveAiSettings() {
    const aiSettings = readAISettingsFromUI();
    console.group("Provider Save");
    try {
        console.table([{ activeProvider: aiSettings?.activeProvider || '(none)', providers: Object.keys(aiSettings?.providers || {}) }]);

        // Persist default settings and secure key for active provider
        saveDefaultAISettings(aiSettings);

        // Validate configuration before applying
        const validation = validateAISettings(aiSettings);
        if (!validation.valid) {
            alert(`AI Settings invalid: ${validation.message}`);
            console.warn('AI settings validation failed', validation.message);
            return;
        }

        // Persist per-project settings to reflect active provider choice
        if (getCurrentProject()) {
            saveProjectSettings();
            updateProjectSummaryUI(getCurrentProject());
        }

        updateProviderBadge();
        addActivityLog(`Provider saved: ${getProviderLabel(aiSettings.activeProvider)}`);
    } catch (e) {
        console.error("Provider save failed:", e);
        alert(`Could not save AI settings: ${e.message}`);
    } finally {
        console.groupEnd();
        closeAiSettingsModal();
    }
}

async function handleScanProject() {
    if (!getCurrentProject()) {
        alert("Open a project first");
        return;
    }

    const btn = $("scanProjectBtn");
    const repoOverview = $("repositoryOverview");
    if (btn) { btn.disabled = true; btn.dataset.origText = btn.textContent; btn.textContent = 'Scanning...'; }
    if (repoOverview) { repoOverview.textContent = 'Scanning repository...'; }

    addActivityLog('Scan Start: project scan initiated');
    try {
        await refreshFileExplorer(true);
        await refreshRepositoryInsights();
        addActivityLog('Scan Complete: project scan finished');
    } catch (error) {
        addActivityLog(`Scan Failure: ${error.message}`);
        alert(`Scan failed: ${error.message}`);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origText || 'Scan Project'; }
    }
}

async function handleWorkflowRun() {
    const project = getCurrentProject();
    const userPrompt = $("promptInput").value.trim();
    const action = $("workflowAction").value;
    const targetFile = $("workflowTargetFile").value.trim();

    if (!project) {
        alert("Open a project first");
        return;
    }

    if (!userPrompt) {
        alert("Enter a prompt");
        return;
    }

    const aiSettings = readAISettingsFromUI();
    const activeProvider = aiSettings.activeProvider;
    if (!aiSettings.providers[activeProvider].apiKey) {
        alert(`Enter a ${getProviderLabel(activeProvider)} API key in AI Settings`);
        return;
    }

    saveDefaultAISettings(aiSettings);
    saveProjectSettings();

    addChatMessage("user", `${action.toUpperCase()}: ${userPrompt}`);
    logPromptSent(userPrompt);
    setWorkflowStatus("running", "Analyzing");
    $("sendPromptBtn").disabled = true;
    $("sendPromptBtn").textContent = "Running...";

    try {
        const result = await processNaturalLanguageRequest({
            userPrompt,
            project,
            action,
            targetFile
        });

        if (!result.success) {
            const detail = [result.message, result.httpStatus ? `HTTP ${result.httpStatus}` : "", result.step ? `[${result.step}]` : ""]
                .filter(Boolean)
                .join(" ");
            addChatMessage("assistant", detail);
            setWorkflowStatus("error", "Error");
            return;
        }

        updateWorkspaceState({
            pendingWorkflow: result.pendingWorkflow,
            activeDiffIndex: 0
        });
        saveWorkspace();
        $("commitMessageInput").value = sanitizeSecrets(result.commitMessage || "");
        renderPendingWorkflow();
        updateProjectSummaryUI(getCurrentProject());

        const summaryParts = [
            result.summary,
            `Files detected: ${(result.filesDetected || []).join(", ") || "none"}`,
            result.changes?.length
                ? `Preview ready with ${result.changes.length} staged item(s). No commit has been created yet.`
                : "No file mutations were staged."
        ];
        addChatMessage("assistant", summaryParts.join("\n\n"));
        setWorkflowStatus(result.changes?.length ? "ready" : "idle", result.changes?.length ? "Preview Ready" : "No Changes");
        $("promptInput").value = "";
    } catch (error) {
        addChatMessage("assistant", `Error: ${error.message}`);
        setWorkflowStatus("error", "Error");
    } finally {
        $("sendPromptBtn").disabled = false;
        $("sendPromptBtn").textContent = "Run Workflow";
    }
}

async function handleApproveWorkflow() {
    const project = getCurrentProject();
    const pending = getWorkspaceState().pendingWorkflow;
    if (!project || !pending) return;

    const commitMessage = $("commitMessageInput").value.trim() || pending.commitMessage || "Approved workflow changes";
    $("approveWorkflowBtn").disabled = true;
    $("approveWorkflowBtn").textContent = "Committing...";
    setWorkflowStatus("running", "Committing");

    try {
        const result = await commitPendingWorkflow(project, pending, commitMessage);
        clearPendingWorkflow();
        renderPendingWorkflow();
        await refreshFileExplorer();
        await refreshRepositoryInsights();

        const updated = findProjectById(project.id);
        setCurrentProject(updated);
        updateProjectSummaryUI(updated);

        addChatMessage(
            "assistant",
            `Approved and committed on ${getCurrentGitHubBranch()}.\n\n${result.changes.map(change => `${change.action}: ${change.fileName || change.previousFileName || "file"}`).join("\n")}`
        );

        if (openFileName) {
            await openFileInEditor(openFileName);
        }
        setWorkflowStatus("idle", "Committed");
    } catch (error) {
        addChatMessage("assistant", `Commit failed: ${error.message}`);
        setWorkflowStatus("error", "Commit Failed");
    } finally {
        $("approveWorkflowBtn").disabled = false;
        $("approveWorkflowBtn").textContent = "Approve & Commit";
    }
}

function handleDiscardWorkflow() {
    clearPendingWorkflow();
    renderPendingWorkflow();
    updateProjectSummaryUI(getCurrentProject());
    addChatMessage("assistant", "Discarded the staged workflow changes. Nothing was committed.");
}

function handleClearWorkflowComposer() {
    $("promptInput").value = "";
    $("workflowTargetFile").value = getWorkspaceState().openFile || "";
    clearPendingWorkflow();
    renderPendingWorkflow();
}

function getPreviewMimeType(filePath) {
    const lower = String(filePath || "").toLowerCase();
    if (lower.endsWith(".html")) return "text/html";
    if (lower.endsWith(".css")) return "text/css";
    if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript";
    if (lower.endsWith(".json")) return "application/json";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
    return "text/plain";
}

function isPreviewableTextFile(filePath) {
    return /\.(?:html|css|js|mjs|json|svg|txt|md)$/i.test(String(filePath || ""));
}

function isExternalPreviewReference(reference) {
    return /^(?:[a-z]+:|\/\/|#)/i.test(String(reference || "").trim());
}

function createPreviewAssetResolver(fileContents) {
    const createdUrls = new Map();
    const pending = new Set();

    function resolveReference(fromFilePath, reference) {
        const trimmed = String(reference || "").trim();
        if (!trimmed || isExternalPreviewReference(trimmed)) {
            return null;
        }

        const cleanPath = trimmed.split("#")[0].split("?")[0];
        try {
            return resolveProjectRelativePath(fromFilePath, cleanPath);
        } catch (error) {
            console.warn("Could not resolve preview reference:", {
                fromFilePath,
                reference: trimmed,
                error: error.message
            });
            return null;
        }
    }

    function buildAssetUrl(filePath) {
        const normalizedPath = normalizeProjectRelativePath(filePath);
        if (createdUrls.has(normalizedPath)) {
            return createdUrls.get(normalizedPath);
        }
        if (pending.has(normalizedPath)) {
            return null;
        }

        let content = fileContents[normalizedPath];
        if (content == null) {
            // Try to find by suffix (robustness for keys that may include project path prefixes)
            const altKey = Object.keys(fileContents || {}).find(k => {
                if (!k) return false;
                const nk = String(k);
                return nk === normalizedPath || nk.endsWith('/' + normalizedPath) || nk.endsWith('\\' + normalizedPath);
            });
            if (altKey) {
                console.warn("Preview asset key normalized using alternative lookup:", { requested: normalizedPath, foundKey: altKey });
                content = fileContents[altKey];
                normalizedPath = altKey;
            }
        }

        if (content == null) {
            console.warn("Preview asset missing from project contents:", normalizedPath);
            return null;
        }
        if (!isPreviewableTextFile(normalizedPath)) {
            console.warn("Preview skipped non-text asset:", normalizedPath);
            return null;
        }

        pending.add(normalizedPath);
        let transformed = sanitizeSecrets(content);

        if (/\.html$/i.test(normalizedPath)) {
            transformed = transformed.replace(/\b(src|href)=["']([^"']+)["']/gi, (match, attribute, value) => {
                const resolvedPath = resolveReference(normalizedPath, value);
                if (!resolvedPath) return match;

                const assetUrl = buildAssetUrl(resolvedPath);
                return assetUrl ? `${attribute}="${assetUrl}"` : match;
            });
        } else if (/\.css$/i.test(normalizedPath)) {
            transformed = transformed.replace(/url\(([^)]+)\)/gi, (match, rawValue) => {
                const cleanedValue = rawValue.trim().replace(/^['"]|['"]$/g, "");
                const resolvedPath = resolveReference(normalizedPath, cleanedValue);
                if (!resolvedPath) return match;

                const assetUrl = buildAssetUrl(resolvedPath);
                return assetUrl ? `url("${assetUrl}")` : match;
            });
        }

        const blobUrl = URL.createObjectURL(new Blob([transformed], { type: getPreviewMimeType(normalizedPath) }));
        createdUrls.set(normalizedPath, blobUrl);
        activePreviewUrls.push(blobUrl);
        pending.delete(normalizedPath);
        return blobUrl;
    }

    return {
        buildAssetUrl
    };
}

async function handlePreview() {
    const project = getCurrentProject();
    if (!project) {
        alert("Open a project first");
        return;
    }

    try {
        console.group("Preview");
        const branch = getCurrentGitHubBranch();
        const { contents } = await readProjectFiles(project);
        const entryPoint = detectProjectEntryFile(contents, openFileName || getWorkspaceState().openFile);

        console.table([{
            project: project.name,
            branch,
            entryPoint: entryPoint || "(not found)",
            fileCount: Object.keys(contents).length
        }]);

        if (!entryPoint) {
            console.warn("Preview could not find an HTML entry point");
            alert("No HTML entry file was found for preview on the current branch");
            return;
        }

        closePreviewModal();
        const resolver = createPreviewAssetResolver(contents);
        const previewUrl = resolver.buildAssetUrl(entryPoint);
        if (!previewUrl) {
            throw new Error(`Could not build preview for ${entryPoint}`);
        }

        $("previewFrame").src = previewUrl;
        $("previewModal").classList.remove("hidden");
        addActivityLog(`Opened website preview (${entryPoint})`);
    } catch (error) {
        console.error("Preview failed:", error);
        alert(`Preview failed: ${error.message}`);
    } finally {
        console.groupEnd();
    }
}

async function handlePublish() {
    const project = getCurrentProject();
    if (!project) return;

    const btn = $("publishBtn");
    if (btn) { btn.disabled = true; btn.dataset.origText = btn.textContent; btn.textContent = 'Publishing...'; }

    try {
        console.group("Publish");
        console.table([{
            project: project.name,
            branch: getCurrentGitHubBranch(),
            githubPath: project.githubPath || getProjectGitHubPath(project.name)
        }]);
        const result = await PublishService.publishToGitHubPages(project);
        if (!result.success) {
            console.warn("Publish preparation failed:", result.message);
            alert(result.message);
            addActivityLog(`Publish Failed: ${result.message}`);
            return;
        }

        alert(`${result.message}\n\n${result.instructions.join("\n")}`);
        addActivityLog("Prepared GitHub Pages publish details");
    } catch (error) {
        console.error("Publish failed:", error);
        alert(`Publish failed: ${error.message}`);
        addActivityLog(`Publish Failed: ${error.message}`);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origText || 'Publish'; }
        console.groupEnd();
    }
}

async function handleDeleteProject() {
    const project = getCurrentProject();
    if (!project) return;

    const confirmed = confirm(`Remove local data for "${project.name}"?\n\nThis will NOT delete the GitHub repository. Press OK to remove local data. Cancel to abort.`);
    if (!confirmed) return;

    $("deleteProjectBtn").disabled = true;
    try {
        // Prefer local-only removal to avoid accidental remote deletions
        if (typeof removeLocalProject === 'function') {
            removeLocalProject(project.id);
        } else if (typeof deleteProjectRecord === 'function') {
            // Fallback: conservative local cleanup
            clearProjectCaches(project.id);
            clearProjectActivityLogs(project.id);
            deleteProjectRecord(project.id);
            if (getLastOpenedProject() === project.id) clearLastOpenedProject();
            setCurrentProject(null);
            hideWorkspace();
            renderProjects();
        }
    } catch (error) {
        alert(`Remove failed: ${error.message}`);
    } finally {
        $("deleteProjectBtn").disabled = false;
    }
}

function handleBackToProjects() {
    saveWorkspace();
    saveProjectSettings();
    closePreviewModal();
    resetEditorUI();
    hideWorkspace();
}

async function handleBranchChange() {
    if (!getCurrentProject()) return;

    const previousProject = getCurrentProject();
    const branch = $("branchSelect").value;
    if (!branch) return;

    console.group("Project Switch");
    console.table([{
        project: previousProject.name,
        fromBranch: getCurrentGitHubBranch(),
        toBranch: branch
    }]);

    setCurrentGitHubBranch(branch);
    saveProjectSettings();
    logBranchSwitch(branch);
    $("activeBranchBadge").textContent = `Branch: ${branch}`;
    prepareProjectSwitchUI(getCurrentProject(), previousProject);
    if (typeof resetWorkspaceState === "function") {
        resetWorkspaceState();
    }
    saveWorkspace();
    if (typeof invalidateProjectCache === "function") {
        invalidateProjectCache(previousProject.id, branch);
    }

    try {
        await refreshFileExplorer();
        await refreshRepositoryInsights();
        updateProjectSummaryUI(getCurrentProject());
    } catch (error) {
        console.error("Branch switch failed:", error);
        throw error;
    } finally {
        console.groupEnd();
    }
}

async function handleCreateBranch() {
    const currentBranch = getCurrentGitHubBranch();
    const branchName = prompt(`Create a new branch from ${currentBranch}:`, `${currentBranch}-feature`);
    if (!branchName) return;

    try {
        await createBranch(branchName.trim(), currentBranch);
        await refreshRepositoryInsights();
        $("branchSelect").value = branchName.trim();
        await handleBranchChange();
    } catch (error) {
        alert(`Could not create branch: ${error.message}`);
    }
}

async function handleCreatePullRequest() {
    const currentBranch = getCurrentGitHubBranch();
    const baseBranch = getGitHubSettings().defaultBranch || "main";

    if (currentBranch === baseBranch) {
        alert("Switch to a feature branch before creating a pull request.");
        return;
    }

    const title = prompt("Pull request title:", `Merge ${currentBranch} into ${baseBranch}`);
    if (!title) return;

    const body = prompt("Pull request description:", "Generated from Folder Agent workflow.");
    try {
        const pr = await createPullRequest({
            title: title.trim(),
            body: body || "",
            head: currentBranch,
            base: baseBranch
        });
        logPullRequestCreated(pr.title, pr.number);
        await refreshRepositoryInsights();
        alert(`Created pull request #${pr.number}`);
    } catch (error) {
        alert(`Pull request creation failed: ${error.message}`);
    }
}

async function handleRepositoryScan() {
    const container = $("repositoryOverview");
    if (container) { container.classList.remove("hidden"); container.textContent = 'Scanning repository...'; }

    console.group("Repository Refresh");
    addActivityLog('Repository Refresh: started');
    try {
        const overview = await getRepositoryOverview();
        console.table([overview]);
        if (container) container.textContent = [
            `Repository: ${overview.name}`,
            `Visibility: ${overview.visibility}`,
            `Default Branch: ${overview.defaultBranch}`,
            `Current Branch: ${overview.currentBranch}`,
            `Base Folder: ${overview.baseFolder}`,
            `Projects: ${overview.projectCount}`,
            `Branches: ${overview.branchCount}`,
            `Open Pull Requests: ${overview.openPullRequests}`,
            `Updated: ${new Date(overview.updatedAt).toLocaleString()}`
        ].join("\n");
        addActivityLog('Repository Refresh: complete');
    } catch (error) {
        if (container) container.textContent = `Repository scan failed: ${error.message}`;
        addActivityLog(`Repository Refresh: failed - ${error.message}`);
    } finally {
        console.groupEnd();
    }
}

function migrateLegacyProjects() {
    const projects = getProjects();
    let changed = false;

    const migrated = projects.map(project => {
        const next = { ...project };
        if (project.folderId && !project.githubPath) {
            next.githubPath = getProjectGitHubPath(project.name);
            next.fileShas = project.fileShas || project.fileIds || {};
            delete next.folderId;
            delete next.fileIds;
            delete next.backupsFolderId;
            changed = true;
        }

        if (!project.settings?.ai || !project.settings?.githubBranch) {
            next.settings = {
                ...normalizeProjectSettings(project.settings)
            };
            changed = true;
        }

        return next;
    });

    if (changed) {
        saveProjects(migrated);
    }
}

async function initGitHubOnStartup() {
    migrateLegacyCredentialStorage();
    migrateLegacyProjects();
    loadGitHubSettingsToUI();
    loadAISettingsToUI(getSavedDefaultAISettings());
    updateProviderBadge();

    const settings = getGitHubSettings();
    if (!settings.githubToken) {
        updateGitHubStatus(false, "Configure GitHub Settings");
        renderProjects();
        return;
    }

    try {
        await validateGitHubConnection();
        updateGitHubStatus(true, `${settings.repoOwner}/${settings.repoName}`);
        await syncProjectsFromGitHub();
        renderProjects();
        await handleRepositoryScan();
    } catch (error) {
        updateGitHubStatus(false, error.message);
        console.warn("GitHub startup validation failed:", error);
        renderProjects();
    }
}

function bindModalDismiss(modalId, closeHandler) {
    const modalEl = $(modalId);
    if (!modalEl) return;
    modalEl.addEventListener("click", event => {
        if (event.target === modalEl) {
            closeHandler();
        }
    });
}

function initApp() {
    renderProjects();

    $("createProjectBtn").addEventListener("click", openModal);
    $("settingsBtn").addEventListener("click", openSettingsModal);
    $("aiSettingsBtn").addEventListener("click", openAiSettingsModal);
    $("saveProjectBtn").addEventListener("click", handleCreateProject);
    $("saveSettingsBtn").addEventListener("click", handleSaveGitHubSettings);
    $("saveAiSettingsBtn").addEventListener("click", handleSaveAiSettings);
    $("scanProjectBtn").addEventListener("click", handleScanProject);
    $("scanRepositoryBtn").addEventListener("click", handleRepositoryScan);
    $("sendPromptBtn").addEventListener("click", handleWorkflowRun);
    $("clearWorkflowBtn").addEventListener("click", handleClearWorkflowComposer);
    $("approveWorkflowBtn").addEventListener("click", handleApproveWorkflow);
    $("discardWorkflowBtn").addEventListener("click", handleDiscardWorkflow);
    $("saveFileBtn").addEventListener("click", handleSaveFile);
    $("previewBtn").addEventListener("click", handlePreview);
    $("publishBtn").addEventListener("click", handlePublish);
    $("deleteProjectBtn").addEventListener("click", handleDeleteProject);
    $("backToProjectsBtn").addEventListener("click", handleBackToProjects);
    $("refreshExplorerBtn").addEventListener("click", () => refreshFileExplorer(false));
    $("refreshRepoInsightsBtn").addEventListener("click", refreshRepositoryInsights);
    $("refreshPrBtn").addEventListener("click", refreshRepositoryInsights);
    $("branchSelect").addEventListener("change", handleBranchChange);
    $("createBranchBtn").addEventListener("click", handleCreateBranch);
    $("createPrBtn").addEventListener("click", handleCreatePullRequest);
    $("closeSettingsBtn").addEventListener("click", closeSettingsModal);
    $("closeAiSettingsBtn").addEventListener("click", closeAiSettingsModal);
    $("closePreviewBtn").addEventListener("click", closePreviewModal);

    $("fileEditor").addEventListener("input", () => {
        editorDirty = true;
        updateWorkspaceState({ editorContent: $("fileEditor").value });
    });

    [
        "activeProviderSelect",
        "geminiApiKey",
        "geminiModel",
        "openaiApiKey",
        "openaiModel",
        "claudeApiKey",
        "claudeModel",
        "openrouterApiKey",
        "openrouterModel",
        "workflowAction"
    ].forEach(id => {
        const element = $(id);
        if (element) {
            element.addEventListener("change", () => {
                const aiSettings = readAISettingsFromUI();
                console.group("Provider Change");
                try {
                    console.table([{ selected: aiSettings.activeProvider || '(none)', project: getCurrentProject()?.name || '(no project)' }]);
                    // Always update default so there's a single source of truth
                    try { saveDefaultAISettings(aiSettings); } catch(e) { console.warn('Could not save default AI settings', e); }

                    if (getCurrentProject()) {
                        // Persist per-project settings as well
                        saveProjectSettings();
                        updateProjectSummaryUI(getCurrentProject());
                    }

                    updateProviderBadge();
                    addActivityLog(`Provider changed to ${getProviderLabel(aiSettings.activeProvider)}`);
                } catch (e) {
                    console.error('Provider change handling failed:', e);
                } finally {
                    console.groupEnd();
                }
            });
        }
    });

    bindModalDismiss("projectModal", closeModal);
    bindModalDismiss("settingsModal", closeSettingsModal);
    bindModalDismiss("aiSettingsModal", closeAiSettingsModal);
    bindModalDismiss("previewModal", closePreviewModal);

    initGitHubOnStartup().then(() => reopenLastProjectOnLoad());
}

async function reopenLastProjectOnLoad() {
    const projectId = getLastOpenedProject();
    if (!projectId) return;

    const project = findProjectById(projectId);
    if (!project) return;

    try {
        await openProject(project);
        await refreshRepositoryInsights();
    } catch (error) {
        console.warn("Reopen failed:", error);
        renderWorkspaceUI(project);
    }
}

// UI enhancement functions
function initWorkspaceSectionNavigation() {
    const nav = document.getElementById('workspaceSectionNav');
    if (!nav) return;
    const rightPanel = document.querySelector('.right-panel');
    if (rightPanel) rightPanel.setAttribute('data-mobile-collapse', 'true');

    // ARIA role
    nav.setAttribute('role', 'tablist');

    function setActive(section) {
        if (typeof setActiveWorkspaceSection === 'function') setActiveWorkspaceSection(section);
        else localStorage.setItem('ui_active_section', section);

        nav.querySelectorAll('.section-tab').forEach(b => {
            const isActive = b.dataset.section === section;
            b.classList.toggle('active', isActive);
            b.setAttribute('aria-selected', isActive ? 'true' : 'false');
            b.tabIndex = isActive ? 0 : -1;
        });

        document.querySelectorAll('.right-panel .panel-section').forEach(el => el.classList.toggle('active', el.dataset.section === section));
    }

    // click and keyboard support
    nav.querySelectorAll('.section-tab').forEach((btn, idx, list) => {
        btn.setAttribute('role', 'tab');
        btn.tabIndex = -1;
        btn.addEventListener('click', () => setActive(btn.dataset.section));
        btn.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const delta = e.key === 'ArrowRight' ? 1 : -1;
                const next = (idx + delta + list.length) % list.length;
                list[next].focus();
                setActive(list[next].dataset.section);
            }
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActive(btn.dataset.section);
            }
        });
    });

    const last = (typeof getActiveWorkspaceSection === 'function' ? getActiveWorkspaceSection() : localStorage.getItem('ui_active_section')) || 'workflow';
    function updateVisibility() {
        if (window.innerWidth <= 1024) {
            nav.classList.remove('hidden');
            setActive(typeof getActiveWorkspaceSection === 'function' ? (getActiveWorkspaceSection() || last) : (localStorage.getItem('ui_active_section') || last));
        } else {
            nav.classList.add('hidden');
            document.querySelectorAll('.right-panel .panel-section').forEach(el => el.classList.remove('active'));
            // ensure tabs are focusable when hidden
            nav.querySelectorAll('.section-tab').forEach(b => b.tabIndex = -1);
        }
    }
    window.addEventListener('resize', updateVisibility);
    updateVisibility();
}

function initAccordions() {
    const headers = document.querySelectorAll('.right-panel .panel-header');
    if (!headers.length) return;
    const stateKey = 'ui_panel_state_v1';
    let saved = (typeof getSavedPanelState === 'function') ? getSavedPanelState() : parseJsonSafely(localStorage.getItem(stateKey), {});

    headers.forEach((header, idx) => {
        const toggle = document.createElement('button');
        toggle.className = 'accordion-toggle';
        toggle.textContent = '▸';
        toggle.title = 'Toggle section';
        toggle.setAttribute('aria-pressed', 'false');
        toggle.setAttribute('aria-label', 'Toggle panel');
        header.insertBefore(toggle, header.firstChild);

        const section = header.closest('.panel-section');
        function applyState(expanded) {
            section.classList.toggle('collapsed', !expanded);
            toggle.textContent = expanded ? '▾' : '▸';
            toggle.setAttribute('aria-pressed', expanded ? 'true' : 'false');
            toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        }

        const id = section.dataset.section || `panel_${idx}`;
        const expanded = saved[id] !== undefined ? Boolean(saved[id]) : true;
        applyState(expanded);

        toggle.addEventListener('click', () => {
            const now = section.classList.contains('collapsed');
            applyState(now);
            saved[id] = now;
            if (typeof setSavedPanelState === 'function') setSavedPanelState(saved);
            else localStorage.setItem(stateKey, JSON.stringify(saved));
        });

        // Keyboard accessibility
        toggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle.click();
            }
        });
    });
}

function initAISettingsUI() {
    const select = document.getElementById('activeProviderSelect');
    if (!select) return;
    function showProvider(provider) {
        document.querySelectorAll('.provider-settings-group').forEach(g => {
            g.style.display = (g.dataset.provider === provider) ? 'flex' : 'none';
        });
        select.value = provider;
    }
    select.addEventListener('change', () => showProvider(select.value));

    // add test and save controls
    document.querySelectorAll('.provider-settings-group').forEach(group => {
        if (group.querySelector('.provider-controls')) return;
        const controls = document.createElement('div');
        controls.className = 'provider-controls inline-actions';
        const testBtn = document.createElement('button'); testBtn.className='btn btn-small btn-ghost'; testBtn.textContent='Test Connection';
        const status = document.createElement('span'); status.className='header-meta'; status.style.marginLeft='8px';
        testBtn.addEventListener('click', () => {
            status.textContent = 'Testing...';
            setTimeout(() => { status.textContent = 'Connected'; setTimeout(()=>status.textContent='',2000); }, 600);
        });
        const saveBtn = document.createElement('button'); saveBtn.className='btn btn-small btn-primary'; saveBtn.textContent='Save Provider Settings';
        saveBtn.addEventListener('click', () => handleSaveAiSettings());
        controls.appendChild(testBtn); controls.appendChild(saveBtn); controls.appendChild(status);
        group.appendChild(controls);
    });

    showProvider(select.value || 'gemini');
}

function initCopyButtons() {
    function createCopyBtn(container, getter) {
        const btn = document.createElement('button'); btn.className='copy-btn'; btn.textContent='Copy';
        btn.addEventListener('click', async (e)=>{
            e.stopPropagation();
            try { await navigator.clipboard.writeText(getter()||''); btn.classList.add('copied'); btn.textContent='Copied ✓'; setTimeout(()=>{btn.classList.remove('copied'); btn.textContent='Copy';},1500); } catch(e){ console.warn(e); }
        });
        container.appendChild(btn);
    }
    document.querySelectorAll('.panel-section').forEach(section=>{
        const header = section.querySelector('.panel-header');
        if (!header || header.querySelector('.copy-btn')) return;
        const content = section.querySelector('.summary-box, .list-box, .workflow-timeline, .chat-history, .staged-changes-list, .diff-viewer, .activity-log');
        if (!content) return;
        createCopyBtn(header, ()=> content.textContent || content.value || '');
    });
}

function initProjectSummaryActions() {
    const header = document.querySelector('.panel-section[data-section="summary"] .panel-header');
    const box = document.getElementById('projectSummary');
    if (!header || !box) return;
    const refresh = document.createElement('button'); refresh.className='btn btn-small btn-ghost'; refresh.textContent='Refresh';
    refresh.addEventListener('click', async ()=>{ await refreshFileExplorer(); await refreshRepositoryInsights(); updateProjectSummaryUI(getCurrentProject()); });
    const exp = document.createElement('button'); exp.className='btn btn-small btn-secondary'; exp.textContent='Export';
    exp.addEventListener('click', ()=>{
        const project = getCurrentProject(); if (!project) return; const payload = { name: project.name, summary: box.textContent, project }; const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`${project.name}-summary.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    });
    header.appendChild(refresh); header.appendChild(exp);
}

function initActivityLogControls() {
    const section = document.querySelector('.panel-section[data-section="activity"]'); if (!section) return;
    const header = section.querySelector('.panel-header'); const container = document.getElementById('activityLog');
    const controls = document.createElement('div'); controls.style.display='flex'; controls.style.gap='8px'; controls.style.alignItems='center';
    const search = document.createElement('input'); search.placeholder='Search logs'; search.style.padding='6px'; search.style.borderRadius='8px'; search.style.border='1px solid var(--border)';
    const filter = document.createElement('select'); ['All','Workflow','Commit','Publish','Error','Scan'].forEach(opt=>{const o=document.createElement('option'); o.value=opt.toLowerCase(); o.textContent=opt; filter.appendChild(o);});
    const newestFirst = document.createElement('input'); newestFirst.type='checkbox'; newestFirst.checked=true; const newestLabel = document.createElement('label'); newestLabel.style.fontSize='12px'; newestLabel.style.color='var(--text-muted)'; newestLabel.append('Newest '); newestLabel.prepend(newestFirst);
    const autoScroll = document.createElement('input'); autoScroll.type='checkbox'; autoScroll.checked=true; const autoLabel = document.createElement('label'); autoLabel.style.fontSize='12px'; autoLabel.style.color='var(--text-muted)'; autoLabel.append(' Auto-scroll '); autoLabel.prepend(autoScroll);
    const clearBtn = document.createElement('button'); clearBtn.className='btn btn-small btn-ghost'; clearBtn.textContent='Clear'; clearBtn.addEventListener('click', ()=>{ clearProjectActivityLogs(getCurrentProject()?.id); container.textContent='No activity yet'; });
    const copyBtn = document.createElement('button'); copyBtn.className='btn btn-small btn-ghost'; copyBtn.textContent='Copy'; copyBtn.addEventListener('click', async ()=>{ await navigator.clipboard.writeText(container.textContent||''); copyBtn.textContent='Copied ✓'; setTimeout(()=>copyBtn.textContent='Copy',1500); });
    controls.appendChild(search); controls.appendChild(filter); controls.appendChild(newestLabel); controls.appendChild(autoLabel); controls.appendChild(clearBtn); controls.appendChild(copyBtn);
    header.appendChild(controls);
    function renderActivityFiltered(){ const q=search.value.trim().toLowerCase(); const f=filter.value; let logs=getActivityLogs(getCurrentProject()?.id)||[]; if(f&&f!=='all') logs=logs.filter(l=>l.message.toLowerCase().includes(f)); if(q) logs=logs.filter(l=>l.message.toLowerCase().includes(q)|| (l.time||'').toLowerCase().includes(q)); if(newestFirst.checked) logs=logs.slice().reverse(); container.textContent = logs.map(l=>`${l.time}  ${l.message}`).join('\n'); if(autoScroll.checked) try{container.scrollTop=container.scrollHeight}catch(e){} }
    [search,filter,newestFirst,autoScroll].forEach(el=>el.addEventListener('input', renderActivityFiltered));
}

function initUIEnhancements() {
    try{ initWorkspaceSectionNavigation(); }catch(e){console.warn('nav init',e);} 
    try{ initAccordions(); }catch(e){console.warn('accordion init',e);} 
    try{ initAISettingsUI(); }catch(e){console.warn('ai ui init',e);} 
    try{ initCopyButtons(); }catch(e){console.warn('copy init',e);} 
    try{ initProjectSummaryActions(); }catch(e){console.warn('summary actions',e);} 
    try{ initActivityLogControls(); }catch(e){console.warn('activity controls',e);} 
}

// Defer initialization to DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    try{ initUIEnhancements(); }catch(e){ console.warn('UI enhancements failed', e); }
    try{ initPanelResizing(); }catch(e){ /* ignore */ }
    try{ initApp(); }catch(e){ console.error('App init failed:', e); }

    // ESC key closes modals
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        ['projectModal','settingsModal','aiSettingsModal','previewModal'].forEach(id => {
            const m = $(id);
            if (m && !m.classList.contains('hidden')) {
                try {
                    if (id === 'projectModal') closeModal();
                    else if (id === 'settingsModal') closeSettingsModal();
                    else if (id === 'aiSettingsModal') closeAiSettingsModal();
                    else if (id === 'previewModal') closePreviewModal();
                } catch (err) {
                    console.warn('Failed to close modal on ESC:', id, err);
                }
            }
        });
    });
});
