const DEFAULT_PROJECT_FILES = [
    { name: "index.html", generator: "index" },
    { name: "style.css", generator: "style" },
    { name: "app.js", generator: "app" }
];

const backupVersions = {};

function getProjectPath(project) {
    return String(project.githubPath || getProjectGitHubPath(project.name))
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/+/g, "/");
}

function normalizeProjectRelativePath(fileName) {
    const normalized = String(fileName || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .replace(/\/+/g, "/");

    if (!normalized) {
        throw new Error("File name cannot be empty");
    }

    const segments = normalized.split("/");
    if (segments.some(segment => !segment || segment === "." || segment === "..")) {
        throw new Error("Invalid file path: contains traversal sequences");
    }

    return normalized;
}

function getDirectoryPath(filePath) {
    const normalized = normalizeProjectRelativePath(filePath);
    const lastSlash = normalized.lastIndexOf("/");
    return lastSlash === -1 ? "" : normalized.slice(0, lastSlash);
}

function resolveProjectRelativePath(fromFilePath, requestedPath) {
    const raw = String(requestedPath || "").trim();
    if (!raw) return "";

    const clean = raw.replace(/\\/g, "/");
    if (clean.startsWith("/")) {
        return normalizeProjectRelativePath(clean);
    }

    const baseDirectory = fromFilePath ? getDirectoryPath(fromFilePath) : "";
    const parts = `${baseDirectory ? `${baseDirectory}/` : ""}${clean}`.split("/");
    const resolved = [];

    parts.forEach(part => {
        if (!part || part === ".") return;
        if (part === "..") {
            resolved.pop();
            return;
        }
        resolved.push(part);
    });

    return normalizeProjectRelativePath(resolved.join("/"));
}

function detectProjectEntryFile(fileCollection, preferredFile = null) {
    const fileNames = Array.isArray(fileCollection)
        ? fileCollection.map(file => typeof file === "string" ? file : file?.name).filter(Boolean)
        : Object.keys(fileCollection || {});

    const normalizedNames = fileNames
        .map(fileName => {
            try {
                return normalizeProjectRelativePath(fileName);
            } catch (error) {
                return null;
            }
        })
        .filter(Boolean);

    if (preferredFile) {
        try {
            const preferred = normalizeProjectRelativePath(preferredFile);
            if (normalizedNames.includes(preferred) && preferred.toLowerCase().endsWith(".html")) {
                return preferred;
            }
        } catch (error) {
            console.warn("Ignoring invalid preferred preview file:", preferredFile, error);
        }
    }

    const htmlFiles = normalizedNames.filter(fileName => fileName.toLowerCase().endsWith(".html"));
    if (htmlFiles.length === 0) return null;

    const exactRootIndex = htmlFiles.find(fileName => fileName.toLowerCase() === "index.html");
    if (exactRootIndex) return exactRootIndex;

    const nestedIndexes = htmlFiles
        .filter(fileName => fileName.toLowerCase().endsWith("/index.html"))
        .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
    if (nestedIndexes.length) return nestedIndexes[0];

    return htmlFiles.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))[0];
}

function getFilePath(project, fileName) {
    const base = getProjectPath(project);
    const normalized = normalizeProjectRelativePath(fileName);
    return `${base}/${normalized}`;
}

async function createBackup(project, fileName, currentContent) {
    if (!currentContent) return null;

    const key = `${project.name}/${fileName}`;
    backupVersions[key] = (backupVersions[key] || 0) + 1;
    const version = backupVersions[key];

    const ext = fileName.includes(".")
        ? fileName.substring(fileName.lastIndexOf("."))
        : "";
    const base = fileName.replace(ext, "");
    const backupName = `backups/${base}-v${version}${ext}`;
    const backupPath = getFilePath(project, backupName);

    let existingSha = null;
    try {
        const existing = await readGitHubFile(backupPath, { branch: getCurrentGitHubBranch() });
        existingSha = existing.sha;
    } catch (e) { /* new backup */ }

    const result = await writeGitHubFile(
        backupPath,
        currentContent,
        existingSha,
        `Backup ${fileName} v${version}`,
        { branch: getCurrentGitHubBranch() }
    );

    logFileBackup(fileName, version);
    logGitHubCommit(`Backup ${backupName}`);
    return result;
}

async function createOrUpdateFile(project, fileName, content, createBackupFirst = true) {
    const normalizedFileName = normalizeProjectRelativePath(fileName);
    const filePath = getFilePath(project, normalizedFileName);
    let existingSha = null;
    let isUpdate = false;

    try {
        const existing = await readGitHubFile(filePath, { branch: getCurrentGitHubBranch() });
        existingSha = existing.sha;
        isUpdate = true;

        if (createBackupFirst) {
            await createBackup(project, fileName, existing.content);
        }
    } catch (e) {
        const notFound = e.message.includes("404") ||
            e.message.toLowerCase().includes("not found");
        if (!notFound) throw e;
    }

    const result = await writeGitHubFile(
        filePath,
        content,
        existingSha,
        isUpdate ? `Update ${fileName}` : `Create ${fileName}`,
        { branch: getCurrentGitHubBranch() }
    );

    const fileShas = { ...(project.fileShas || {}) };
    fileShas[normalizedFileName] = result.sha;
    updateProject(project.id, { fileShas });
    if (typeof invalidateProjectCacheOnUpdate === "function") {
        invalidateProjectCacheOnUpdate(project.id, getCurrentGitHubBranch());
    }

    if (isUpdate) {
        logFileUpdated(normalizedFileName);
    } else {
        logFileCreated(normalizedFileName);
    }
    logGitHubCommit(`${isUpdate ? "Updated" : "Created"} ${normalizedFileName}`);

    return {
        action: isUpdate ? "updated" : "created",
        sha: result.sha,
        fileName: normalizedFileName,
        commit: result.commit
    };
}

async function deleteProjectFile(project, fileName) {
    const normalizedFileName = normalizeProjectRelativePath(fileName);
    const filePath = getFilePath(project, normalizedFileName);
    const existing = await readGitHubFile(filePath, { branch: getCurrentGitHubBranch() });

    await deleteGitHubFile(
        filePath,
        existing.sha,
        `Delete ${fileName}`,
        { branch: getCurrentGitHubBranch() }
    );

    const fileShas = { ...(project.fileShas || {}) };
    delete fileShas[normalizedFileName];
    updateProject(project.id, { fileShas });
    if (typeof invalidateProjectCacheOnUpdate === "function") {
        invalidateProjectCacheOnUpdate(project.id, getCurrentGitHubBranch());
    }

    logFileDeleted(normalizedFileName);
    logGitHubCommit(`Deleted ${normalizedFileName}`);

    return {
        action: "deleted",
        fileName: normalizedFileName
    };
}

async function renameProjectFile(project, oldName, newName, contentOverride = null) {
    const normalizedOldName = normalizeProjectRelativePath(oldName);
    const normalizedNewName = normalizeProjectRelativePath(newName);
    const existing = await readGitHubFile(getFilePath(project, normalizedOldName), { branch: getCurrentGitHubBranch() });
    const content = contentOverride == null ? existing.content : contentOverride;

    const createResult = await writeGitHubFile(
        getFilePath(project, normalizedNewName),
        content,
        null,
        `Rename ${normalizedOldName} to ${normalizedNewName}`,
        { branch: getCurrentGitHubBranch() }
    );

    await deleteGitHubFile(
        getFilePath(project, normalizedOldName),
        existing.sha,
        `Rename ${normalizedOldName} to ${normalizedNewName}`,
        { branch: getCurrentGitHubBranch() }
    );

    const fileShas = { ...(project.fileShas || {}) };
    delete fileShas[normalizedOldName];
    fileShas[normalizedNewName] = createResult.sha;
    updateProject(project.id, { fileShas });
    if (typeof invalidateProjectCacheOnUpdate === "function") {
        invalidateProjectCacheOnUpdate(project.id, getCurrentGitHubBranch());
    }

    logFileRenamed(normalizedOldName, normalizedNewName);
    logGitHubCommit(`Renamed ${normalizedOldName} to ${normalizedNewName}`);

    return {
        action: "renamed",
        fileName: normalizedNewName,
        previousFileName: normalizedOldName,
        commit: createResult.commit
    };
}

async function getProjectFiles(project) {
    const projectPath = getProjectPath(project);
    const branch = getCurrentGitHubBranch();
    const files = [];

    // Normalized project path without leading/trailing slashes for robust prefix checks
    const normalizedProjectPath = String(projectPath || "").replace(/^\/+|\/+$/g, "");

    async function walkDirectory(dirPath) {
        const items = await listGitHubDirectory(dirPath, { branch });
        for (const item of items) {
            if (item.type === "dir") {
                await walkDirectory(item.path);
                continue;
            }

            if (item.name === "project.json") continue;

            // Compute a consistent relative name for the file relative to the project root
            const rawPath = String(item.path || "").replace(/^\/+|\/+$/g, "");
            let relativeName = item.name;

            if (normalizedProjectPath && rawPath.startsWith(normalizedProjectPath + "/")) {
                relativeName = rawPath.slice(normalizedProjectPath.length + 1);
            } else if (rawPath === normalizedProjectPath) {
                // Edge case: file found that equals the project path - fall back to file name
                relativeName = item.name;
            } else if (rawPath.includes(normalizedProjectPath + "/")) {
                // Defensive: take the first occurrence after the project path
                const idx = rawPath.indexOf(normalizedProjectPath + "/");
                relativeName = rawPath.slice(idx + normalizedProjectPath.length + 1);
            } else {
                // Last-resort: use the basename
                relativeName = item.name;
            }

            // Ensure relativeName is normalized and safe
            let safeName;
            try {
                safeName = normalizeProjectRelativePath(relativeName);
            } catch (e) {
                console.warn("Skipping invalid file path during project file listing:", item.path, e.message);
                continue;
            }

            files.push({
                name: safeName,
                path: item.path,
                sha: item.sha,
                size: item.size
            });
        }
    }

    await walkDirectory(projectPath);
    files.sort((a, b) => a.name.localeCompare(b.name));
    return files;
}

async function listProjectTree(project) {
    const projectPath = getProjectPath(project);
    return buildTreeFromGitHub(projectPath, "");
}

async function buildTreeFromGitHub(dirPath, relativePrefix = "") {
    const items = await listGitHubDirectory(dirPath, { branch: getCurrentGitHubBranch() });
    const tree = [];

    for (const item of items) {
        if (item.name === "project.json") continue;

        const relativeName = relativePrefix ? `${relativePrefix}/${item.name}` : item.name;

        if (item.type === "dir") {
            const children = await buildTreeFromGitHub(item.path, relativeName);
            tree.push({
                type: "folder",
                name: item.name,
                fullName: relativeName,
                path: item.path,
                children
            });
        } else {
            tree.push({
                type: "file",
                name: item.name,
                fullName: relativeName,
                path: item.path,
                sha: item.sha
            });
        }
    }

    tree.sort((a, b) => {
        if (a.type === "folder" && b.type === "file") return -1;
        if (a.type === "file" && b.type === "folder") return 1;
        return a.name.localeCompare(b.name);
    });

    return tree;
}

async function readProjectFiles(project) {
    const files = await getProjectFiles(project);
    const contents = {};
    const fileShas = { ...(project.fileShas || {}) };

    for (const file of files) {
        if (file.name === "project.json") continue;

        try {
            const data = await readGitHubFile(file.path, { branch: getCurrentGitHubBranch() });
            contents[file.name] = data.content;
            fileShas[file.name] = data.sha;
        } catch (e) {
            console.warn(`Could not read ${file.name}:`, e);
        }
    }

    return { files, contents, fileShas };
}

async function readProjectFile(project, fileName) {
    const normalizedFileName = normalizeProjectRelativePath(fileName);
    const filePath = getFilePath(project, normalizedFileName);
    const branch = getCurrentGitHubBranch();

    console.group("File Open");
    console.table([{
        project: project?.name || "unknown",
        branch,
        requestedPath: String(fileName || ""),
        normalizedPath: normalizedFileName,
        githubPath: filePath
    }]);

    try {
        const data = await readGitHubFile(filePath, { branch });
        return data.content;
    } catch (error) {
        console.error("File read failed:", error);
        throw error;
    } finally {
        console.groupEnd();
    }
}

async function initializeProjectFiles(project) {
    const fileShas = { ...(project.fileShas || {}) };

    await writeGitHubFile(
        getFilePath(project, "backups/.gitkeep"),
        "",
        null,
        "Create backups folder",
        { branch: getCurrentGitHubBranch() }
    );

    for (const fileDef of DEFAULT_PROJECT_FILES) {
        const filePath = getFilePath(project, fileDef.name);

        try {
            const existing = await readGitHubFile(filePath, { branch: getCurrentGitHubBranch() });
            fileShas[fileDef.name] = existing.sha;
            continue;
        } catch (e) { /* create new */ }

        let content;
        if (fileDef.generator === "index") {
            content = generateIndexHtml(project.name);
        } else if (fileDef.generator === "style") {
            content = generateStyleCss();
        } else {
            content = generateAppJs();
        }

        const result = await writeGitHubFile(
            filePath,
            content,
            null,
            `Create ${fileDef.name}`,
            { branch: getCurrentGitHubBranch() }
        );

        fileShas[fileDef.name] = result.sha;
        logFileCreated(fileDef.name);
        logGitHubCommit(`Created ${fileDef.name}`);
    }

    updateProject(project.id, { fileShas });
    return findProjectById(project.id);
}

function buildFileTreeFromScan(tree) {
    return tree;
}
