let currentProject = null;
let workspaceState = createEmptyWorkspaceState();

function createEmptyWorkspaceState() {
    return {
        openFile: null,
        editorContent: "",
        fileTree: [],
        scanResult: null,
        projectMemory: null,
        pendingWorkflow: null,
        repoInsights: null,
        activeDiffIndex: 0
    };
}

function getCurrentProject() {
    return currentProject;
}

// UI state helpers: store simple workspace UI state (active section, accordion state)
const UI_ACTIVE_SECTION_KEY = 'ui_active_section';
const UI_PANEL_STATE_KEY = 'ui_panel_state_v1';

function getActiveWorkspaceSection() {
    return localStorage.getItem(UI_ACTIVE_SECTION_KEY) || null;
}

function setActiveWorkspaceSection(sectionKey) {
    if (sectionKey) localStorage.setItem(UI_ACTIVE_SECTION_KEY, sectionKey);
    else localStorage.removeItem(UI_ACTIVE_SECTION_KEY);
}

function getSavedPanelState() {
    return parseJsonSafely(localStorage.getItem(UI_PANEL_STATE_KEY), {});
}

function setSavedPanelState(stateObj) {
    try {
        localStorage.setItem(UI_PANEL_STATE_KEY, JSON.stringify(stateObj || {}));
    } catch (e) {
        console.warn('Failed to save UI panel state', e);
    }
}

function setCurrentProject(project) {
    currentProject = project;
}

function getWorkspaceState() {
    return workspaceState;
}

function updateWorkspaceState(updates) {
    workspaceState = { ...workspaceState, ...updates };
}

function getCurrentGitHubBranch() {
    return currentProject?.settings?.githubBranch
        || getGitHubSettings().defaultBranch
        || "main";
}

function setCurrentGitHubBranch(branch) {
    if (!currentProject || !branch) return;

    const settings = {
        ...normalizeProjectSettings(currentProject.settings),
        githubBranch: branch
    };

    updateProject(currentProject.id, { settings });
    currentProject = findProjectById(currentProject.id);
}

function normalizeProjectSettings(settings = {}) {
    const aiSettings = typeof mergeAISettings === "function"
        ? mergeAISettings(settings.ai)
        : settings.ai || {};

    return {
        ai: stripCredentialFieldsFromAISettings(aiSettings),
        githubBranch: settings.githubBranch || getGitHubSettings().defaultBranch || "main"
    };
}

function saveWorkspace() {
    if (!currentProject) return;

    const state = sanitizeWorkspaceState({
        branch: getCurrentGitHubBranch(),
        openFile: workspaceState.openFile,
        editorContent: workspaceState.editorContent,
        fileTree: workspaceState.fileTree,
        scanResult: workspaceState.scanResult,
        projectMemory: workspaceState.projectMemory,
        pendingWorkflow: workspaceState.pendingWorkflow,
        repoInsights: workspaceState.repoInsights,
        activeDiffIndex: workspaceState.activeDiffIndex
    });

    updateProject(currentProject.id, { workspaceState: state });
    currentProject = findProjectById(currentProject.id);
}

function resetWorkspaceState() {
    workspaceState = createEmptyWorkspaceState();
}

async function restoreWorkspace() {
    if (!currentProject) return;

    try {
        const saved = currentProject.workspaceState || {};
        const savedBranch = saved.branch || null;
        const currentBranch = getCurrentGitHubBranch();
        const useSavedState = !savedBranch || savedBranch === currentBranch;

        if (!useSavedState) {
            console.warn("Ignoring workspace state from a different branch", {
                project: currentProject.name,
                savedBranch,
                currentBranch
            });
        }

        workspaceState = {
            ...createEmptyWorkspaceState(),
            openFile: useSavedState ? saved.openFile || null : null,
            editorContent: useSavedState ? saved.editorContent || "" : "",
            fileTree: useSavedState && Array.isArray(saved.fileTree) ? saved.fileTree : [],
            scanResult: useSavedState ? saved.scanResult || null : null,
            projectMemory: useSavedState ? saved.projectMemory || null : null,
            pendingWorkflow: useSavedState ? saved.pendingWorkflow || null : null,
            repoInsights: useSavedState ? saved.repoInsights || null : null,
            activeDiffIndex: useSavedState && typeof saved.activeDiffIndex === "number" ? saved.activeDiffIndex : 0
        };

        // Load cached project memory if workspace version is old
        if (!workspaceState.projectMemory && currentProject.id && typeof loadProjectMemory === "function") {
            const cached = loadProjectMemory(currentProject.id, currentBranch);
            if (cached) {
                workspaceState.projectMemory = cached;
            }
        }

        loadProjectSettings(currentProject);
        loadProjectChatHistory(currentProject);
        loadProjectActivityLogs(currentProject.id);
    } catch (error) {
        console.error("Failed to restore workspace:", error);
        workspaceState = createEmptyWorkspaceState();
    }
}

function loadProjectSettings(project) {
    if (!project) return;

    const normalized = normalizeProjectSettings(project.settings);
    if (typeof loadAISettingsToUI === "function") {
        loadAISettingsToUI(getCurrentAISettings());
    }

    const branchSelect = document.getElementById("branchSelect");
    if (branchSelect) {
        branchSelect.value = normalized.githubBranch;
    }

    const providerStatus = document.getElementById("providerStatus");
    if (providerStatus && typeof getProviderLabel === "function") {
        providerStatus.textContent = getProviderLabel(normalized.ai.activeProvider);
    }
}

function saveProjectSettings() {
    if (!currentProject) return;

    const currentSettings = normalizeProjectSettings(currentProject.settings);
    const aiSettings = typeof readAISettingsFromUI === "function"
        ? readAISettingsFromUI()
        : currentSettings.ai;

    const branch = document.getElementById("branchSelect")?.value
        || currentSettings.githubBranch
        || getGitHubSettings().defaultBranch
        || "main";

    const settings = {
        ai: aiSettings,
        githubBranch: branch
    };

    updateProject(currentProject.id, { settings });
    currentProject = findProjectById(currentProject.id);

    const providerStatus = document.getElementById("providerStatus");
    if (providerStatus && typeof getProviderLabel === "function") {
        providerStatus.textContent = getProviderLabel(aiSettings.activeProvider);
    }
}

function getCurrentAISettings() {
    // Consolidate AI settings: prefer project-level, fallback to saved defaults
    const projectAI = normalizeProjectSettings(currentProject?.settings).ai || {};
    const defaultAI = typeof getSavedDefaultAISettings === "function" ? getSavedDefaultAISettings() : (projectAI || {});

    // Merge providers so project overrides default providers but defaults fill missing keys
    const mergedProviders = {
        ...(defaultAI.providers || {}),
        ...(projectAI.providers || {})
    };

    const merged = {
        ...defaultAI,
        ...projectAI,
        providers: mergedProviders,
        activeProvider: projectAI.activeProvider || defaultAI.activeProvider || Object.keys(mergedProviders)[0] || null
    };

    return applySecureCredentialsToAISettings(merged);
}

function loadProjectChatHistory(project) {
    const container = document.getElementById("chatHistory");
    if (!container) return;

    try {
        const history = project?.chatHistory || [];
        container.innerHTML = "";

        if (history.length === 0) {
            container.innerHTML = '<p class="chat-empty">Run an agent workflow to generate plans, explanations, and staged changes.</p>';
            return;
        }

        history.forEach(entry => {
            try {
                appendChatMessage(entry.role, entry.content, entry.time, false);
            } catch (e) {
                console.warn("Failed to render chat message:", entry, e);
            }
        });
    } catch (error) {
        console.error("Failed to load chat history:", error);
        container.innerHTML = '<p class="chat-empty">Error loading chat history</p>';
    }
}

function addChatMessage(role, content) {
    if (!currentProject) return;

    const entry = {
        role,
        content: sanitizeSecrets(content),
        time: new Date().toLocaleTimeString()
    };

    const history = [...(currentProject.chatHistory || []), entry];
    updateProject(currentProject.id, { chatHistory: history });
    currentProject = findProjectById(currentProject.id);
    appendChatMessage(role, content, entry.time, true);
}

function appendChatMessage(role, content, time, scroll) {
    const container = document.getElementById("chatHistory");
    if (!container) return;

    const empty = container.querySelector(".chat-empty");
    if (empty) empty.remove();

    const message = document.createElement("div");
    const safeRole = String(role || "assistant").toLowerCase();
    message.className = `chat-message chat-${safeRole}`;
    message.innerHTML = `
        <div class="chat-meta">${safeRole === "user" ? "You" : "Agent"} · ${time || new Date().toLocaleTimeString()}</div>
        <div class="chat-text">${escapeHtml(content)}</div>
    `;
    container.appendChild(message);

    if (scroll) {
        try {
            container.scrollTop = container.scrollHeight;
        } catch (e) {
            console.warn("Failed to scroll chat history:", e);
        }
    }
}

function clearPendingWorkflow() {
    updateWorkspaceState({
        pendingWorkflow: null,
        activeDiffIndex: 0
    });
    saveWorkspace();
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}
