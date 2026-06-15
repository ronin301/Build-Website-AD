async function createProject(projectName) {
    const trimmed = String(projectName || "").trim();
    if (!trimmed) {
        throw new Error("Project name required");
    }
    if (trimmed.length > 100) {
        throw new Error("Project name too long (max 100 characters)");
    }
    if (!/^[\w\-. ]+$/.test(trimmed)) {
        throw new Error("Project name contains invalid characters");
    }

    await validateGitHubConnection();
    const branch = getCurrentGitHubBranch ? getCurrentGitHubBranch() : getGitHubSettings().defaultBranch;

    const existing = findProjectByName(trimmed);
    if (existing) {
        await openProject(existing);
        return existing;
    }

    const existsOnGitHub = await projectExistsOnGitHub(trimmed, branch);
    if (existsOnGitHub) {
        const project = createProjectRecord({
            name: trimmed,
            githubPath: getProjectGitHubPath(trimmed),
            fileShas: {},
            settings: {
                ai: getSavedDefaultAISettings(),
                githubBranch: branch
            },
            chatHistory: [],
            buildHistory: [],
            workspaceState: {}
        });
        setCurrentProject(project);
        const merged = await mergeManifestWithProject(project);
        await openProject(merged);
        return merged;
    }

    const project = createProjectRecord({
        name: trimmed,
        githubPath: getProjectGitHubPath(trimmed),
        fileShas: {},
        settings: {
            ai: getSavedDefaultAISettings(),
            githubBranch: branch
        },
        chatHistory: [],
        buildHistory: [],
        workspaceState: {}
    });

    setCurrentProject(project);

    const initialized = await initializeProjectFiles(project);
    await syncManifestToGitHub(initialized);

    logProjectCreated(trimmed);
    logGitHubCommit(`Created project: ${trimmed}`);

    await openProject(initialized);
    return initialized;
}

async function openProject(project) {
    if (!project) return;

    const previousProject = getCurrentProject();
    const isProjectSwitch = previousProject?.id && previousProject.id !== project.id;

    console.group("Project Load");
    console.table([{
        fromProject: previousProject?.name || "(none)",
        toProject: project.name,
        fromBranch: previousProject?.settings?.githubBranch || "(none)",
        toBranch: project.settings?.githubBranch || getGitHubSettings().defaultBranch || "main",
        projectSwitch: Boolean(isProjectSwitch)
    }]);

    if (typeof prepareProjectSwitchUI === "function") {
        prepareProjectSwitchUI(project, previousProject);
    }

    // When switching projects, aggressively clear runtime caches and UI state to prevent stale data
    if (isProjectSwitch) {
        try {
            if (typeof revokePreviewUrls === "function") {
                revokePreviewUrls();
            }
        } catch (e) { /* ignore */ }

        if (typeof invalidateProjectCache === "function" && previousProject?.id) {
            try {
                invalidateProjectCache(previousProject.id, previousProject.settings?.githubBranch || getGitHubSettings().defaultBranch);
            } catch (e) { /* ignore */ }
        }

        if (typeof resetWorkspaceState === "function") {
            resetWorkspaceState();
        }
    } else {
        if (typeof resetWorkspaceState === "function") {
            resetWorkspaceState();
        }
    }

    try {
        await validateGitHubConnection();

        setCurrentProject(project);
        saveLastOpenedProject(project.id);

        let merged = project;
        try {
            merged = await mergeManifestWithProject(project);
            setCurrentProject(merged);
        } catch (e) {
            console.warn("Manifest merge failed:", e);
        }

            await restoreWorkspace();

        renderWorkspaceUI(merged);
        addActivityLog(`Project Load: ${merged.name}`);
        logProjectOpened(merged.name);

        // Force a fresh scan on project switch to prevent stale cached explorer data
        const forceScan = isProjectSwitch === true;
        await refreshFileExplorer(forceScan);
        if (typeof refreshRepositoryInsights === "function") {
            await refreshRepositoryInsights();
        }

        const ws = getWorkspaceState();
        if (ws.openFile) {
            try {
                await openFileInEditor(ws.openFile);
            } catch (e) {
                console.warn("Could not restore open file:", e);
            }
        }
    } finally {
        if (isProjectSwitch) addActivityLog(`Project Switch: ${previousProject?.name || '(none)'} -> ${project.name}`);
        console.groupEnd();
    }
}

async function deleteProject(projectId) {
    const project = findProjectById(projectId);
    if (!project) return false;

    await validateGitHubConnection();

    try {
        await deleteGitHubProjectFolder(project.name, getCurrentGitHubBranch());
        logGitHubCommit(`Deleted project folder: ${project.name}`);
    } catch (e) {
        throw new Error(`GitHub delete failed: ${e.message}`);
    }

    clearProjectActivityLogs(projectId);
    if (typeof invalidateProjectCache === "function") {
        invalidateProjectCache(projectId, project.settings?.githubBranch || getGitHubSettings().defaultBranch);
    }
    deleteProjectRecord(projectId);

    if (getCurrentProject()?.id === projectId) {
        setCurrentProject(null);
        hideWorkspace();
    }

    if (getLastOpenedProject() === projectId) {
        clearLastOpenedProject();
    }

    logProjectDeleted(project.name);
    renderProjects();
    return true;
}

async function scanProject(project, options = {}) {
    if (!project?.name) {
        return { success: false, message: "No project selected" };
    }

    const force = options.force === true;
    addActivityLog(`Scan Start: ${project.name} ${force ? '(forced)' : ''}`);

    // Use smart scanner if available, fallback to basic scan
    if (typeof smartScanProject === "function") {
        return smartScanProject(project, { force });
    }

    try {
        await validateGitHubConnection();

        const tree = await listProjectTree(project);
        const files = await getProjectFiles(project);

        const summary = {
            totalFiles: files.length,
            htmlFiles: files.filter(f => f.name.endsWith(".html")).length,
            cssFiles: files.filter(f => f.name.endsWith(".css")).length,
            jsFiles: files.filter(f => f.name.endsWith(".js")).length,
            jsonFiles: files.filter(f => f.name.endsWith(".json")).length,
            modifiedFiles: files.slice(0, 5).map(f => f.name),
            scanTime: new Date().toISOString()
        };

        updateWorkspaceState({ fileTree: tree, scanResult: summary });
        saveWorkspace();

        logProjectScanned();
        addActivityLog(`Scan Complete: ${project.name} - ${summary.totalFiles} files, ${summary.htmlFiles} html, ${summary.cssFiles} css`);

        return { success: true, files, tree, summary };
    } catch (error) {
        addActivityLog(`Scan Failure: ${project.name} - ${error.message}`);
        return { success: false, message: error.message };
    }
}

async function syncProjectsFromGitHub() {
    await validateGitHubConnection();
    const branch = getCurrentGitHubBranch ? getCurrentGitHubBranch() : getGitHubSettings().defaultBranch;
    const githubProjects = await listAllGitHubProjects(branch);
    const localProjects = getProjects();

    for (const name of githubProjects) {
        const exists = localProjects.find(
            p => p.name.trim().toLowerCase() === name.trim().toLowerCase()
        );
        if (!exists) {
            createProjectRecord({
                name,
                githubPath: getProjectGitHubPath(name),
                fileShas: {},
                settings: {
                    ai: getSavedDefaultAISettings(),
                    githubBranch: branch
                },
                chatHistory: [],
                buildHistory: [],
                workspaceState: {}
            });
        }
    }
}
