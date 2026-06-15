// ============================================================================
// SMART PROJECT SCANNER ENGINE
// Phase 2: Intelligent project indexing and caching
// ============================================================================

const SCAN_CACHE_KEY_PREFIX = "project_scan_cache_";
const PROJECT_MEMORY_KEY_PREFIX = "project_memory_";

// File type registry - extensible for future types
const FILE_TYPE_REGISTRY = {
    html: { ext: ".html", category: "markup" },
    css: { ext: ".css", category: "style" },
    js: { ext: ".js", category: "script" },
    json: { ext: ".json", category: "data" },
    md: { ext: ".md", category: "document" },
    txt: { ext: ".txt", category: "document" }
};

// ============================================================================
// FILE INDEX - Create metadata for all project files
// ============================================================================

function buildFileIndex(files) {
    if (!Array.isArray(files)) return {};
    
    const index = {};
    
    files.forEach(file => {
        if (!file || !file.name) return;
        
        const ext = file.name.includes(".") ? "." + file.name.split(".").pop().toLowerCase() : "none";
        const fileType = Object.values(FILE_TYPE_REGISTRY).find(t => t.ext === ext);
        
        index[file.name] = {
            name: file.name,
            path: file.path || file.name,
            extension: ext,
            type: fileType?.category || "other",
            size: file.size || 0,
            sha: file.sha || null,
            scanTime: new Date().toISOString()
        };
    });
    
    return index;
}

// ============================================================================
// FOLDER INDEX - Build hierarchical folder structure
// ============================================================================

function buildFolderIndex(tree, projectPath = "") {
    if (!Array.isArray(tree)) return {};
    
    const index = {};
    let folderCount = 0;
    
    function indexNode(node, parentPath = "") {
        if (!node || !node.name) return;
        
        const nodePath = parentPath ? `${parentPath}/${node.name}` : node.name;
        
        if (node.type === "folder") {
            folderCount++;
            
            const childFolders = node.children?.filter(c => c?.type === "folder").map(c => c.name) || [];
            const childFiles = node.children?.filter(c => c?.type === "file").map(c => c.name) || [];
            
            index[nodePath] = {
                name: node.name,
                path: nodePath,
                parentPath: parentPath || null,
                childFolders,
                childFiles,
                totalChildren: (childFolders.length + childFiles.length),
                scanTime: new Date().toISOString()
            };
            
            if (node.children) {
                node.children.forEach(child => indexNode(child, nodePath));
            }
        }
    }
    
    tree.forEach(node => indexNode(node));
    
    return { folders: index, totalFolders: folderCount };
}

// ============================================================================
// PROJECT INDEX - Aggregate statistics about project files
// ============================================================================

function buildProjectIndex(files) {
    if (!Array.isArray(files)) {
        return {
            totalFiles: 0,
            filesByType: {},
            filesByExtension: {},
            totalSize: 0,
            fileList: [],
            scanTime: new Date().toISOString()
        };
    }
    
    const filesByType = {};
    const filesByExtension = {};
    let totalSize = 0;
    
    files.forEach(file => {
        if (!file || !file.name) return;
        
        totalSize += file.size || 0;
        
        const ext = file.name.includes(".") ? "." + file.name.split(".").pop().toLowerCase() : "none";
        const fileType = Object.values(FILE_TYPE_REGISTRY).find(t => t.ext === ext);
        const category = fileType?.category || "other";
        
        filesByType[category] = (filesByType[category] || 0) + 1;
        filesByExtension[ext] = (filesByExtension[ext] || 0) + 1;
    });
    
    return {
        totalFiles: files.length,
        filesByType,
        filesByExtension,
        totalSize,
        fileList: files.map(f => ({ name: f.name, size: f.size || 0 })),
        scanTime: new Date().toISOString()
    };
}

// ============================================================================
// PROJECT SUMMARY - Generate human-readable scan summary
// ============================================================================

function buildProjectSummary(project, projectIndex, folderIndex) {
    const summary = {
        projectName: project?.name || "Unknown",
        totalFiles: projectIndex?.totalFiles || 0,
        totalFolders: folderIndex?.totalFolders || 0,
        fileTypes: {},
        largestFiles: [],
        lastScanned: new Date().toISOString()
    };
    
    // Count files by type
    if (projectIndex?.filesByType) {
        Object.entries(projectIndex.filesByType).forEach(([type, count]) => {
            summary.fileTypes[type] = count;
        });
    }
    
    // Find largest files
    if (projectIndex?.fileList && Array.isArray(projectIndex.fileList)) {
        summary.largestFiles = projectIndex.fileList
            .sort((a, b) => (b.size || 0) - (a.size || 0))
            .slice(0, 5)
            .map(f => ({ name: f.name, size: f.size || 0 }));
    }
    
    return summary;
}

// ============================================================================
// SCAN CACHE - Store and retrieve cached scans
// ============================================================================

function getScanCacheKey(projectId, branch = getCurrentGitHubBranch()) {
    return `${SCAN_CACHE_KEY_PREFIX}${projectId}_${String(branch || "main").replace(/[^\w.-]/g, "_")}`;
}

function saveScanCache(projectId, branch, scanData) {
    try {
        const cacheKey = getScanCacheKey(projectId, branch);
        const cacheData = {
            projectId,
            branch,
            timestamp: new Date().toISOString(),
            data: scanData,
            version: 1
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        return true;
    } catch (error) {
        console.error("Failed to save scan cache:", error);
        return false;
    }
}

function loadScanCache(projectId, branch = getCurrentGitHubBranch()) {
    try {
        const cacheKey = getScanCacheKey(projectId, branch);
        const cached = localStorage.getItem(cacheKey);
        
        if (!cached) return null;
        
        const cacheData = JSON.parse(cached);
        
        if (cacheData.version !== 1) {
            console.warn("Unsupported cache version:", cacheData.version);
            return null;
        }
        
        return cacheData;
    } catch (error) {
        console.error("Failed to load scan cache:", error);
        return null;
    }
}

function clearScanCache(projectId, branch = getCurrentGitHubBranch()) {
    try {
        const cacheKey = getScanCacheKey(projectId, branch);
        localStorage.removeItem(cacheKey);
        return true;
    } catch (error) {
        console.error("Failed to clear scan cache:", error);
        return false;
    }
}

// ============================================================================
// PROJECT MEMORY - Store all indexing data for AI agent use
// ============================================================================

function getProjectMemoryKey(projectId, branch = getCurrentGitHubBranch()) {
    return `${PROJECT_MEMORY_KEY_PREFIX}${projectId}_${String(branch || "main").replace(/[^\w.-]/g, "_")}`;
}

function saveProjectMemory(projectId, branch, memory) {
    try {
        const key = getProjectMemoryKey(projectId, branch);
        const memoryData = {
            projectId,
            branch,
            timestamp: new Date().toISOString(),
            memory,
            version: 1
        };
        localStorage.setItem(key, JSON.stringify(memoryData));
        return true;
    } catch (error) {
        console.error("Failed to save project memory:", error);
        return false;
    }
}

function loadProjectMemory(projectId, branch = getCurrentGitHubBranch()) {
    try {
        const key = getProjectMemoryKey(projectId, branch);
        const saved = localStorage.getItem(key);
        
        if (!saved) return null;
        
        const memoryData = JSON.parse(saved);
        
        if (memoryData.version !== 1) {
            console.warn("Unsupported memory version:", memoryData.version);
            return null;
        }
        
        return memoryData.memory;
    } catch (error) {
        console.error("Failed to load project memory:", error);
        return null;
    }
}

function clearProjectMemory(projectId, branch = getCurrentGitHubBranch()) {
    try {
        const key = getProjectMemoryKey(projectId, branch);
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error("Failed to clear project memory:", error);
        return false;
    }
}

// ============================================================================
// SMART PROJECT SCANNER - Main scanning engine
// ============================================================================

async function smartScanProject(project, options = {}) {
    const force = options.force === true;

    if (!project?.id || !project?.name) {
        return { success: false, message: "Invalid project" };
    }

    try {
        logProjectScanStarted(project.name);
        await validateGitHubConnection();
        const branch = getCurrentGitHubBranch();

        console.group("Explorer Refresh");
        console.table([{
            project: project.name,
            branch,
            githubPath: project.githubPath || getProjectGitHubPath(project.name),
            force
        }]);

        // Check for cached scan unless forced
        const cached = loadScanCache(project.id, branch);
        if (!force && cached && isCacheValid(cached)) {
            logProjectScanCacheLoaded(project.name);
            
            const cachedData = cached.data || {};
            const memory = loadProjectMemory(project.id, branch) || cachedData.projectMemory || null;
            const tree = Array.isArray(cachedData.tree) ? cachedData.tree : [];
            const summary = cachedData.summary || memory?.summary || null;

            if (memory || tree.length || summary) {
                updateWorkspaceState({
                    fileTree: tree,
                    scanResult: summary,
                    projectMemory: memory
                });
                saveWorkspace();
                return { 
                    success: true, 
                    fromCache: true,
                    tree,
                    summary,
                    memory,
                    message: "Project loaded from cache"
                };
            }
        }

        // Perform full scan
        logProjectScanInProgress(project.name);
        
        const tree = await listProjectTree(project);
        const files = await getProjectFiles(project);

        // Build all indexes
        const fileIndex = buildFileIndex(files);
        const { folders, totalFolders } = buildFolderIndex(tree);
        const projectIndex = buildProjectIndex(files);
        const summary = buildProjectSummary(project, projectIndex, { totalFolders });

        // Create project memory
        const projectMemory = {
            projectId: project.id,
            projectName: project.name,
            branch,
            fileIndex,
            folderIndex: folders,
            projectIndex,
            summary,
            scanTime: new Date().toISOString()
        };

        // Save to cache and memory
        saveScanCache(project.id, branch, {
            tree,
            summary,
            projectMemory
        });
        saveProjectMemory(project.id, branch, projectMemory);

        // Update workspace
        updateWorkspaceState({ 
            fileTree: tree, 
            scanResult: summary,
            projectMemory: projectMemory
        });
        saveWorkspace();

        logProjectScanCompleted(project.name, files.length, totalFolders);
        addActivityLog(`Files indexed: ${files.length}`);
        addActivityLog(`Folders indexed: ${totalFolders}`);

        return {
            success: true,
            fromCache: false,
            tree,
            memory: projectMemory,
            summary
        };
    } catch (error) {
        logProjectScanError(project.name, error.message);
        console.error("Explorer refresh failed:", error);
        return { 
            success: false, 
            message: `Scan failed: ${error.message}`,
            error: error.message
        };
    } finally {
        console.groupEnd();
    }
}

function isCacheValid(cached) {
    if (!cached || !cached.timestamp) return false;
    
    // Cache valid for 1 hour
    const cacheAge = Date.now() - new Date(cached.timestamp).getTime();
    const ONE_HOUR = 60 * 60 * 1000;
    
    return cacheAge < ONE_HOUR;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

function invalidateProjectCache(projectId, branch = getCurrentGitHubBranch()) {
    clearScanCache(projectId, branch);
    clearProjectMemory(projectId, branch);
    addActivityLog(`Scan cache invalidated for ${branch}`);
}

function invalidateAllCaches() {
    const projects = getProjects();
    projects.forEach(p => {
        clearScanCache(p.id);
        clearProjectMemory(p.id);
    });
    addActivityLog("All scan caches cleared");
}

// ============================================================================
// ACTIVITY LOGGING
// ============================================================================

function logProjectScanStarted(projectName) {
    addActivityLog(`Scan started: ${projectName}`);
}

function logProjectScanInProgress(projectName) {
    addActivityLog(`Scanning project: ${projectName}`);
}

function logProjectScanCompleted(projectName, fileCount, folderCount) {
    addActivityLog(`Scan complete: ${projectName} (${fileCount} files, ${folderCount} folders)`);
}

function logProjectScanCacheLoaded(projectName) {
    addActivityLog(`Scan cache loaded: ${projectName}`);
}

function logProjectScanError(projectName, message) {
    addActivityLog(`Scan error: ${projectName} - ${message}`);
}

// ============================================================================
// STATISTICS & REPORTING
// ============================================================================

function getProjectStatistics(projectMemory) {
    if (!projectMemory) return null;
    
    const stats = {
        totalFiles: projectMemory.projectIndex?.totalFiles || 0,
        totalFolders: projectMemory.summary?.totalFolders || 0,
        fileTypes: projectMemory.projectIndex?.filesByType || {},
        extensions: projectMemory.projectIndex?.filesByExtension || {},
        totalSize: projectMemory.projectIndex?.totalSize || 0,
        lastScanned: projectMemory.scanTime
    };
    
    return stats;
}

function formatProjectMemoryForDisplay(memory) {
    if (!memory) return "No project scanned";
    
    const stats = getProjectStatistics(memory);
    const lines = [
        `Project: ${memory.projectName}`,
        `Files: ${stats.totalFiles}`,
        `Folders: ${stats.totalFolders}`,
        `Size: ${formatBytes(stats.totalSize)}`
    ];
    
    if (Object.keys(stats.fileTypes).length > 0) {
        const types = Object.entries(stats.fileTypes)
            .map(([type, count]) => `${type}:${count}`)
            .join(", ");
        lines.push(`Types: ${types}`);
    }
    
    if (memory.summary?.largestFiles?.length > 0) {
        const largest = memory.summary.largestFiles[0];
        lines.push(`Largest: ${largest.name} (${formatBytes(largest.size)})`);
    }
    
    return lines.join("\n");
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
}

// ============================================================================
// SEARCH & QUERY
// ============================================================================

function searchProjectFiles(projectMemory, query) {
    if (!projectMemory || !projectMemory.fileIndex) return [];
    
    const searchTerm = String(query || "").toLowerCase();
    return Object.values(projectMemory.fileIndex)
        .filter(file => file.name.toLowerCase().includes(searchTerm))
        .slice(0, 20);
}

function getFilesByType(projectMemory, fileType) {
    if (!projectMemory || !projectMemory.fileIndex) return [];
    
    const ext = `.${String(fileType || "").toLowerCase()}`;
    return Object.values(projectMemory.fileIndex)
        .filter(file => file.extension === ext);
}

function getFolderContents(projectMemory, folderPath) {
    if (!projectMemory || !projectMemory.folderIndex) return null;
    
    const folder = projectMemory.folderIndex[folderPath];
    if (!folder) return null;
    
    return {
        name: folder.name,
        path: folder.path,
        childFiles: folder.childFiles || [],
        childFolders: folder.childFolders || [],
        totalChildren: folder.totalChildren || 0
    };
}

// ============================================================================
// EXPORT FOR FUTURE AI AGENT USE
// ============================================================================

function exportProjectMemory(projectMemory) {
    if (!projectMemory) return null;
    
    return sanitizeStructuredContent({
        projectId: projectMemory.projectId,
        projectName: projectMemory.projectName,
        stats: getProjectStatistics(projectMemory),
        summary: projectMemory.summary,
        fileIndex: projectMemory.fileIndex,
        folderIndex: projectMemory.folderIndex,
        scanTime: projectMemory.scanTime
    });
}
