# PHASE 2 - TECHNICAL IMPLEMENTATION GUIDE
## Smart Project Scanner Engine - Developer Reference

**Last Updated**: 2026-06-14  
**For Phase**: Phase 2 & Beyond  
**Audience**: Developers, Architects, AI Agent Designers  

---

## TABLE OF CONTENTS

1. [System Overview](#system-overview)
2. [Architecture Design](#architecture-design)
3. [Component Reference](#component-reference)
4. [Data Flow](#data-flow)
5. [API Reference](#api-reference)
6. [Integration Points](#integration-points)
7. [Cache Strategy](#cache-strategy)
8. [Error Handling](#error-handling)
9. [Performance Optimization](#performance-optimization)
10. [Future Extensions](#future-extensions)

---

## SYSTEM OVERVIEW

### Purpose
The Smart Project Scanner provides intelligent project indexing, hierarchical folder mapping, and efficient caching to support AI agent operations and future project analysis features.

### Key Features
1. **Multi-Level Indexing**: Files, folders, and project-wide statistics
2. **Smart Caching**: 1-hour TTL prevents unnecessary GitHub API calls
3. **Project Memory**: Persistent data structure for AI agent integration
4. **Hierarchical Structure**: Complete folder tree with parent-child relationships
5. **Extensible Design**: New file types can be added without code changes
6. **Activity Integration**: Automatic logging of all scan events

### Design Principles
- **Defensive Programming**: All functions validate inputs
- **Graceful Degradation**: Fallback to basic scan if smart scanner unavailable
- **Persistent Storage**: Critical data stored in localStorage
- **Minimal API Usage**: Cache-first strategy reduces GitHub calls
- **AI-Ready**: Memory structure designed for AI agent consumption

---

## ARCHITECTURE DESIGN

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Project Manager                     │
│            (orchestrates all project ops)           │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
        ┌─────────────────────────────────┐
        │   scanProject(project)          │
        │   (entry point)                 │
        └────────────┬────────────────────┘
                     │
                     ▼
        ┌─────────────────────────────────┐
        │  smartScanProject(project)      │
        │  (main orchestrator)            │
        └────────┬───────────────┬────────┘
                 │               │
         ┌───────▼──────┐   ┌────▼────────────┐
         │ Check Cache  │   │ Full Scan Path  │
         │              │   │                 │
         │ isCacheValid │   ├─ listProjectTree│
         │ loadCache    │   ├─ getProjectFiles│
         └──────┬───────┘   └────┬────────────┘
                │                │
                │          ┌─────▼──────────────┐
                │          │  Build Indexes     │
                │          │                    │
                │          ├─ buildFileIndex    │
                │          ├─ buildFolderIndex  │
                │          ├─ buildProjectIndex │
                │          └─ buildSummary      │
                │                │
                │          ┌─────▼──────────────┐
                │          │  Store Results     │
                │          │                    │
                │          ├─ saveScanCache     │
                │          ├─ saveProjectMemory │
                │          ├─ updateWorkspace   │
                │          └─ logActivity       │
                │                │
                └────────┬───────┘
                         │
                    ┌────▼──────────┐
                    │  Return Data   │
                    │                │
                    ├─ files array   │
                    ├─ tree          │
                    ├─ summary       │
                    └─ projectMemory │
```

### Data Layer Structure

```
Project Memory (localStorage)
├── fileIndex
│   └── filename → file metadata
├── folderIndex
│   └── folderpath → folder metadata
├── projectIndex
│   └── statistics aggregated
├── summary
│   └── human-readable report
└── scanTime
    └── timestamp of scan

Scan Cache (localStorage)
├── timestamp
├── data (project memory copy)
└── version

Workspace State (memory + localStorage)
├── projectMemory (from cache if available)
├── fileTree
├── scanResult
└── other workspace data
```

---

## COMPONENT REFERENCE

### 1. File Index Component

**Purpose**: Create searchable metadata for all project files

**Function**: `buildFileIndex(files)`

**Input**:
```javascript
files = [
  { name: "index.html", path: "index.html", size: 2048, sha: "abc123" },
  { name: "style.css", path: "css/style.css", size: 1024, sha: "def456" }
]
```

**Output**:
```javascript
{
  "index.html": {
    name: "index.html",
    path: "index.html",
    extension: ".html",
    type: "markup",        // determined by FILE_TYPE_REGISTRY
    size: 2048,
    sha: "abc123",
    scanTime: "2026-06-14T20:42:37Z"
  },
  "css/style.css": {
    name: "style.css",
    path: "css/style.css",
    extension: ".css",
    type: "style",
    size: 1024,
    sha: "def456",
    scanTime: "2026-06-14T20:42:37Z"
  }
}
```

**Algorithm**:
1. Validate input is array
2. For each file:
   - Extract file name
   - Determine extension
   - Look up file type in registry
   - Store metadata keyed by path
3. Return indexed object

**Edge Cases Handled**:
- Empty array → empty object
- null/undefined → empty object
- Files without extensions → type: "other"
- Null file objects → skipped

---

### 2. Folder Index Component

**Purpose**: Build hierarchical folder structure with parent-child relationships

**Function**: `buildFolderIndex(tree)`

**Input**:
```javascript
tree = [
  { path: "css/style.css", name: "style.css" },
  { path: "js/app.js", name: "app.js" },
  { path: "js/utils.js", name: "utils.js" }
]
```

**Output**:
```javascript
{
  "css": {
    name: "css",
    path: "css",
    parentPath: null,
    childFolders: [],
    childFiles: ["style.css"],
    totalChildren: 1,
    scanTime: "2026-06-14T20:42:37Z"
  },
  "js": {
    name: "js",
    path: "js",
    parentPath: null,
    childFolders: [],
    childFiles: ["app.js", "utils.js"],
    totalChildren: 2,
    scanTime: "2026-06-14T20:42:37Z"
  }
}
```

**Algorithm**:
1. Extract all folder paths from file paths
2. For each folder path:
   - Determine parent folder
   - Find all child files (direct children)
   - Find all child folders (direct children)
   - Store in index
3. Return folder index

**Edge Cases Handled**:
- Root level files → not indexed as folders
- Deep nesting → all levels indexed
- Duplicate folders → deduplicated
- Empty tree → empty object

---

### 3. Project Index Component

**Purpose**: Create project-wide statistics and aggregations

**Function**: `buildProjectIndex(files)`

**Input**:
```javascript
files = [
  { name: "index.html", size: 2048 },
  { name: "style.css", size: 1024 },
  { name: "app.js", size: 51200 }
]
```

**Output**:
```javascript
{
  totalFiles: 3,
  filesByType: {
    markup: 1,
    style: 1,
    script: 1
  },
  filesByExtension: {
    ".html": 1,
    ".css": 1,
    ".js": 1
  },
  totalSize: 54272,
  fileList: [
    { name: "app.js", size: 51200, path: "app.js" },
    { name: "index.html", size: 2048, path: "index.html" },
    { name: "style.css", size: 1024, path: "css/style.css" }
  ],
  scanTime: "2026-06-14T20:42:37Z"
}
```

**Algorithm**:
1. Count total files
2. For each file:
   - Determine type → increment counter
   - Determine extension → increment counter
   - Add to total size
   - Add to file list
3. Sort file list by size descending
4. Limit to top 20 files
5. Return statistics

**Edge Cases Handled**:
- Empty files array → all zeros
- Files without size → treated as 0
- Very large files → numbers handled correctly
- Duplicate extensions → properly aggregated

---

### 4. Project Summary Component

**Purpose**: Create human-readable project summary for display

**Function**: `buildProjectSummary(project, projectIndex, folderIndex)`

**Input**:
```javascript
project = { name: "my-project", id: "123" }
projectIndex = { /* statistics */ }
folderIndex = { /* folder structure */ }
```

**Output**:
```javascript
{
  projectName: "my-project",
  totalFiles: 120,
  totalFolders: 18,
  fileTypes: { markup: 12, style: 8, script: 75 },
  fileExtensions: { ".html": 12, ".css": 8, ".js": 75 },
  largestFiles: [
    { name: "bundle.js", size: 512000 },
    { name: "vendor.js", size: 256000 }
  ],
  totalSize: "5.2 MB",
  lastScanned: "6/14/2026, 8:42:37 PM",
  scanTime: "2026-06-14T20:42:37Z"
}
```

**Algorithm**:
1. Extract project name
2. Get file/folder counts
3. Get file type breakdown
4. Get largest files (top 5)
5. Format total size with formatBytes()
6. Format last scan time with toLocaleString()
7. Include ISO scan time
8. Return summary object

---

### 5. Scan Cache Component

**Purpose**: Store and retrieve scan results to avoid unnecessary GitHub API calls

**Key Functions**:

#### saveScanCache(projectId, scanData)
```javascript
// Saves project memory to localStorage with timestamp
saveScanCache("123", projectMemory)
// Stores: { projectId, timestamp, data, version }

// Returns: boolean (success)
```

#### loadScanCache(projectId)
```javascript
// Retrieves cached project memory if valid
const cached = loadScanCache("123")
// Returns: project memory object or null

// Returns null if:
// - Cache doesn't exist
// - Cache is expired
// - Cache is corrupted
```

#### isCacheValid(cache)
```javascript
// Checks if cache is still valid (< 1 hour old)
if (isCacheValid(cache)) {
  // Cache is fresh, use it
}

// Returns: boolean
// Valid if: age < CACHE_TTL (3600000ms)
```

#### clearScanCache(projectId)
```javascript
// Removes cache for specific project
clearScanCache("123")

// Returns: boolean (success)
```

#### invalidateProjectCache(projectId)
```javascript
// Alias for clearScanCache
// Used when project is updated
invalidateProjectCache("123")

// Returns: boolean (success)
```

#### invalidateAllCaches()
```javascript
// Removes all project caches
const count = invalidateAllCaches()
// Returns: number of caches cleared
```

**Cache Entry Structure**:
```javascript
{
  projectId: "1718379757000",
  timestamp: 1718379757000,           // Date.now()
  data: { /* full projectMemory */ },
  version: 1
}
```

**Cache Validation Logic**:
```javascript
function isCacheValid(cache) {
  if (!cache || typeof cache !== "object") return false;
  if (!cache.timestamp || typeof cache.timestamp !== "number") return false;
  
  const age = Date.now() - cache.timestamp;
  return age < CACHE_TTL;  // 1 hour = 3600000ms
}
```

---

### 6. Project Memory Component

**Purpose**: Persistent storage of complete scan data for AI agent integration

**Functions**:

#### saveProjectMemory(projectId, memory)
```javascript
// Saves project memory to localStorage
saveProjectMemory("123", projectMemory)

// Returns: boolean (success)
```

#### loadProjectMemory(projectId)
```javascript
// Retrieves project memory from cache
const memory = loadProjectMemory("123")

// Returns: project memory object or null
```

#### clearProjectMemory(projectId)
```javascript
// Removes project memory from cache
clearProjectMemory("123")

// Returns: boolean (success)
```

#### exportProjectMemoryForDisplay(projectMemory)
```javascript
// Creates curated memory for UI display
const display = exportProjectMemoryForDisplay(memory)

// Returns: {
//   projectName,
//   fileCount,
//   folderCount,
//   fileTypes,
//   largestFile,
//   lastScanned
// }
```

**Project Memory Structure**:
```javascript
{
  projectId: "1718379757000",
  projectName: "my-project",
  fileIndex: {
    /* { path: file metadata } */
  },
  folderIndex: {
    /* { path: folder metadata } */
  },
  projectIndex: {
    /* statistics */
  },
  summary: {
    /* human readable */
  },
  scanTime: "2026-06-14T20:42:37Z"
}
```

---

### 7. Query Component

**Purpose**: Search and filter project data for AI agent use

**Functions**:

#### searchProjectFiles(projectMemory, query)
```javascript
const results = searchProjectFiles(memory, "button")
// Returns: [
//   { name: "button.js", path: "components/button.js", ... },
//   { name: "button.css", path: "css/button.css", ... }
// ]

// Returns: array of matching files (max 20)
// Searches by filename (case-insensitive)
// Returns empty array if no matches
```

#### getFilesByType(projectMemory, fileType)
```javascript
const jsFiles = getFilesByType(memory, "js")
// Returns: all JavaScript files in project

// Returns: array of files with matching extension
// Lookup: FILE_TYPE_REGISTRY[fileType].ext
```

#### getFolderContents(projectMemory, folderPath)
```javascript
const contents = getFolderContents(memory, "src")
// Returns: {
//   childFiles: ["index.js", "utils.js"],
//   childFolders: ["components", "services"]
// }

// Returns: folder contents or empty object if not found
```

#### getProjectStatistics(projectMemory)
```javascript
const stats = getProjectStatistics(memory)
// Returns: {
//   totalFiles: 120,
//   totalSize: "5.2 MB",
//   fileTypes: { markup: 12, style: 8, script: 75 },
//   extensions: { ".html": 12, ".css": 8, ".js": 75 }
// }

// Returns: statistics summary or null if error
```

---

## DATA FLOW

### Scan Initiation Flow

```
User clicks "Scan Project"
        ↓
scanProject(project)
        ↓
TYPE: typeof smartScanProject === "function"
   YES → smartScanProject()
   NO  → basicScanProject()
        ↓
smartScanProject(project)
        ↓
VALIDATE: project?.name && project?.id
        ↓
LOG: logProjectScanStarted(project.name)
        ↓
CHECK: loadScanCache(project.id)
   VALID → Return cached memory (< 100ms)
   INVALID → Continue
        ↓
CONNECT: validateGitHubConnection()
        ↓
FETCH: listProjectTree(project)
FETCH: getProjectFiles(project)
        ↓
INDEX: buildFileIndex(files)
INDEX: buildFolderIndex(tree)
INDEX: buildProjectIndex(files)
SUMMARY: buildProjectSummary(project, index, folders)
        ↓
CREATE: projectMemory = {
  projectId, projectName,
  fileIndex, folderIndex, projectIndex, summary
}
        ↓
SAVE: saveScanCache(project.id, projectMemory)
SAVE: saveProjectMemory(project.id, projectMemory)
        ↓
UPDATE: updateWorkspaceState(projectMemory)
SAVE: saveWorkspace()
        ↓
LOG: logProjectScanCompleted(...)
        ↓
RETURN: { success, files, tree, summary, projectMemory }
        ↓
User sees results
```

### Workspace Restoration Flow

```
User opens project
        ↓
restoreWorkspace()
        ↓
LOAD: workspaceState from project
        ↓
IF: workspaceState.projectMemory exists
   YES → Use it
   NO  → Load from cache
        ↓
TRY: loadProjectMemory(project.id)
   SUCCESS → Use loaded memory
   FAILURE → Initialize empty
        ↓
RESTORE: projectMemory in workspaceState
        ↓
Workspace ready for AI agent use
```

---

## API REFERENCE

### Main Function

```javascript
smartScanProject(project)
```

**Parameters**:
- `project` (Object) - Project object with `name` and `id`

**Returns**:
```javascript
{
  success: boolean,
  cached?: boolean,           // true if loaded from cache
  files?: Array,              // raw files from GitHub
  tree?: Array,               // file tree from GitHub
  summary?: Object,           // human-readable summary
  projectMemory?: Object,     // complete indexed data
  message?: string            // error message if failed
}
```

**Throws**: None (all errors caught and returned)

---

### Cache Functions

```javascript
saveScanCache(projectId, scanData) → boolean
loadScanCache(projectId) → Object | null
isCacheValid(cache) → boolean
clearScanCache(projectId) → boolean
invalidateProjectCache(projectId) → boolean
invalidateAllCaches() → number
```

---

### Memory Functions

```javascript
saveProjectMemory(projectId, memory) → boolean
loadProjectMemory(projectId) → Object | null
clearProjectMemory(projectId) → boolean
exportProjectMemoryForDisplay(projectMemory) → Object | null
```

---

### Index Building Functions

```javascript
buildFileIndex(files) → Object
buildFolderIndex(tree) → Object
buildProjectIndex(files) → Object
buildProjectSummary(project, projectIndex, folderIndex) → Object
```

---

### Query Functions

```javascript
searchProjectFiles(projectMemory, query) → Array
getFilesByType(projectMemory, fileType) → Array
getFolderContents(projectMemory, folderPath) → Object
getProjectStatistics(projectMemory) → Object | null
```

---

### Utility Functions

```javascript
formatBytes(bytes) → string
```

**Examples**:
- `formatBytes(0)` → "0 B"
- `formatBytes(1024)` → "1 KB"
- `formatBytes(1048576)` → "1 MB"
- `formatBytes(1073741824)` → "1 GB"

---

## INTEGRATION POINTS

### With project-manager.js

**File**: `js/project-manager.js`

**Integration**:
```javascript
async function scanProject(project) {
    if (typeof smartScanProject === "function") {
        return smartScanProject(project);  // ← Integration point
    }
    // Fallback to basic scan
}
```

**Result**: All project scans now use smart scanner if available

---

### With workspace.js

**File**: `js/workspace.js`

**Integration 1 - State**:
```javascript
let workspaceState = {
    // ... other fields ...
    projectMemory: null  // ← Storage for project memory
};
```

**Integration 2 - Save**:
```javascript
function saveWorkspace() {
    const state = {
        // ... existing fields ...
        projectMemory: workspaceState.projectMemory  // ← Persisted
    };
    updateProject(currentProject.id, { workspaceState: state });
}
```

**Integration 3 - Restore**:
```javascript
async function restoreWorkspace() {
    // ... restore state ...
    
    if (!workspaceState.projectMemory && currentProject.id) {
        const cached = loadProjectMemory(currentProject.id);  // ← Load from cache
        if (cached) {
            workspaceState.projectMemory = cached;
        }
    }
}
```

**Result**: Project memory persists across sessions

---

### With project-reopen.js

**File**: `js/project-reopen.js`

**Integration**:
```javascript
function invalidateProjectCacheOnUpdate(projectId) {
    if (typeof invalidateProjectCache === "function") {
        invalidateProjectCache(projectId);  // ← Cache invalidation
    }
}
```

**Result**: Cache can be invalidated when projects are updated

---

### With activity-log.js

**Integration**:
```javascript
// Called from smartScanProject()
logProjectScanStarted(projectName)
logProjectScanCompleted(projectName, fileCount, folderCount)
logProjectScanCacheLoaded(projectName)
logProjectScanError(projectName, message)
```

**Result**: All scan events automatically logged

---

## CACHE STRATEGY

### Cache Decision Tree

```
Cache Operation
        ↓
Is project valid?
   NO → Return error
   YES → Continue
        ↓
Is cached scan available?
   NO → Perform full scan
   YES → Continue
        ↓
Is cache less than 1 hour old?
   NO → Invalidate, perform full scan
   YES → Use cached scan
        ↓
Return cached results (< 100ms)
```

### Cache Benefits

| Benefit | Impact | Use Case |
|---------|--------|----------|
| Speed | 50x faster (100ms vs 5s) | Fast project reopening |
| API Calls | 0 API calls | Saves GitHub quota |
| Bandwidth | Minimal network use | Works offline |
| UX | Instant feedback | Smooth workflow |

### Cache Limitations

| Limitation | Mitigation | Note |
|-----------|-----------|------|
| 1 hour TTL | Force refresh available | User can manually update |
| Not real-time | Manual invalidation | Use when files changed externally |
| Storage limited | ~100 projects per app | Typical usage pattern |
| Corrupted cache | Auto-recovery | Falls back to full scan |

---

## ERROR HANDLING

### Error Recovery Strategy

All functions follow defensive programming pattern:

```javascript
function safeScanProject(project) {
    // 1. VALIDATE INPUTS
    if (!project?.name || !project?.id) {
        return { success: false, message: "Invalid project" };
    }

    // 2. WRAP IN TRY-CATCH
    try {
        // 3. PERFORM OPERATION
        // 4. VALIDATE RESULTS
        // 5. RETURN SUCCESS
        return { success: true, data: result };
    } catch (error) {
        // 6. CATCH ERRORS
        console.error("Error:", error);
        
        // 7. LOG ERROR
        logProjectScanError(project.name, error.message);
        
        // 8. RETURN FAILURE
        return { success: false, message: error.message };
    }
}
```

### Common Error Scenarios

| Error | Cause | Recovery |
|-------|-------|----------|
| Invalid project | No name/ID | Return error immediately |
| Cache corrupted | Manual edit | Auto-clear, re-scan |
| GitHub connection | No internet | Return error |
| Large project timeout | Network slow | Partial results or retry |
| Storage full | Browser limit | Clear old caches |

---

## PERFORMANCE OPTIMIZATION

### Cache Hit vs Miss

**Cache Hit (< 100ms)**:
1. loadScanCache (< 20ms)
2. JSON.parse (< 10ms)
3. isCacheValid (< 1ms)
4. Return (< 1ms)

**Cache Miss (1-10s)**:
1. GitHub API calls (~500-1000ms)
2. buildFileIndex (~100-500ms)
3. buildFolderIndex (~50-200ms)
4. buildProjectIndex (~50-100ms)
5. buildProjectSummary (~10-50ms)
6. Save operations (~20-50ms)

### Optimization Strategies

1. **Cache First**: Always check cache before full scan
2. **Lazy Load**: Load from cache on workspace restore
3. **Batch Operations**: Combine multiple updates
4. **Limit Results**: Search returns max 20 files
5. **Sorted Lists**: Largest files pre-sorted

---

## FUTURE EXTENSIONS

### Phase 3 Opportunities

1. **Dependency Detection**
   ```javascript
   // Use fileIndex to detect imports
   const deps = detectFileDependencies(projectMemory, "app.js");
   // Returns: ["./utils.js", "./config.js"]
   ```

2. **File Relationships**
   ```javascript
   // Build graph of file connections
   const graph = buildDependencyGraph(projectMemory);
   // Returns: { "app.js": ["utils.js"], "utils.js": ["config.js"] }
   ```

3. **Change Detection**
   ```javascript
   // Compare scans to find changes
   const changes = detectChanges(oldMemory, newMemory);
   // Returns: { added: [], removed: [], modified: [] }
   ```

4. **Affected Files**
   ```javascript
   // Find files affected by changes
   const affected = getAffectedFiles(projectMemory, "utils.js");
   // Returns: ["app.js", "main.js"]
   ```

### Extension Points

The scanner is designed for easy extension:

**Add New File Type**:
```javascript
FILE_TYPE_REGISTRY.py = { ext: ".py", category: "script" };
// Automatically supported in all indexes
```

**Add New Index**:
```javascript
function buildCustomIndex(files) {
    // Create new index using existing data
}
// Add to smartScanProject() orchestration
```

**Add New Query**:
```javascript
function queryProjectByCustom(projectMemory, criteria) {
    // Use existing indexes for custom queries
}
// Makes data available to AI agent
```

---

## TROUBLESHOOTING

### Cache Not Working

1. Check if cache exists:
   ```javascript
   const cache = localStorage.getItem(SCAN_CACHE_KEY_PREFIX + projectId);
   console.log(cache ? "Cache exists" : "Cache missing");
   ```

2. Check cache validity:
   ```javascript
   const cached = loadScanCache(projectId);
   console.log(cached ? "Cache valid" : "Cache expired");
   ```

3. Force invalidate:
   ```javascript
   invalidateProjectCache(projectId);
   ```

### Memory Not Persisting

1. Check if memory saved:
   ```javascript
   const mem = localStorage.getItem(PROJECT_MEMORY_KEY_PREFIX + projectId);
   console.log(mem ? "Memory saved" : "Memory missing");
   ```

2. Check workspace state:
   ```javascript
   console.log("projectMemory:", workspaceState.projectMemory);
   ```

3. Force save:
   ```javascript
   saveProjectMemory(projectId, projectMemory);
   saveWorkspace();
   ```

### Slow Scans

1. Check project size:
   ```javascript
   console.log("Files:", files.length);
   console.log("Folders:", folderIndex.length);
   ```

2. Check cache validity:
   ```javascript
   const cached = loadScanCache(projectId);
   if (cached) console.log("Using cache");
   else console.log("Performing full scan");
   ```

3. Monitor network:
   - Open browser DevTools
   - Check Network tab for GitHub API calls
   - Each call should be < 1s

---

## CONCLUSION

The Smart Project Scanner provides a robust, extensible foundation for project analysis and AI-driven features. Its defensive design, efficient caching, and thoughtful data structures make it ideal for supporting future enhancements while maintaining reliability and performance.

**Key Takeaways**:
- ✅ Multi-level indexing for flexible queries
- ✅ Smart caching for performance
- ✅ Persistent memory for AI agents
- ✅ Defensive error handling
- ✅ Extensible design for future features

---

**Document Version**: 1.0  
**Last Updated**: 2026-06-14  
**For Phase**: 2+  
**Status**: FINAL  

