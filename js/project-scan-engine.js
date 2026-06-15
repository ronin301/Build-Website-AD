// ============================================================================
// PROJECT INTELLIGENCE & SCAN ENGINE
// Real project analysis with detailed statistics
// ============================================================================

const SCAN_RESULTS_KEY = 'project_scan_results_v1';

async function performDeepProjectScan(project) {
    if (!project?.id || !project?.name) {
        return { success: false, message: "Invalid project" };
    }

    try {
        console.group("Deep Project Scan");
        const startTime = Date.now();
        
        await validateGitHubConnection();
        const branch = getCurrentGitHubBranch();
        
        // Get all files
        const tree = await listProjectTree(project);
        const files = await getProjectFiles(project);

        // Analyze file structure
        const analysis = {
            timestamp: new Date().toISOString(),
            project: {
                name: project.name,
                githubPath: project.githubPath,
                branch
            },
            statistics: {
                totalFiles: files.length,
                totalFolders: countFolders(tree),
                htmlFiles: 0,
                cssFiles: 0,
                jsFiles: 0,
                jsonFiles: 0,
                imageFiles: 0,
                otherFiles: 0,
                totalSize: 0,
                largestFile: null,
                emptyFiles: []
            },
            filesByType: {},
            dependencies: {
                html: [],
                css: [],
                js: []
            },
            potentialIssues: [],
            suggestions: [],
            structure: buildStructureOverview(tree),
            scanDuration: 0
        };

        // Categorize files
        files.forEach(file => {
            const ext = file.name.includes('.') ? '.' + file.name.split('.').pop().toLowerCase() : 'none';
            analysis.filesByType[ext] = (analysis.filesByType[ext] || 0) + 1;

            const size = file.size || 0;
            analysis.statistics.totalSize += size;

            if (file.name.endsWith('.html')) analysis.statistics.htmlFiles++;
            else if (file.name.endsWith('.css')) analysis.statistics.cssFiles++;
            else if (file.name.endsWith('.js')) analysis.statistics.jsFiles++;
            else if (file.name.endsWith('.json')) analysis.statistics.jsonFiles++;
            else if (/\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(file.name)) analysis.statistics.imageFiles++;
            else analysis.statistics.otherFiles++;

            if (!analysis.statistics.largestFile || size > analysis.statistics.largestFile.size) {
                analysis.statistics.largestFile = { name: file.name, size };
            }

            if (size === 0) {
                analysis.statistics.emptyFiles.push(file.name);
            }
        });

        // Detect dependencies (basic link scanning)
        try {
            const contents = await readProjectFiles(project);
            Object.entries(contents).forEach(([fileName, content]) => {
                if (!content) return;
                const text = String(content).substring(0, 10000); // Limit scan

                if (fileName.endsWith('.html')) {
                    const links = text.match(/(?:href|src)=["']([^"']+)["']/gi) || [];
                    links.forEach(l => analysis.dependencies.html.push(l));
                } else if (fileName.endsWith('.css')) {
                    const imports = text.match(/@import\s+url\(([^)]+)\)|@import\s+["']([^"']+)["']/gi) || [];
                    imports.forEach(i => analysis.dependencies.css.push(i));
                } else if (fileName.endsWith('.js')) {
                    const requires = text.match(/(?:import|require)\s+(?:from\s+)?["']([^"']+)["']/gi) || [];
                    requires.forEach(r => analysis.dependencies.js.push(r));
                }
            });
        } catch (e) {
            console.warn("Dependency detection failed:", e.message);
        }

        // Generate suggestions
        if (analysis.statistics.totalFiles === 0) {
            analysis.potentialIssues.push("Project contains no files");
        }
        if (analysis.statistics.htmlFiles === 0) {
            analysis.potentialIssues.push("No HTML files detected - preview may fail");
        }
        if (analysis.statistics.emptyFiles.length > 0) {
            analysis.potentialIssues.push(`${analysis.statistics.emptyFiles.length} empty files detected`);
        }
        if (analysis.statistics.totalSize > 100 * 1024 * 1024) {
            analysis.suggestions.push("Project is large (>100MB) - consider optimizing assets");
        }

        analysis.suggestions.push(`Found ${analysis.statistics.htmlFiles} HTML, ${analysis.statistics.cssFiles} CSS, ${analysis.statistics.jsFiles} JS files`);

        analysis.scanDuration = Date.now() - startTime;

        // Save results
        const cacheKey = `${SCAN_RESULTS_KEY}_${project.id}`;
        localStorage.setItem(cacheKey, JSON.stringify(analysis));

        console.table([{
            project: project.name,
            files: analysis.statistics.totalFiles,
            folders: analysis.statistics.totalFolders,
            duration: `${analysis.scanDuration}ms`
        }]);

        return { success: true, analysis };
    } catch (error) {
        console.error("Deep scan failed:", error);
        return { success: false, message: error.message };
    } finally {
        console.groupEnd();
    }
}

function countFolders(tree, count = 0) {
    if (!Array.isArray(tree)) return count;
    tree.forEach(node => {
        if (node.type === 'folder') {
            count++;
            count = countFolders(node.children, count);
        }
    });
    return count;
}

function buildStructureOverview(tree, depth = 0, maxDepth = 3) {
    if (depth >= maxDepth) return "...";
    const lines = [];
    (tree || []).slice(0, 10).forEach(node => {
        const indent = "  ".repeat(depth);
        if (node.type === 'folder') {
            lines.push(`${indent}📁 ${node.name}/`);
            lines.push(buildStructureOverview(node.children, depth + 1, maxDepth).split('\n'));
        } else {
            lines.push(`${indent}📄 ${node.name}`);
        }
    });
    return lines.flat().filter(Boolean).join('\n');
}

function getScanResults(projectId) {
    const cacheKey = `${SCAN_RESULTS_KEY}_${projectId}`;
    return parseJsonSafely(localStorage.getItem(cacheKey), null);
}

function formatScanForDisplay(analysis) {
    if (!analysis) return "No scan data available";
    return [
        `PROJECT: ${analysis.project.name}`,
        `Branch: ${analysis.project.branch}`,
        `Scanned: ${new Date(analysis.timestamp).toLocaleString()}`,
        `Duration: ${analysis.scanDuration}ms`,
        ``,
        `STATISTICS:`,
        `  Files: ${analysis.statistics.totalFiles}`,
        `  Folders: ${analysis.statistics.totalFolders}`,
        `  HTML: ${analysis.statistics.htmlFiles}`,
        `  CSS: ${analysis.statistics.cssFiles}`,
        `  JS: ${analysis.statistics.jsFiles}`,
        `  JSON: ${analysis.statistics.jsonFiles}`,
        `  Images: ${analysis.statistics.imageFiles}`,
        `  Total Size: ${formatBytes(analysis.statistics.totalSize)}`,
        analysis.statistics.largestFile ? `  Largest: ${analysis.statistics.largestFile.name} (${formatBytes(analysis.statistics.largestFile.size)})` : "",
        ``,
        ...(analysis.potentialIssues.length ? [`POTENTIAL ISSUES:`, ...analysis.potentialIssues.map(i => `  ⚠️  ${i}`)] : []),
        ``,
        ...(analysis.suggestions.length ? [`SUGGESTIONS:`, ...analysis.suggestions.map(s => `  ✓ ${s}`)] : [])
    ].filter(Boolean).join('\n');
}
