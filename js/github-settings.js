const GITHUB_SETTINGS_KEY = "folder_agent_github_settings";

const DEFAULT_GITHUB_SETTINGS = {
    repoOwner: "",
    repoName: "",
    baseFolder: "projects",
    defaultBranch: "main"
};

function getGitHubSettings() {
    const saved = localStorage.getItem(GITHUB_SETTINGS_KEY);
    const parsed = saved ? parseJsonSafely(saved, {}) : {};
    return {
        ...DEFAULT_GITHUB_SETTINGS,
        ...sanitizeGitHubSettingsForStorage(parsed),
        githubToken: getSecureGitHubToken()
    };
}

function saveGitHubSettings(settings) {
    const merged = { ...getGitHubSettings(), ...settings };
    setSecureGitHubToken(merged.githubToken || "");

    const sanitized = sanitizeGitHubSettingsForStorage(merged);
    localStorage.setItem(GITHUB_SETTINGS_KEY, JSON.stringify(sanitized));
    return {
        ...sanitized,
        githubToken: getSecureGitHubToken()
    };
}

function loadGitHubSettingsToUI() {
    const settings = getGitHubSettings();
    const fieldMap = {
        githubToken: "githubToken",
        repoOwner: "githubOwner",
        repoName: "githubRepo",
        baseFolder: "githubBaseFolder",
        defaultBranch: "githubDefaultBranch"
    };

    Object.entries(fieldMap).forEach(([key, id]) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = settings[key] || "";
        }
    });
}

function readGitHubSettingsFromUI() {
    const token = document.getElementById("githubToken")?.value.trim() || "";
    const owner = document.getElementById("githubOwner")?.value.trim() || "";
    const repo = document.getElementById("githubRepo")?.value.trim() || "";
    const baseFolder = document.getElementById("githubBaseFolder")?.value.trim() || "projects";
    const branch = document.getElementById("githubDefaultBranch")?.value.trim() || "main";
    
    // Validate token format (should start with ghp_ or github_pat_)
    if (token && !/^(ghp_|github_pat_)/.test(token)) {
        console.warn("GitHub token may have invalid format");
    }
    
    // Validate owner/repo format
    if (owner && !/^[\w\-]+$/.test(owner)) {
        console.warn("GitHub owner contains invalid characters");
    }
    if (repo && !/^[\w\-\.]+$/.test(repo)) {
        console.warn("GitHub repo contains invalid characters");
    }
    
    // Validate folder path
    if (baseFolder && /\.\.|\/\/|^\/|\\/.test(baseFolder)) {
        console.warn("Base folder contains invalid path characters");
    }
    
    return {
        githubToken: token,
        repoOwner: owner,
        repoName: repo,
        baseFolder: baseFolder || "projects",
        defaultBranch: branch || "main"
    };
}

function getProjectGitHubPath(projectName) {
    const { baseFolder } = getGitHubSettings();
    const normalizedBaseFolder = String(baseFolder || DEFAULT_GITHUB_SETTINGS.baseFolder)
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/+/g, "/");
    const normalizedProjectName = String(projectName || "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "")
        .replace(/\/+/g, "/");

    return `${normalizedBaseFolder}/${normalizedProjectName}`;
}

function getFileGitHubPath(projectName, fileName) {
    return `${getProjectGitHubPath(projectName)}/${fileName}`;
}
