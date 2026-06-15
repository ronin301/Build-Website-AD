const MANIFEST_FILE = "project.json";

function createDefaultManifest(project, fileList) {
    return {
        projectId: project.id,
        projectName: project.name,
        githubPath: project.githubPath || getProjectGitHubPath(project.name),
        createdAt: project.createdAt,
        updatedAt: new Date().toISOString(),
        fileList: fileList || Object.keys(project.fileShas || {}),
        settings: sanitizeProjectSettings(project.settings || {}),
        chatHistory: sanitizeStructuredContent(project.chatHistory || []),
        buildHistory: sanitizeStructuredContent(project.buildHistory || [])
    };
}

async function syncManifestToGitHub(project) {
    const files = await getProjectFiles(project);
    const fileList = files.map(f => f.name);

    const manifest = createDefaultManifest(project, fileList);
    const content = JSON.stringify(manifest, null, 2);
    const manifestPath = getFilePath(project, MANIFEST_FILE);

    let existingSha = null;
    try {
        const existing = await readGitHubFile(manifestPath, { branch: getCurrentGitHubBranch() });
        existingSha = existing.sha;
    } catch (e) { /* new manifest */ }

    const result = await writeGitHubFile(
        manifestPath,
        content,
        existingSha,
        "Sync project.json manifest",
        { branch: getCurrentGitHubBranch() }
    );

    const fileShas = { ...(project.fileShas || {}) };
    fileShas[MANIFEST_FILE] = result.sha;

    updateProject(project.id, {
        fileShas,
        updatedAt: new Date().toISOString()
    });

    logGitHubCommit("Synced project.json");
    return result;
}

async function readManifestFromGitHub(project) {
    try {
        const data = await readGitHubFile(getFilePath(project, MANIFEST_FILE), { branch: getCurrentGitHubBranch() });
        const manifest = JSON.parse(data.content);
        
        if (!manifest || typeof manifest !== "object") {
            throw new Error("Manifest is not a valid object");
        }
        
        return manifest;
    } catch (error) {
        if (error.message.includes("404") || error.message.toLowerCase().includes("not found")) {
            return null;
        }
        console.warn("Failed to read/parse manifest:", error);
        return null;
    }
}

async function mergeManifestWithProject(project) {
    const manifest = await readManifestFromGitHub(project);
    if (!manifest) return project;

    const manifestSettings = sanitizeProjectSettings(manifest.settings || {});

    const merged = {
        ...project,
        settings: {
            ...normalizeProjectSettings(project.settings),
            ...manifestSettings,
            ai: mergeAISettings(manifestSettings.ai || project.settings?.ai),
            githubBranch: project.settings?.githubBranch || manifestSettings.githubBranch || getGitHubSettings().defaultBranch
        },
        chatHistory: manifest.chatHistory?.length
            ? sanitizeStructuredContent(manifest.chatHistory)
            : project.chatHistory,
        buildHistory: manifest.buildHistory?.length
            ? sanitizeStructuredContent(manifest.buildHistory)
            : project.buildHistory
    };

    updateProject(project.id, merged);
    return findProjectById(project.id);
}
