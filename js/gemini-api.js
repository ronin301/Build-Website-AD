const AI_SETTINGS_KEY = "folder_agent_default_ai_settings";

const AI_PROVIDER_CONFIG = {
    gemini: {
        label: "Gemini",
        model: "gemini-2.0-flash",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/models"
    },
    openai: {
        label: "OpenAI",
        model: "gpt-4.1-mini",
        baseUrl: "https://api.openai.com/v1/chat/completions"
    },
    claude: {
        label: "Claude",
        model: "claude-3-5-sonnet-latest",
        baseUrl: "https://api.anthropic.com/v1/messages"
    },
    openrouter: {
        label: "OpenRouter",
        model: "openai/gpt-4.1-mini",
        baseUrl: "https://openrouter.ai/api/v1/chat/completions",
        siteUrl: "https://folder-agent.local",
        siteName: "Folder Agent"
    }
};

function getDefaultAISettings() {
    return {
        activeProvider: "gemini",
        providers: {
            gemini: { apiKey: "", model: AI_PROVIDER_CONFIG.gemini.model, baseUrl: AI_PROVIDER_CONFIG.gemini.baseUrl },
            openai: { apiKey: "", model: AI_PROVIDER_CONFIG.openai.model, baseUrl: AI_PROVIDER_CONFIG.openai.baseUrl },
            claude: { apiKey: "", model: AI_PROVIDER_CONFIG.claude.model, baseUrl: AI_PROVIDER_CONFIG.claude.baseUrl },
            openrouter: {
                apiKey: "",
                model: AI_PROVIDER_CONFIG.openrouter.model,
                baseUrl: AI_PROVIDER_CONFIG.openrouter.baseUrl,
                siteUrl: AI_PROVIDER_CONFIG.openrouter.siteUrl,
                siteName: AI_PROVIDER_CONFIG.openrouter.siteName
            }
        }
    };
}

function mergeAISettings(settings = {}) {
    const defaults = getDefaultAISettings();
    return {
        activeProvider: settings.activeProvider || defaults.activeProvider,
        providers: {
            gemini: { ...defaults.providers.gemini, ...(settings.providers?.gemini || {}) },
            openai: { ...defaults.providers.openai, ...(settings.providers?.openai || {}) },
            claude: { ...defaults.providers.claude, ...(settings.providers?.claude || {}) },
            openrouter: { ...defaults.providers.openrouter, ...(settings.providers?.openrouter || {}) }
        }
    };
}

function saveDefaultAISettings(settings) {
    const merged = mergeAISettings(settings);
    Object.keys(merged.providers).forEach(provider => {
        setSecureAIProviderKey(provider, merged.providers[provider]?.apiKey || "");
    });

    const sanitized = stripCredentialFieldsFromAISettings(merged);
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(sanitized));
}

function getSavedDefaultAISettings() {
    const saved = localStorage.getItem(AI_SETTINGS_KEY);
    const merged = saved
        ? mergeAISettings(parseJsonSafely(saved, getDefaultAISettings()))
        : getDefaultAISettings();
    return applySecureCredentialsToAISettings(merged);
}

function getProviderLabel(provider) {
    return AI_PROVIDER_CONFIG[provider]?.label || "AI Provider";
}

function loadAISettingsToUI(settings) {
    try {
        const merged = applySecureCredentialsToAISettings(mergeAISettings(settings || getSavedDefaultAISettings()));
        const providerSelect = document.getElementById("activeProviderSelect");
        if (providerSelect) {
            providerSelect.value = merged.activeProvider;
        }

        const fieldMap = {
            gemini: ["geminiApiKey", "geminiModel", "geminiBaseUrl"],
            openai: ["openaiApiKey", "openaiModel", "openaiBaseUrl"],
            claude: ["claudeApiKey", "claudeModel", "claudeBaseUrl"],
            openrouter: ["openrouterApiKey", "openrouterModel", "openrouterBaseUrl", "openrouterSiteUrl", "openrouterSiteName"]
        };

        Object.entries(fieldMap).forEach(([provider, ids]) => {
            const values = merged.providers[provider];
            if (!values) return;
            
            ids.forEach(id => {
                const element = document.getElementById(id);
                if (!element) return;

                try {
                    if (id.endsWith("ApiKey")) {
                        element.value = values.apiKey || "";
                    } else if (id.endsWith("Model")) {
                        element.value = values.model || "";
                    } else if (id.endsWith("BaseUrl")) {
                        element.value = values.baseUrl || "";
                    } else if (id.endsWith("SiteUrl")) {
                        element.value = values.siteUrl || "";
                    } else if (id.endsWith("SiteName")) {
                        element.value = values.siteName || "";
                    }
                } catch (e) {
                    console.warn(`Failed to set UI field ${id}:`, e);
                }
            });
        });
    } catch (error) {
        console.error("Failed to load AI settings to UI:", error);
    }
}

function readAISettingsFromUI() {
    const defaults = getDefaultAISettings();
    return applySecureCredentialsToAISettings(mergeAISettings({
        activeProvider: document.getElementById("activeProviderSelect")?.value || defaults.activeProvider,
        providers: {
            gemini: {
                apiKey: document.getElementById("geminiApiKey")?.value.trim() || "",
                model: document.getElementById("geminiModel")?.value.trim() || defaults.providers.gemini.model,
                baseUrl: document.getElementById("geminiBaseUrl")?.value.trim() || defaults.providers.gemini.baseUrl
            },
            openai: {
                apiKey: document.getElementById("openaiApiKey")?.value.trim() || "",
                model: document.getElementById("openaiModel")?.value.trim() || defaults.providers.openai.model,
                baseUrl: document.getElementById("openaiBaseUrl")?.value.trim() || defaults.providers.openai.baseUrl
            },
            claude: {
                apiKey: document.getElementById("claudeApiKey")?.value.trim() || "",
                model: document.getElementById("claudeModel")?.value.trim() || defaults.providers.claude.model,
                baseUrl: document.getElementById("claudeBaseUrl")?.value.trim() || defaults.providers.claude.baseUrl
            },
            openrouter: {
                apiKey: document.getElementById("openrouterApiKey")?.value.trim() || "",
                model: document.getElementById("openrouterModel")?.value.trim() || defaults.providers.openrouter.model,
                baseUrl: document.getElementById("openrouterBaseUrl")?.value.trim() || defaults.providers.openrouter.baseUrl,
                siteUrl: document.getElementById("openrouterSiteUrl")?.value.trim() || defaults.providers.openrouter.siteUrl,
                siteName: document.getElementById("openrouterSiteName")?.value.trim() || defaults.providers.openrouter.siteName
            }
        }
    }));
}

function maskApiKey(apiKey) {
    if (!apiKey) return "missing";
    if (apiKey.length <= 8) return `present (${apiKey.length} chars)`;
    return `present (${apiKey.length} chars, ${apiKey.slice(0, 4)}...${apiKey.slice(-4)})`;
}

function logProviderDebug(provider, step, details) {
    const line = `[${getProviderLabel(provider)} ${step}] ${details}`;
    console.log(line);
    if (typeof logProviderPipelineStep === "function") {
        logProviderPipelineStep(provider, step, details);
    }
}

async function parseJsonResponse(response) {
    if (!response) {
        return {
            ok: false,
            rawBody: "",
            message: "No response received"
        };
    }
    
    let rawBody = "";
    try {
        rawBody = await Promise.race([
            response.text(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Response parsing timeout")), 10000)
            )
        ]);
    } catch (error) {
        return {
            ok: false,
            rawBody,
            message: `Failed to read response body: ${error.message}`
        };
    }
    
    let data = null;
    try {
        data = rawBody ? JSON.parse(rawBody) : null;
    } catch (error) {
        return {
            ok: false,
            rawBody,
            message: `Invalid JSON response: ${error.message}`
        };
    }

    return {
        ok: true,
        rawBody,
        data
    };
}

function extractProviderText(provider, data) {
    if (provider === "gemini") {
        const candidate = data?.candidates?.[0];
        const text = candidate?.content?.parts?.map(part => part.text || "").join("").trim();
        return text || "";
    }

    if (provider === "openai" || provider === "openrouter") {
        return data?.choices?.[0]?.message?.content?.trim() || "";
    }

    if (provider === "claude") {
        return (data?.content || [])
            .map(part => part.text || "")
            .join("")
            .trim();
    }

    return "";
}

async function sendProviderRequest(provider, settings, prompt, systemPrompt) {
    const providerSettings = settings.providers[provider];
    const apiKey = providerSettings.apiKey;
    const model = providerSettings.model;

    if (!apiKey) {
        return {
            success: false,
            message: `${getProviderLabel(provider)} API key not configured`,
            step: "api_key_check"
        };
    }

    logProviderDebug(provider, "CONFIG", `Model: ${model}`);
    logProviderDebug(provider, "CONFIG", `API key: ${maskApiKey(apiKey)}`);

    let response;
    try {
        const fetchPromise = (() => {
            if (provider === "gemini") {
                const baseUrl = providerSettings.baseUrl.replace(/\/$/, "");
                const url = `${baseUrl}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
                return fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [{ text: `${systemPrompt}\n\n${prompt}` }]
                            }
                        ]
                    })
                });
            } else if (provider === "openai") {
                return fetch(providerSettings.baseUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model,
                        temperature: 0.2,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: prompt }
                        ]
                    })
                });
            } else if (provider === "claude") {
                return fetch(providerSettings.baseUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "x-api-key": apiKey,
                        "anthropic-version": "2023-06-01"
                    },
                    body: JSON.stringify({
                        model,
                        max_tokens: 4096,
                        system: systemPrompt,
                        messages: [
                            { role: "user", content: prompt }
                        ]
                    })
                });
            } else if (provider === "openrouter") {
                return fetch(providerSettings.baseUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                        "HTTP-Referer": providerSettings.siteUrl || AI_PROVIDER_CONFIG.openrouter.siteUrl,
                        "X-Title": providerSettings.siteName || AI_PROVIDER_CONFIG.openrouter.siteName
                    },
                    body: JSON.stringify({
                        model,
                        temperature: 0.2,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: prompt }
                        ]
                    })
                });
            } else {
                throw new Error(`Unsupported provider: ${provider}`);
            }
        })();

        response = await Promise.race([
            fetchPromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error("AI provider request timeout after 60s")), 60000)
            )
        ]);
    } catch (error) {
        return {
            success: false,
            message: `${getProviderLabel(provider)} network error: ${error.message}`,
            step: "fetch"
        };
    }

    const parsed = await parseJsonResponse(response);
    if (!parsed.ok) {
        return {
            success: false,
            message: `${getProviderLabel(provider)} ${parsed.message}`,
            step: "parse_json",
            httpStatus: response.status,
            rawBody: parsed.rawBody?.slice(0, 1000)
        };
    }

    if (!response.ok) {
        const providerMessage =
            parsed.data?.error?.message
            || parsed.data?.message
            || `${response.status} ${response.statusText}`;

        return {
            success: false,
            message: `${getProviderLabel(provider)} error: ${providerMessage}`,
            step: "http_error",
            httpStatus: response.status,
            rawBody: parsed.rawBody?.slice(0, 1000)
        };
    }

    const text = extractProviderText(provider, parsed.data);
    if (!text) {
        return {
            success: false,
            message: `${getProviderLabel(provider)} returned no text content`,
            step: "empty_response",
            httpStatus: response.status,
            rawBody: parsed.rawBody?.slice(0, 1000)
        };
    }

    return {
        success: true,
        response: text,
        provider,
        model,
        httpStatus: response.status
    };
}

async function sendAIRequest({ prompt, systemPrompt, aiSettings }) {
    const settings = mergeAISettings(aiSettings || getSavedDefaultAISettings());
    const provider = settings.activeProvider;

    logProviderDebug(provider, "STEP 1", `Prompt received (${prompt.length} chars)`);
    const result = await sendProviderRequest(provider, settings, prompt, systemPrompt);

    if (result.success) {
        logProviderDebug(provider, "STEP 2", `Response received (${result.response.length} chars)`);
    } else {
        logProviderDebug(provider, "ERROR", result.message);
    }

    return result;
}

function saveGeminiKey(apiKey) {
    setSecureAIProviderKey("gemini", apiKey);
}

function getGeminiKey() {
    return getSecureAIProviderKey("gemini");
}
