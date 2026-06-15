const SECURE_CREDENTIALS_KEY = "folder_agent_secure_credentials";
const LEGACY_GITHUB_SETTINGS_KEY = "folder_agent_github_settings";
const LEGACY_AI_SETTINGS_KEY = "folder_agent_default_ai_settings";
const LEGACY_PROJECTS_KEY = "folder_agent_projects";
const ACTIVITY_LOG_KEY_PREFIX = "activity_logs_";
const SCAN_CACHE_KEY_PREFIX_LEGACY = "project_scan_cache_";
const PROJECT_MEMORY_KEY_PREFIX_LEGACY = "project_memory_";

function parseJsonSafely(value, fallback) {
    if (typeof value !== "string" || value.trim() === "") {
        return fallback;
    }

    try {
        return JSON.parse(value);
    } catch (error) {
        return fallback;
    }
}

function getEmptySecureCredentialStore() {
    return {
        githubToken: "",
        providers: {
            gemini: "",
            openai: "",
            claude: "",
            openrouter: ""
        }
    };
}

function normalizeSecureCredentialStore(store = {}) {
    const defaults = getEmptySecureCredentialStore();
    return {
        githubToken: String(store.githubToken || "").trim(),
        providers: {
            gemini: String(store.providers?.gemini || "").trim(),
            openai: String(store.providers?.openai || "").trim(),
            claude: String(store.providers?.claude || "").trim(),
            openrouter: String(store.providers?.openrouter || "").trim()
        }
    };
}

function getSecureCredentialStore() {
    return normalizeSecureCredentialStore(
        parseJsonSafely(localStorage.getItem(SECURE_CREDENTIALS_KEY), getEmptySecureCredentialStore())
    );
}

function saveSecureCredentialStore(store) {
    const normalized = normalizeSecureCredentialStore(store);
    localStorage.setItem(SECURE_CREDENTIALS_KEY, JSON.stringify(normalized));
    return normalized;
}

function setSecureGitHubToken(token) {
    const store = getSecureCredentialStore();
    store.githubToken = String(token || "").trim();
    return saveSecureCredentialStore(store);
}

function getSecureGitHubToken() {
    return getSecureCredentialStore().githubToken;
}

function setSecureAIProviderKey(provider, apiKey) {
    const store = getSecureCredentialStore();
    const providerName = String(provider || "").toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(store.providers, providerName)) {
        return store;
    }

    store.providers[providerName] = String(apiKey || "").trim();
    return saveSecureCredentialStore(store);
}

function getSecureAIProviderKey(provider) {
    const providerName = String(provider || "").toLowerCase();
    return getSecureCredentialStore().providers[providerName] || "";
}

function sanitizeSecrets(text) {
    if (text == null) return "";

    let value = String(text);
    const patterns = [
        { label: "GitHub PAT", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
        { label: "GitHub Token", regex: /\bghp_[A-Za-z0-9]{20,}\b/g },
        { label: "Claude Key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
        { label: "OpenRouter Key", regex: /\bsk-or-v1-[A-Za-z0-9_-]{20,}\b/g },
        { label: "OpenAI Key (proj) or sk-", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
        { label: "Gemini Key", regex: /\bAIza[0-9A-Za-z\-_]{30,}\b/g },
        { label: "Generic token param", regex: /(?:token|access_token|api_key)=([A-Za-z0-9\-_]{8,})/gi }
    ];

    patterns.forEach(pattern => {
        value = value.replace(pattern.regex, `[REDACTED ${pattern.label}]`);
    });

    return value;
}

function isCredentialFieldName(key) {
    return /(?:^|_)(?:token|apiKey|api_key|secret|authorization)$/i.test(String(key || ""));
}

function sanitizeStructuredContent(value, options = {}) {
    const stripCredentialFields = options.stripCredentialFields !== false;

    if (typeof value === "string") {
        return sanitizeSecrets(value);
    }

    if (Array.isArray(value)) {
        return value.map(entry => sanitizeStructuredContent(entry, options));
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    const sanitized = {};
    Object.entries(value).forEach(([key, entryValue]) => {
        if (stripCredentialFields && isCredentialFieldName(key)) {
            sanitized[key] = "";
            return;
        }

        sanitized[key] = sanitizeStructuredContent(entryValue, options);
    });
    return sanitized;
}

function stripCredentialFieldsFromAISettings(aiSettings = {}) {
    const sanitized = sanitizeStructuredContent(aiSettings);
    if (!sanitized.providers || typeof sanitized.providers !== "object") {
        return sanitized;
    }

    Object.keys(sanitized.providers).forEach(provider => {
        if (sanitized.providers[provider] && typeof sanitized.providers[provider] === "object") {
            sanitized.providers[provider].apiKey = "";
        }
    });

    return sanitized;
}

function applySecureCredentialsToAISettings(aiSettings = {}) {
    const hydrated = sanitizeStructuredContent(aiSettings, { stripCredentialFields: false });
    const providers = hydrated.providers && typeof hydrated.providers === "object"
        ? hydrated.providers
        : {};

    Object.keys(providers).forEach(provider => {
        if (!providers[provider] || typeof providers[provider] !== "object") {
            providers[provider] = {};
        }
        providers[provider].apiKey = getSecureAIProviderKey(provider);
    });

    hydrated.providers = providers;
    return hydrated;
}

function sanitizeGitHubSettingsForStorage(settings = {}) {
    const sanitized = sanitizeStructuredContent(settings);
    sanitized.githubToken = "";
    return sanitized;
}

function sanitizeProjectSettings(settings = {}) {
    const sanitized = sanitizeStructuredContent(settings);
    sanitized.githubToken = "";

    if (sanitized.ai) {
        sanitized.ai = stripCredentialFieldsFromAISettings(sanitized.ai);
    }

    return sanitized;
}

function sanitizeWorkspaceState(state = {}) {
    return sanitizeStructuredContent(state);
}

function sanitizeProjectRecord(project = {}) {
    return sanitizeStructuredContent({
        ...project,
        settings: sanitizeProjectSettings(project.settings || {}),
        workspaceState: sanitizeWorkspaceState(project.workspaceState || {}),
        chatHistory: Array.isArray(project.chatHistory) ? project.chatHistory : [],
        buildHistory: Array.isArray(project.buildHistory) ? project.buildHistory : []
    });
}

function sanitizeProjectsForStorage(projects) {
    if (!Array.isArray(projects)) return [];
    return projects.map(project => sanitizeProjectRecord(project));
}

function sanitizeStoredJsonAtKey(key) {
    const raw = localStorage.getItem(key);
    if (typeof raw !== "string") return false;

    const parsed = parseJsonSafely(raw, undefined);
    if (parsed === undefined) {
        const sanitizedText = sanitizeSecrets(raw);
        if (sanitizedText !== raw) {
            localStorage.setItem(key, sanitizedText);
            return true;
        }
        return false;
    }

    const sanitized = sanitizeStructuredContent(parsed);
    const nextRaw = JSON.stringify(sanitized);
    if (nextRaw !== raw) {
        localStorage.setItem(key, nextRaw);
        return true;
    }

    return false;
}

function migrateLegacyCredentialStorage() {
    console.group("Credential Migration");
    const changes = [];

    const githubSettings = parseJsonSafely(localStorage.getItem(LEGACY_GITHUB_SETTINGS_KEY), null);
    if (githubSettings?.githubToken) {
        setSecureGitHubToken(githubSettings.githubToken);
        localStorage.setItem(
            LEGACY_GITHUB_SETTINGS_KEY,
            JSON.stringify(sanitizeGitHubSettingsForStorage(githubSettings))
        );
        changes.push({ area: "github-settings", action: "migrated token to secure storage" });
    }

    const aiSettings = parseJsonSafely(localStorage.getItem(LEGACY_AI_SETTINGS_KEY), null);
    if (aiSettings?.providers && typeof aiSettings.providers === "object") {
        let movedProviderKey = false;
        Object.entries(aiSettings.providers).forEach(([provider, config]) => {
            if (config?.apiKey) {
                setSecureAIProviderKey(provider, config.apiKey);
                movedProviderKey = true;
            }
        });

        if (movedProviderKey) {
            localStorage.setItem(
                LEGACY_AI_SETTINGS_KEY,
                JSON.stringify(stripCredentialFieldsFromAISettings(aiSettings))
            );
            changes.push({ area: "ai-settings", action: "migrated provider keys to secure storage" });
        }
    }

    const projects = parseJsonSafely(localStorage.getItem(LEGACY_PROJECTS_KEY), null);
    if (Array.isArray(projects)) {
        const sanitizedProjects = sanitizeProjectsForStorage(projects);
        const nextRaw = JSON.stringify(sanitizedProjects);
        if (nextRaw !== JSON.stringify(projects)) {
            localStorage.setItem(LEGACY_PROJECTS_KEY, nextRaw);
            changes.push({ area: "projects", action: "scrubbed secrets from project records" });
        }
    }

    const keysToSanitize = [];
    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || key === SECURE_CREDENTIALS_KEY) continue;

        if (
            key.startsWith(ACTIVITY_LOG_KEY_PREFIX) ||
            key.startsWith(SCAN_CACHE_KEY_PREFIX_LEGACY) ||
            key.startsWith(PROJECT_MEMORY_KEY_PREFIX_LEGACY)
        ) {
            keysToSanitize.push(key);
        }
    }

    keysToSanitize.forEach(key => {
        if (sanitizeStoredJsonAtKey(key)) {
            changes.push({ area: key, action: "scrubbed stored data" });
        }
    });

    if (changes.length) {
        console.table(changes);
    } else {
        console.table([{ area: "secure-storage", action: "no migration changes needed" }]);
    }
    console.groupEnd();
}
