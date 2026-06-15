const PublishService = {
    async preparePublish(project) {
        if (!project?.name) {
            return { success: false, message: "No project selected" };
        }

        await validateGitHubConnection();

        const { contents } = await readProjectFiles(project);
        const entryPoint = detectProjectEntryFile(contents, getWorkspaceState()?.openFile);

        if (!entryPoint) {
            return { success: false, message: "No previewable HTML entry file was found in this project" };
        }

        const sanitizedFiles = Object.fromEntries(
            Object.entries(contents).map(([fileName, fileContent]) => [fileName, sanitizeSecrets(fileContent)])
        );

        return {
            success: true,
            message: "Project ready for GitHub Pages",
            package: {
                projectName: project.name,
                githubPath: project.githubPath,
                files: sanitizedFiles,
                entryPoint
            }
        };
    },

    async publishToGitHubPages(project) {
        const prepared = await this.preparePublish(project);
        if (!prepared.success) return prepared;

        const settings = getGitHubSettings();
        
        // Validate settings are not empty
        if (!settings.repoOwner || !settings.repoName || !settings.baseFolder) {
            return { 
                success: false, 
                message: "GitHub settings incomplete - cannot construct Pages URL" 
            };
        }

        // Sanitize URL components
        const owner = String(settings.repoOwner).trim();
        const repo = String(settings.repoName).trim();
        const folder = String(settings.baseFolder).trim().replace(/\/$/, "");
        const projectName = String(project.name).trim();
        const entryDirectory = getDirectoryPath(prepared.package.entryPoint);

        const pagesUrl = `https://${owner}.github.io/${repo}/${folder}/${projectName}/${entryDirectory ? `${entryDirectory}/` : ""}`;

        return {
            success: true,
            message: "GitHub Pages URL ready",
            url: pagesUrl,
            instructions: [
                "Enable GitHub Pages in repository settings",
                `Set source to branch containing ${folder}/${projectName}/`,
                `Live URL: ${pagesUrl}`
            ]
        };
    }
};
