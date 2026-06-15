const activityLogs = {};

function getProjectLogKey(projectId) {
    return `activity_logs_${projectId}`;
}

function addActivityLog(message, projectId) {
    const pid = projectId || getCurrentProject()?.id || "global";
    const sanitizedMessage = sanitizeSecrets(message);

    if (!activityLogs[pid]) {
        activityLogs[pid] = [];
    }

    // Prevent duplicate logs added in the same second
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19);
    const recentDuplicate = activityLogs[pid].some(log => 
        log.message === sanitizedMessage &&
        (log.timestamp || "").slice(0, 19) === timestamp
    );
    
    if (recentDuplicate) {
        console.warn("Duplicate activity log prevented:", sanitizedMessage);
        return null;
    }

    const log = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 9),
        message: sanitizedMessage,
        time: now.toLocaleTimeString(),
        timestamp: now.toISOString()
    };

    activityLogs[pid].push(log);
    saveActivityLogs(pid);
    renderActivityLog(pid);
    return log;
}

function getActivityLogs(projectId) {
    const pid = projectId || getCurrentProject()?.id || "global";
    return activityLogs[pid] || [];
}

function clearProjectActivityLogs(projectId) {
    delete activityLogs[projectId];
    localStorage.removeItem(getProjectLogKey(projectId));
}

function saveActivityLogs(projectId) {
    const pid = projectId || getCurrentProject()?.id || "global";
    localStorage.setItem(
        getProjectLogKey(pid),
        JSON.stringify(sanitizeStructuredContent(activityLogs[pid] || []))
    );
}

function loadProjectActivityLogs(projectId) {
    if (!projectId) return;

    const saved = localStorage.getItem(getProjectLogKey(projectId));
    try {
        activityLogs[projectId] = saved ? sanitizeStructuredContent(JSON.parse(saved)) : [];
    } catch (error) {
        console.error("Failed to parse activity logs for project:", projectId, error);
        activityLogs[projectId] = [];
    }
}

function loadActivityLogs() {
    getProjects().forEach(p => loadProjectActivityLogs(p.id));
}

function buildActivitySummary(projectId) {
    const logs = getActivityLogs(projectId);
    if (logs.length === 0) return "No activity yet";

    return logs
        .slice(-20)
        .reverse()
        .map(log => `${log.time}  ${log.message}`)
        .join("\n");
}

function renderActivityLog(projectId) {
    const container = document.getElementById("activityLog");
    if (!container) return;

    const pid = projectId || getCurrentProject()?.id;
    if (!pid) {
        container.textContent = "No activity yet";
        return;
    }
    
    try {
        container.textContent = buildActivitySummary(pid);
    } catch (error) {
        console.error("Failed to render activity log:", error);
        container.textContent = "Error loading activity log";
    }
}

function logProjectCreated(name) {
    addActivityLog(`Created project: ${name}`);
}

function logProjectOpened(name) {
    addActivityLog(`Opened project: ${name}`);
}

function logProjectDeleted(name) {
    addActivityLog(`Deleted project: ${name}`);
}

function logProjectScanned() {
    addActivityLog("Scanned project from GitHub");
}

function logPromptSent(prompt) {
    addActivityLog(`Prompt sent: ${prompt.substring(0, 60)}`);
}

function logFileCreated(fileName) {
    addActivityLog(`Created ${fileName}`);
}

function logFileUpdated(fileName) {
    addActivityLog(`Updated ${fileName}`);
}

function logFileDeleted(fileName) {
    addActivityLog(`Deleted ${fileName}`);
}

function logFileRenamed(oldName, newName) {
    addActivityLog(`Renamed ${oldName} -> ${newName}`);
}

function logFileBackup(fileName, version) {
    addActivityLog(`Backup ${fileName} → v${version}`);
}

function logGitHubCommit(message) {
    addActivityLog(`GitHub commit: ${message}`);
}

function logAIRequest(prompt) {
    addActivityLog(`AI request: ${prompt.substring(0, 50)}...`);
}

function logAIResponse(summary) {
    addActivityLog(`AI response: ${summary}...`);
}

function logProviderPipelineStep(provider, step, details) {
    addActivityLog(`${getProviderLabel(provider)} ${step}: ${String(details).substring(0, 120)}`);
}

function logAIError(message) {
    addActivityLog(`AI error: ${String(message).substring(0, 150)}`);
}

function logAIFileUpdate(fileName, action, success, detail) {
    const status = success ? "OK" : "FAILED";
    const msg = detail
        ? `File ${status}: ${action} ${fileName} — ${detail}`
        : `File ${status}: ${action} ${fileName}`;
    addActivityLog(msg);
}

function logAIParseResult(success, summary) {
    addActivityLog(`AI parse ${success ? "OK" : "FAILED"}: ${String(summary).substring(0, 100)}`);
}

function logWorkflowStep(step, details) {
    addActivityLog(`Workflow ${step}: ${String(details).substring(0, 140)}`);
}

function logBranchSwitch(branch) {
    addActivityLog(`Switched branch to ${branch}`);
}

function logPullRequestCreated(title, number) {
    addActivityLog(`Created PR #${number}: ${title}`);
}

loadActivityLogs();
