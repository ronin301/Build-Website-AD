// AI settings storage and secure credential helpers
const DEFAULT_AI_SETTINGS_KEY = typeof LEGACY_AI_SETTINGS_KEY !== 'undefined' ? LEGACY_AI_SETTINGS_KEY : 'folder_agent_default_ai_settings';

function getDefaultAISettings() {
    return {
        activeProvider: 'gemini',
        providers: {
            gemini: { model: 'gemini-1', /* apiKey intentionally omitted */ },
            openai: { model: 'gpt-4o-mini' },
            claude: { model: 'claude-2.1' },
            openrouter: { model: 'openrouter-default' }
        }
    };
}

function mergeAISettings(settings = {}) {
    const defaults = getDefaultAISettings();
    const mergedProviders = {
        ...(defaults.providers || {}),
        ...(settings.providers || {})
    };

    return {
        ...defaults,
        ...settings,
        providers: mergedProviders,
        activeProvider: settings.activeProvider || defaults.activeProvider
    };
}

function getSavedDefaultAISettings() {
    const raw = localStorage.getItem(DEFAULT_AI_SETTINGS_KEY);
    const parsed = raw ? parseJsonSafely(raw, null) : null;
    const merged = mergeAISettings(parsed || getDefaultAISettings());
    // Ensure saved settings have no credential material
    return stripCredentialFieldsFromAISettings(merged);
}

function saveDefaultAISettings(settings = {}) {
    const validated = mergeAISettings(settings);

    // Validate active provider exists
    const active = validated.activeProvider;
    if (!active || !validated.providers || !validated.providers[active]) {
        throw new Error('Active provider must be one of the configured providers');
    }

    // If an apiKey was provided in the UI for the active provider, move it into secure storage
    try {
        const uiKeyField = document.getElementById(`${active}ApiKey`);
        if (uiKeyField && uiKeyField.value && uiKeyField.value.trim()) {
            // Persist in secure store and do not keep in saved defaults
            setSecureAIProviderKey(active, uiKeyField.value.trim());
        }
    } catch (e) {
        // ignore DOM access failures
    }

    // Remove credential fields before saving defaults
    const sanitized = stripCredentialFieldsFromAISettings(validated);
    localStorage.setItem(DEFAULT_AI_SETTINGS_KEY, JSON.stringify(sanitized));

    // Return hydrated settings for runtime (but keys remain in secure store)
    return sanitized;
}

function readAISettingsFromUI() {
    const active = document.getElementById('activeProviderSelect')?.value || getSavedDefaultAISettings().activeProvider;
    const providers = {};

    ['gemini','openai','claude','openrouter'].forEach(provider => {
        const model = document.getElementById(`${provider}Model`)?.value || '';
        const apiKey = document.getElementById(`${provider}ApiKey`)?.value || '';
        providers[provider] = { model: model };
        // Persist key only for active provider
        if (provider === active && apiKey && apiKey.trim()) {
            setSecureAIProviderKey(provider, apiKey.trim());
        }
    });

    return {
        activeProvider: active,
        providers
    };
}

function loadAISettingsToUI(aiSettings = {}) {
    const merged = mergeAISettings(aiSettings || getSavedDefaultAISettings());

    const select = document.getElementById('activeProviderSelect');
    if (select) select.value = merged.activeProvider;

    Object.keys(merged.providers || {}).forEach(provider => {
        const modelEl = document.getElementById(`${provider}Model`);
        if (modelEl) modelEl.value = merged.providers[provider].model || '';
        // Do NOT populate api key fields from storage (security). Leave blank so user must re-enter if needed.
        const apiEl = document.getElementById(`${provider}ApiKey`);
        if (apiEl) apiEl.value = '';
    });
}

function validateAISettings(settings = {}) {
    const merged = mergeAISettings(settings);
    const active = merged.activeProvider;
    if (!active) return { valid: false, message: 'Active provider not set' };
    if (!merged.providers || !merged.providers[active]) return { valid: false, message: 'Active provider configuration missing' };

    // Ensure secure key exists for active provider
    const key = getSecureAIProviderKey(active);
    if (!key) return { valid: false, message: `${active} API key not configured` };
    return { valid: true };
}

function clipText(text, limit = 12000) {
    if (!text) return "";
    return text.length > limit ? `${text.slice(0, limit)}\n\n...[truncated]` : text;
}

function buildProjectAnalysis(project, files, scanSummary) {
    const byExtension = files.reduce((acc, file) => {
        const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "none";
        acc[ext] = (acc[ext] || 0) + 1;
        return acc;
    }, {});

    const extensionSummary = Object.entries(byExtension)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([ext, count]) => `${ext}:${count}`)
        .join(", ");

    return [
        `Project: ${project.name}`,
        `GitHub Path: ${project.githubPath || getProjectGitHubPath(project.name)}`,
        `Active Branch: ${getCurrentGitHubBranch()}`,
        `Files: ${files.length}`,
        `Top File Types: ${extensionSummary || "none"}`,
        `Scan Summary: ${scanSummary ? JSON.stringify(scanSummary) : "not available"}`
    ].join("\n");
}

function detectRelevantFiles({ project, files, prompt, action, targetFile }) {
    const lowered = prompt.toLowerCase();
    const detected = new Set();

    if (targetFile) detected.add(targetFile);
    if (getWorkspaceState().openFile) detected.add(getWorkspaceState().openFile);

    files.forEach(file => {
        const normalized = file.name.toLowerCase();
        if (lowered.includes(normalized)) {
            detected.add(file.name);
        }
    });

    if (action === "generate") {
        ["index.html", "style.css", "app.js"].forEach(file => {
            if (files.some(entry => entry.name === file)) {
                detected.add(file);
            }
        });
    }

    if (action === "rename" || action === "delete" || action === "explain") {
        if (targetFile) {
            detected.add(targetFile);
        }
    }

    if (detected.size === 0) {
        files.slice(0, 6).forEach(file => detected.add(file.name));
    }

    return Array.from(detected);
}

function buildWorkflowSystemPrompt(action) {
    return `You are Folder Agent, a multi-provider AI coding agent.
You must analyze the user's coding request and return strict JSON only.
Never return markdown fences.
Never auto-commit or mention committing automatically.
Prefer modifying existing files instead of creating duplicates.
For update, generate, and refactor operations, always return the full file content.
For rename operations, return "fromPath" and "toPath". Include "content" only if the renamed file content should change.
For delete operations, return the target path.
For explain requests, return "type": "explain" and put the human explanation in "explanation".
The requested action is: ${action}.

JSON shape:
{
  "summary": "Short user-facing summary",
  "analysis": "Short explanation of how the project was analyzed",
  "commitMessage": "Suggested commit message",
  "filesDetected": ["path/to/file"],
  "operations": [
    {
      "type": "create|update|delete|rename|explain",
      "path": "relative/path.ext",
      "fromPath": "old/path.ext",
      "toPath": "new/path.ext",
      "content": "full file content when required",
      "explanation": "for explain output"
    }
  ]
}`;
}

function buildWorkflowPrompt({ project, action, userPrompt, targetFile, detectedFiles, analysis, selectedContents, allFiles }) {
    const fileSection = detectedFiles.length
        ? detectedFiles.map(file => `--- ${file} ---\n${clipText(selectedContents[file] || "")}`).join("\n\n")
        : "No detected files";

    return `PROJECT ANALYSIS
${analysis}

KNOWN FILES
${allFiles.join(", ") || "none"}

TARGET FILE
${targetFile || "not specified"}

DETECTED FILES
${detectedFiles.join(", ") || "none"}

DETECTED FILE CONTENTS
${fileSection}

USER REQUEST
${userPrompt}

Return operations that satisfy the request.`;
}

function parseAIResponse(response) {
    if (!response || typeof response !== "string") {
        console.warn("Invalid AI response format");
        return { summary: "Invalid response format", operations: [] };
    }
    
    try {
        // Try to find JSON object in response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.warn("No JSON object found in AI response");
            return { summary: response.substring(0, 200), operations: [] };
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validate parsed structure
        if (typeof parsed !== "object" || parsed === null) {
            throw new Error("Parsed result is not an object");
        }
        
        return parsed;
    } catch (error) {
        console.warn("AI response parse failed:", error);
        return { 
            summary: response.substring(0, 200), 
            operations: [],
            parseError: error.message 
        };
    }
}

function normalizeOperation(operation, fallbackAction, targetFile) {
    if (!operation || typeof operation !== "object") {
        console.warn("Invalid operation object");
        return {
            type: fallbackAction || "update",
            path: targetFile || "",
            fromPath: "",
            toPath: "",
            content: undefined,
            explanation: "",
            summary: ""
        };
    }
    
    const type = (operation.type || operation.action || fallbackAction || "update").toLowerCase();
    const path = operation.path || operation.name || targetFile || "";
    
    return {
        type: String(type).toLowerCase(),
        path: String(path).trim(),
        fromPath: String(operation.fromPath || operation.oldPath || "").trim(),
        toPath: String(operation.toPath || operation.newPath || operation.path || "").trim(),
        content: operation.content,
        explanation: String(operation.explanation || "").trim(),
        summary: String(operation.summary || "").trim()
    };
}

function buildUnifiedDiff(oldText = "", newText = "", labelOld = "before", labelNew = "after") {
    const oldLines = String(oldText).split("\n");
    const newLines = String(newText).split("\n");
    const rows = Array.from({ length: oldLines.length + 1 }, () => new Array(newLines.length + 1).fill(0));

    for (let i = oldLines.length - 1; i >= 0; i -= 1) {
        for (let j = newLines.length - 1; j >= 0; j -= 1) {
            rows[i][j] = oldLines[i] === newLines[j]
                ? rows[i + 1][j + 1] + 1
                : Math.max(rows[i + 1][j], rows[i][j + 1]);
        }
    }

    const output = [`--- ${labelOld}`, `+++ ${labelNew}`];
    let i = 0;
    let j = 0;

    while (i < oldLines.length && j < newLines.length) {
        if (oldLines[i] === newLines[j]) {
            output.push(`  ${oldLines[i]}`);
            i += 1;
            j += 1;
        } else if (rows[i + 1][j] >= rows[i][j + 1]) {
            output.push(`- ${oldLines[i]}`);
            i += 1;
        } else {
            output.push(`+ ${newLines[j]}`);
            j += 1;
        }
    }

    while (i < oldLines.length) {
        output.push(`- ${oldLines[i]}`);
        i += 1;
    }

    while (j < newLines.length) {
        output.push(`+ ${newLines[j]}`);
        j += 1;
    }

    return output.join("\n");
}

async function buildPreviewChange(project, operation, contents) {
    if (operation.type === "explain") {
        return {
            ...operation,
            displayPath: operation.path || getWorkspaceState().openFile || "selection",
            diff: sanitizeSecrets(operation.explanation || "No explanation returned."),
            requiresCommit: false
        };
    }

    if (operation.type === "delete") {
        const oldContent = sanitizeSecrets(contents[operation.path] || await readProjectFile(project, operation.path).catch(() => ""));
        return {
            ...operation,
            displayPath: operation.path,
            oldContent,
            newContent: "",
            diff: buildUnifiedDiff(oldContent, "", operation.path, "(deleted)"),
            requiresCommit: true
        };
    }

    if (operation.type === "rename") {
        const fromPath = operation.fromPath || operation.path;
        const toPath = operation.toPath || operation.path;
        const oldContent = sanitizeSecrets(contents[fromPath] || await readProjectFile(project, fromPath).catch(() => ""));
        const newContent = sanitizeSecrets(operation.content == null ? oldContent : operation.content);
        return {
            ...operation,
            path: fromPath,
            displayPath: `${fromPath} -> ${toPath}`,
            oldContent,
            newContent,
            diff: buildUnifiedDiff(oldContent, newContent, fromPath, toPath),
            requiresCommit: true
        };
    }

    const resolvedPath = operation.path;
    const oldContent = sanitizeSecrets(contents[resolvedPath] || "");
    const newContent = sanitizeSecrets(operation.content || "");
    const labelOld = operation.type === "create" ? "(new file)" : resolvedPath;
    const labelNew = resolvedPath;

    return {
        ...operation,
        displayPath: resolvedPath,
        oldContent,
        newContent,
        diff: buildUnifiedDiff(operation.type === "create" ? "" : oldContent, newContent, labelOld, labelNew),
        requiresCommit: true
    };
}

async function processNaturalLanguageRequest({ userPrompt, project, action, targetFile }) {
    const { files, contents } = await readProjectFiles(project);
    const scanSummary = getWorkspaceState().scanResult;
    const analysis = buildProjectAnalysis(project, files, scanSummary);
    const detectedFiles = detectRelevantFiles({
        project,
        files,
        prompt: userPrompt,
        action,
        targetFile
    });
    const selectedContents = detectedFiles.reduce((acc, file) => {
        if (contents[file] != null) {
            acc[file] = contents[file];
        }
        return acc;
    }, {});

    logAIRequest(userPrompt);
    logWorkflowStep("Project Analysis", `${files.length} files analyzed`);
    logWorkflowStep("File Detection", detectedFiles.join(", ") || "none");

    const aiResult = await sendAIRequest({
        prompt: buildWorkflowPrompt({
            project,
            action,
            userPrompt,
            targetFile,
            detectedFiles,
            analysis,
            selectedContents,
            allFiles: files.map(file => file.name)
        }),
        systemPrompt: buildWorkflowSystemPrompt(action),
        aiSettings: getCurrentAISettings()
    });

    if (!aiResult.success) {
        logAIError(aiResult.message || "AI request failed");
        return {
            success: false,
            message: aiResult.message,
            step: aiResult.step,
            httpStatus: aiResult.httpStatus
        };
    }

    logAIResponse(aiResult.response.substring(0, 120));
    logWorkflowStep("AI Generation", `${getProviderLabel(aiResult.provider)} ${aiResult.model}`);

    const parsed = parseAIResponse(aiResult.response);
    const operations = (parsed.operations || parsed.files || [])
        .map(entry => normalizeOperation(entry, action, targetFile))
        .filter(entry => entry.type === "explain" || entry.path || entry.fromPath);

    logAIParseResult(operations.length > 0 || Boolean(parsed.analysis), parsed.summary || `${operations.length} operation(s)`);

    const previewChanges = [];
    for (const operation of operations) {
        try {
            previewChanges.push(await buildPreviewChange(project, operation, contents));
        } catch (error) {
            console.error("Failed to build preview for operation:", operation, error);
            logAIError(`Failed to preview change: ${error.message}`);
        }
    }

    const pendingWorkflow = {
        action,
        prompt: userPrompt,
        analysis: parsed.analysis || analysis,
        summary: parsed.summary || "Workflow completed",
        filesDetected: parsed.filesDetected || detectedFiles,
        commitMessage: parsed.commitMessage || `${action} project changes`,
        provider: aiResult.provider,
        model: aiResult.model,
        changes: previewChanges
    };

    return {
        success: true,
        summary: pendingWorkflow.summary,
        analysis: pendingWorkflow.analysis,
        filesDetected: pendingWorkflow.filesDetected,
        commitMessage: pendingWorkflow.commitMessage,
        changes: pendingWorkflow.changes,
        pendingWorkflow
    };
}

async function commitPendingWorkflow(project, pendingWorkflow, commitMessage) {
    if (!pendingWorkflow?.changes?.length) {
        throw new Error("No staged workflow changes to commit");
    }

    const safeCommitMessage = sanitizeSecrets(commitMessage || pendingWorkflow.commitMessage || "Approved workflow commit");
    const changes = [];
    for (const change of pendingWorkflow.changes) {
        if (!change.requiresCommit) continue;

        if (change.type === "create" || change.type === "update" || change.type === "refactor") {
            const result = await createOrUpdateFile(project, change.path, change.newContent, change.type !== "create");
            changes.push({ ...result, action: change.type });
        } else if (change.type === "delete") {
            const result = await deleteProjectFile(project, change.path);
            changes.push(result);
        } else if (change.type === "rename") {
            const result = await renameProjectFile(project, change.path, change.toPath, change.newContent);
            changes.push(result);
        }

        addBuildHistoryEntry(project.id, {
            prompt: sanitizeSecrets(pendingWorkflow.prompt),
            file: change.displayPath || change.path,
            action: change.type,
            time: new Date().toISOString(),
            commitMessage: safeCommitMessage
        });
    }

    const updated = findProjectById(project.id);
    setCurrentProject(updated);
    await syncManifestToGitHub(updated);
    logGitHubCommit(safeCommitMessage);

    return {
        success: true,
        changes
    };
}

function addBuildHistoryEntry(projectId, entry) {
    const project = findProjectById(projectId);
    if (!project) return;

    const buildHistory = [...(project.buildHistory || []), sanitizeStructuredContent(entry)];
    updateProject(projectId, { buildHistory });
}
