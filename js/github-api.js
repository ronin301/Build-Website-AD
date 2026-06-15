const GITHUB_API = "https://api.github.com";

function buildQuery(params = {}) {
    const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "");
    if (entries.length === 0) return "";
    return `?${new URLSearchParams(entries).toString()}`;
}

function getRepoPath(subPath = "") {
    const { repoOwner, repoName } = getGitHubSettings();
    if (!repoOwner || !repoName) {
        throw new Error("GitHub repository not configured");
    }
    const clean = String(subPath).replace(/^\/+/, "").replace(/\/+$/, "");
    if (clean.includes("//")) {
        throw new Error("Invalid path: contains consecutive slashes");
    }
    return `/repos/${repoOwner}/${repoName}/contents/${clean}`;
}

async function githubFetch(path, options = {}) {
    const settings = getGitHubSettings();
    if (!settings.githubToken) {
        throw new Error("GitHub token not configured");
    }

    const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;

    let response;
    try {
        const fetchPromise = fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${settings.githubToken}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                ...options.headers
            }
        });
        
        response = await Promise.race([
            fetchPromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error("GitHub API request timeout after 30s")), 30000)
            )
        ]);
    } catch (networkError) {
        throw new Error(`GitHub network error: ${networkError.message}`);
    }

    if (response.status === 204) {
        return { success: true };
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || `GitHub API error: ${response.status}`);
    }

    return data;
}

async function validateGitHubToken() {
    const data = await githubFetch("/user");
    return { valid: true, login: data.login };
}

async function validateGitHubRepository() {
    const { repoOwner, repoName } = getGitHubSettings();
    const data = await githubFetch(`/repos/${repoOwner}/${repoName}`);
    saveGitHubSettings({ defaultBranch: data.default_branch || "main" });
    return {
        valid: true,
        fullName: data.full_name,
        defaultBranch: data.default_branch || "main",
        openIssues: data.open_issues_count || 0,
        visibility: data.visibility || "private"
    };
}

async function pathExists(path, branch = getCurrentGitHubBranch()) {
    try {
        await githubFetch(`${getRepoPath(path)}${buildQuery({ ref: branch })}`);
        return true;
    } catch (error) {
        if (String(error.message).includes("404") || String(error.message).toLowerCase().includes("not found")) {
            return false;
        }
        throw error;
    }
}

async function ensureBaseFolder() {
    const { baseFolder } = getGitHubSettings();
    const branch = getCurrentGitHubBranch ? getCurrentGitHubBranch() : getGitHubSettings().defaultBranch;
    const exists = await pathExists(baseFolder, branch);

    if (!exists) {
        await writeGitHubFile(
            `${baseFolder}/.gitkeep`,
            "",
            null,
            `Create base folder: ${baseFolder}`,
            { branch }
        );
    }

    return baseFolder;
}

async function validateGitHubConnection() {
    const settings = getGitHubSettings();
    
    if (!settings.githubToken) {
        throw new Error("GitHub token not configured");
    }
    if (!settings.repoOwner) {
        throw new Error("GitHub repository owner not configured");
    }
    if (!settings.repoName) {
        throw new Error("GitHub repository name not configured");
    }
    
    await validateGitHubToken();
    await validateGitHubRepository();
    await ensureBaseFolder();
    return { success: true };
}

function decodeGitHubContent(encoded) {
    if (!encoded) return "";
    return decodeURIComponent(escape(atob(encoded.replace(/\n/g, ""))));
}

async function readGitHubFile(filePath, options = {}) {
    const branch = options.branch || getCurrentGitHubBranch();
    const data = await githubFetch(`${getRepoPath(filePath)}${buildQuery({ ref: branch })}`);

    if (Array.isArray(data)) {
        throw new Error(`${filePath} is a directory, not a file`);
    }

    return {
        content: decodeGitHubContent(data.content),
        sha: data.sha,
        path: data.path,
        name: data.name
    };
}

async function listGitHubDirectory(dirPath, options = {}) {
    const branch = options.branch || getCurrentGitHubBranch();
    try {
        const data = await githubFetch(`${getRepoPath(dirPath)}${buildQuery({ ref: branch })}`);
        return Array.isArray(data) ? data : [];
    } catch (error) {
        if (String(error.message).includes("404") || String(error.message).toLowerCase().includes("not found")) {
            return [];
        }
        throw error;
    }
}

async function writeGitHubFile(filePath, content, sha, message, options = {}) {
    const branch = options.branch || getCurrentGitHubBranch();
    const sanitizedContent = sanitizeSecrets(content);
    const sanitizedMessage = sanitizeSecrets(message || `Update ${filePath}`);
    const body = {
        message: sanitizedMessage,
        content: btoa(unescape(encodeURIComponent(sanitizedContent))),
        branch
    };

    if (sha) {
        body.sha = sha;
    }

    console.group("Commit");
    console.table([{
        branch,
        filePath,
        sha: sha || "(new file)",
        sanitized: sanitizedContent !== String(content),
        contentLength: sanitizedContent.length
    }]);

    try {
        const data = await githubFetch(getRepoPath(filePath), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (!data.content?.sha) {
            throw new Error(`GitHub did not confirm write for ${filePath}`);
        }

        return {
            sha: data.content.sha,
            path: data.content.path,
            commit: data.commit?.sha
        };
    } catch (error) {
        console.error("Commit write failed:", error);
        throw error;
    } finally {
        console.groupEnd();
    }
}

async function deleteGitHubFile(filePath, sha, message, options = {}) {
    const branch = options.branch || getCurrentGitHubBranch();
    const sanitizedMessage = sanitizeSecrets(message || `Delete ${filePath}`);
    return githubFetch(getRepoPath(filePath), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            message: sanitizedMessage,
            sha,
            branch
        })
    });
}

async function listProjectOnGitHub(projectName, branch = getCurrentGitHubBranch()) {
    return listGitHubDirectory(getProjectGitHubPath(projectName), { branch });
}

async function projectExistsOnGitHub(projectName, branch = getCurrentGitHubBranch()) {
    const items = await listProjectOnGitHub(projectName, branch);
    return items.length > 0;
}

async function listAllGitHubProjects(branch = getCurrentGitHubBranch()) {
    const { baseFolder } = getGitHubSettings();
    const items = await listGitHubDirectory(baseFolder, { branch });
    return items.filter(item => item.type === "dir").map(item => item.name);
}

async function deleteGitHubProjectFolder(projectName, branch = getCurrentGitHubBranch()) {
    const projectPath = getProjectGitHubPath(projectName);

    async function deleteRecursive(dirPath) {
        const items = await listGitHubDirectory(dirPath, { branch });
        for (const item of items) {
            if (item.type === "dir") {
                await deleteRecursive(item.path);
            } else {
                await deleteGitHubFile(item.path, item.sha, `Delete ${item.path}`, { branch });
            }
        }
    }

    await deleteRecursive(projectPath);
}

async function listBranches() {
    const { repoOwner, repoName } = getGitHubSettings();
    return githubFetch(`/repos/${repoOwner}/${repoName}/branches?per_page=100`);
}

async function getBranchSha(branchName) {
    const { repoOwner, repoName } = getGitHubSettings();
    try {
        const branch = await githubFetch(`/repos/${repoOwner}/${repoName}/branches/${encodeURIComponent(branchName)}`);
        if (!branch.commit?.sha) {
            throw new Error(`No commit SHA found for branch: ${branchName}`);
        }
        return branch.commit.sha;
    } catch (error) {
        throw new Error(`Failed to get branch SHA for ${branchName}: ${error.message}`);
    }
}

async function createBranch(branchName, sourceBranch = getGitHubSettings().defaultBranch || "main") {
    const { repoOwner, repoName } = getGitHubSettings();
    const sourceSha = await getBranchSha(sourceBranch);

    return githubFetch(`/repos/${repoOwner}/${repoName}/git/refs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            ref: `refs/heads/${branchName}`,
            sha: sourceSha
        })
    });
}

async function listCommitHistory(project, branch = getCurrentGitHubBranch()) {
    const { repoOwner, repoName } = getGitHubSettings();
    const path = project?.githubPath || getProjectGitHubPath(project?.name || "");
    const query = buildQuery({ sha: branch, path, per_page: 20 });
    return githubFetch(`/repos/${repoOwner}/${repoName}/commits${query}`);
}

async function listPullRequests(state = "open") {
    const { repoOwner, repoName } = getGitHubSettings();
    return githubFetch(`/repos/${repoOwner}/${repoName}/pulls${buildQuery({ state, per_page: 20 })}`);
}

async function createPullRequest({ title, body, head, base }) {
    const { repoOwner, repoName } = getGitHubSettings();
    const sanitizedTitle = sanitizeSecrets(title || "");
    const sanitizedBody = sanitizeSecrets(body || "");
    return githubFetch(`/repos/${repoOwner}/${repoName}/pulls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: sanitizedTitle,
            body: sanitizedBody,
            head,
            base
        })
    });
}

async function getRepositoryOverview() {
    const { repoOwner, repoName, baseFolder } = getGitHubSettings();
    const [repo, branches, pulls, projects] = await Promise.all([
        githubFetch(`/repos/${repoOwner}/${repoName}`),
        listBranches(),
        listPullRequests("open"),
        listAllGitHubProjects(getCurrentGitHubBranch ? getCurrentGitHubBranch() : undefined)
    ]);

    return {
        name: repo.full_name,
        visibility: repo.visibility,
        defaultBranch: repo.default_branch,
        currentBranch: getCurrentGitHubBranch ? getCurrentGitHubBranch() : repo.default_branch,
        baseFolder,
        branchCount: branches.length,
        openPullRequests: pulls.length,
        projectCount: projects.length,
        updatedAt: repo.updated_at
    };
}
