// ============================================================================
// RESIZABLE WORKSPACE PANELS
// VS Code style panel resizing with localStorage persistence
// ============================================================================

const PANEL_SIZES_KEY = 'ui_panel_sizes_v1';
const MIN_EXPLORER_WIDTH = 180;
const MIN_EDITOR_WIDTH = 300;
const MIN_WORKFLOW_WIDTH = 260;
const DRAG_HANDLE_WIDTH = 6;

function getPanelSizes() {
    return parseJsonSafely(localStorage.getItem(PANEL_SIZES_KEY), {
        explorerWidth: 270,
        workflowWidth: 430
    });
}

function savePanelSizes(sizes) {
    localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify(sizes));
}

function initPanelResizing() {
    if (window.innerWidth <= 1024) return; // Disable on mobile/tablet

    const workspaceBody = document.querySelector('.workspace-body');
    if (!workspaceBody) return;

    const sizes = getPanelSizes();
    const sidebar = workspaceBody.querySelector('.sidebar');
    const editor = workspaceBody.querySelector('.editor-panel');
    const rightPanel = workspaceBody.querySelector('.right-panel');

    if (!sidebar || !editor || !rightPanel) return;

    // Apply saved sizes
    sidebar.style.width = `${sizes.explorerWidth}px`;
    rightPanel.style.width = `${sizes.workflowWidth}px`;
    workspaceBody.style.gridTemplateColumns = `${sizes.explorerWidth}px minmax(0, 1fr) ${sizes.workflowWidth}px`;

    // Create left handle (between explorer and editor)
    const leftHandle = document.createElement('div');
    leftHandle.className = 'panel-drag-handle';
    leftHandle.style.cursor = 'col-resize';
    leftHandle.setAttribute('data-handle', 'left');
    leftHandle.setAttribute('role', 'separator');
    leftHandle.setAttribute('tabindex', '0');
    leftHandle.setAttribute('aria-label', 'Resize explorer width');
    sidebar.parentNode.insertBefore(leftHandle, editor);

    // Create right handle (between editor and workflow)
    const rightHandle = document.createElement('div');
    rightHandle.className = 'panel-drag-handle';
    rightHandle.style.cursor = 'col-resize';
    rightHandle.setAttribute('data-handle', 'right');
    rightHandle.setAttribute('role', 'separator');
    rightHandle.setAttribute('tabindex', '0');
    rightHandle.setAttribute('aria-label', 'Resize workflow panel width');
    editor.parentNode.insertBefore(rightHandle, rightPanel);

    let isDragging = false;
    let dragHandle = null;
    let startX = 0;
    let startSizes = { explorer: 0, workflow: 0 };

    function handleMouseDown(e) {
        if (e.button !== 0) return;
        isDragging = true;
        dragHandle = e.target.dataset.handle;
        startX = e.clientX;
        startSizes = {
            explorer: sidebar.offsetWidth,
            workflow: rightPanel.offsetWidth
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    function handleMouseMove(e) {
        if (!isDragging || !dragHandle) return;

        const delta = e.clientX - startX;

        if (dragHandle === 'left') {
            let newExplorerWidth = Math.max(MIN_EXPLORER_WIDTH, startSizes.explorer + delta);
            const editorContainer = document.querySelector('.workspace-body');
            const maxAllowed = editorContainer.offsetWidth - MIN_EDITOR_WIDTH - startSizes.workflow - (DRAG_HANDLE_WIDTH * 2);
            newExplorerWidth = Math.min(newExplorerWidth, maxAllowed);

            sidebar.style.width = `${newExplorerWidth}px`;
            sizes.explorerWidth = newExplorerWidth;
        } else if (dragHandle === 'right') {
            let newWorkflowWidth = Math.max(MIN_WORKFLOW_WIDTH, startSizes.workflow - delta);
            const editorContainer = document.querySelector('.workspace-body');
            const maxAllowed = editorContainer.offsetWidth - MIN_EDITOR_WIDTH - sizes.explorerWidth - (DRAG_HANDLE_WIDTH * 2);
            newWorkflowWidth = Math.min(newWorkflowWidth, maxAllowed);

            rightPanel.style.width = `${newWorkflowWidth}px`;
            sizes.workflowWidth = newWorkflowWidth;
        }

        // Update grid layout
        workspaceBody.style.gridTemplateColumns = `${sizes.explorerWidth}px minmax(0, 1fr) ${sizes.workflowWidth}px`;
    }

    function handleMouseUp() {
        if (isDragging) {
            savePanelSizes(sizes);
        }
        isDragging = false;
        dragHandle = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }

    leftHandle.addEventListener('mousedown', handleMouseDown);
    rightHandle.addEventListener('mousedown', handleMouseDown);

    // Keyboard support for accessibility (arrow keys)
    function handleKeyResize(e) {
        const step = 16; // pixels per arrow press
        const handle = e.target.dataset.handle;
        if (!handle) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            const dir = e.key === 'ArrowLeft' ? -1 : 1;
            if (handle === 'left') {
                let newExplorer = Math.max(MIN_EXPLORER_WIDTH, sidebar.offsetWidth + (dir * step));
                const maxAllowed = workspaceBody.offsetWidth - MIN_EDITOR_WIDTH - rightPanel.offsetWidth - (DRAG_HANDLE_WIDTH * 2);
                newExplorer = Math.min(newExplorer, maxAllowed);
                sidebar.style.width = `${newExplorer}px`;
                sizes.explorerWidth = newExplorer;
            } else if (handle === 'right') {
                let newWorkflow = Math.max(MIN_WORKFLOW_WIDTH, rightPanel.offsetWidth - (dir * step));
                const maxAllowed = workspaceBody.offsetWidth - MIN_EDITOR_WIDTH - sidebar.offsetWidth - (DRAG_HANDLE_WIDTH * 2);
                newWorkflow = Math.min(newWorkflow, maxAllowed);
                rightPanel.style.width = `${newWorkflow}px`;
                sizes.workflowWidth = newWorkflow;
            }
            workspaceBody.style.gridTemplateColumns = `${sizes.explorerWidth}px minmax(0, 1fr) ${sizes.workflowWidth}px`;
            savePanelSizes(sizes);
        }
    }

    leftHandle.addEventListener('keydown', handleKeyResize);
    rightHandle.addEventListener('keydown', handleKeyResize);

    // Re-layout on window resize
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 1024) return;
        const saved = getPanelSizes();
        workspaceBody.style.gridTemplateColumns = `${saved.explorerWidth}px minmax(0, 1fr) ${saved.workflowWidth}px`;
    });
}
