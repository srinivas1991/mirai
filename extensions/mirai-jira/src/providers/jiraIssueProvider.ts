import * as vscode from 'vscode';
import { JiraApiService, JiraIssue, JiraProject, JiraSprint } from '../services/jiraApiService';
import { GitService, GitBranch, GitCommit, GitHubPR } from '../services/gitService';

export class JiraIssueProvider implements vscode.TreeDataProvider<JiraTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<JiraTreeItem | undefined | null | void> = new vscode.EventEmitter<JiraTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<JiraTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private issues: JiraIssue[] = [];
	private projects: JiraProject[] = [];
	private activeFilters: Set<string> = new Set();
	private gitService: GitService;

	constructor(private jiraApi: JiraApiService) {
		this.gitService = new GitService();
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}



	getTreeItem(element: JiraTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: JiraTreeItem): Promise<JiraTreeItem[]> {
		if (!this.jiraApi.isConfigured()) {
			return [];
		}

		try {
			if (!element) {
				// Root level - show different view modes
				const viewMode = vscode.workspace.getConfiguration('mirai-jira').get<string>('viewMode') || 'byProjectHierarchy';

				switch (viewMode) {
					case 'byProjectHierarchy':
						return this.getProjectNodes();
					case 'bySprint':
						return this.getSprintNodes();
					case 'byStatus':
						return this.getStatusNodes();
					default:
						return this.getProjectNodes();
				}
			} else if (element.contextValue === 'project') {
				// Show epics for this project
				const projectItem = element as JiraProjectItem;
				return this.getEpicsForProject(projectItem.projectKey);
			} else if (element.contextValue === 'project-sprint') {
				// Show sprints for this project
				const projectSprintItem = element as JiraProjectSprintItem;
				return projectSprintItem.sprintItems;
			} else if (element.contextValue === 'epic') {
				// Show stories for this epic
				const epicItem = element as JiraEpicItem;
				return this.getStoriesForEpic(epicItem.epicKey);
			} else if (element.contextValue === 'story') {
				// Show subtasks for this story
				const storyItem = element as JiraStoryItem;
				return this.getSubtasksForStory(storyItem.storyKey);
			} else if (element.contextValue === 'sprint') {
				// Show status groups for this sprint
				const sprintItem = element as JiraSprintItem;
				return this.getStatusesForSprint(sprintItem.sprintId);
			} else if (element.contextValue === 'sprint-status') {
				// Show issues with this status in this sprint
				const statusItem = element as JiraSprintStatusItem;
				return this.getIssuesForSprintStatus(statusItem.sprintId, statusItem.statusName);
			} else if (element.contextValue === 'status') {
				// Show issues with this status
				const statusItem = element as JiraStatusItem;
				const statusIssues = this.issues.filter(issue => issue.fields.status?.name === statusItem.statusName);
				return statusIssues.map(issue => new JiraIssueItem(issue, this.gitService));
			} else if (element.contextValue === 'issue') {
				// Show Git integration for this issue
				const issueItem = element as JiraIssueItem;
				return this.getGitItemsForIssue(issueItem.issue.key);
			}

			return [];
		} catch (error) {
			console.error('Error getting Jira tree children:', error);
			vscode.window.showErrorMessage(`Failed to load Jira issues: ${error}`);
			return [];
		}
	}

	private async getProjectNodes(): Promise<JiraTreeItem[]> {
		await this.loadData();

		const projectsWithIssues = this.projects.filter(project =>
			this.issues.some(issue => issue.fields.project.key === project.key)
		);

		return projectsWithIssues.map(project => {
			const issueCount = this.issues.filter(issue => issue.fields.project.key === project.key).length;
			return new JiraProjectItem(project, issueCount);
		});
	}


	private async getStatusNodes(): Promise<JiraTreeItem[]> {
		await this.loadData();

		const statusGroups = new Map<string, number>();
		this.issues.forEach(issue => {
			const status = issue.fields.status.name;
			statusGroups.set(status, (statusGroups.get(status) || 0) + 1);
		});

		return Array.from(statusGroups.entries()).map(([status, count]) =>
			new JiraStatusItem(status, count)
		);
	}

	private async loadData(): Promise<void> {
		try {
			const maxIssues = vscode.workspace.getConfiguration('mirai-jira').get<number>('maxIssues') || 50;

			// Load issues and projects in parallel
			const [issuesResponse, projects] = await Promise.all([
				this.jiraApi.getIssues(undefined, maxIssues),
				this.jiraApi.getProjects()
			]);

			this.issues = issuesResponse.issues;
			this.projects = projects;
		} catch (error) {
			console.error('Failed to load Jira data:', error);
			this.issues = [];
			this.projects = [];
			throw error;
		}
	}

	async searchIssues(query: string): Promise<void> {
		try {
			const searchResponse = await this.jiraApi.searchIssues(query);
			this.issues = searchResponse.issues;
			this.refresh();
		} catch (error) {
			vscode.window.showErrorMessage(`Search failed: ${error}`);
		}
	}

	async filterByAssignee(assignee: string): Promise<void> {
		try {
			const jql = assignee === 'currentUser'
				? 'assignee = currentUser() ORDER BY updated DESC'
				: `assignee = "${assignee}" ORDER BY updated DESC`;

			const response = await this.jiraApi.getIssues(jql);
			this.issues = response.issues;
			this.refresh();
		} catch (error) {
			vscode.window.showErrorMessage(`Filter failed: ${error}`);
		}
	}

	async filterByStatus(status: string): Promise<void> {
		try {
			const jql = `status = "${status}" AND (assignee = currentUser() OR reporter = currentUser()) ORDER BY updated DESC`;
			const response = await this.jiraApi.getIssues(jql);
			this.issues = response.issues;
			this.refresh();
		} catch (error) {
			vscode.window.showErrorMessage(`Filter failed: ${error}`);
		}
	}

	// Hierarchy methods for Project → Epic → Story → Subtask
	private getEpicsForProject(projectKey: string): JiraTreeItem[] {
		const epics = this.getFilteredIssues().filter(issue =>
			issue.fields.project?.key === projectKey &&
			issue.fields.issuetype?.name?.toLowerCase() === 'epic'
		);

		if (epics.length === 0) {
			// If no epics, show stories directly
			const stories = this.getFilteredIssues().filter(issue =>
				issue.fields.project?.key === projectKey &&
				issue.fields.issuetype?.name?.toLowerCase() === 'story'
			);
			return stories.map(story => new JiraStoryItem(story));
		}

		return epics.map(epic => new JiraEpicItem(epic));
	}

	private getStoriesForEpic(epicKey: string): JiraTreeItem[] {
		const stories = this.getFilteredIssues().filter(issue =>
			issue.fields.parent?.key === epicKey ||
			(issue.fields.customfield_10014 === epicKey && issue.fields.issuetype?.name?.toLowerCase() === 'story')
		);
		return stories.map(story => new JiraStoryItem(story));
	}

	private getSubtasksForStory(storyKey: string): JiraTreeItem[] {
		const subtasks = this.getFilteredIssues().filter(issue =>
			issue.fields.parent?.key === storyKey
		);
		return subtasks.map(subtask => new JiraIssueItem(subtask, this.gitService));
	}


	// Sprint methods
	private async getSprintNodes(): Promise<JiraTreeItem[]> {
		try {
			console.log('[Jira Debug] Fetching sprints grouped by starred projects...');

			// Fetch sprints organized by project
			const sprintsByProject = await this.jiraApi.getSprintsByProject(10);
			console.log(`[Jira Debug] Found sprints for ${sprintsByProject.size} projects`);

			if (sprintsByProject.size === 0) {
				console.log('[Jira Debug] No sprints found, falling back to issue-based sprint detection');
				return this.getSprintNodesFromIssues();
			}

			// Load projects and issues to count how many issues are in each sprint
			await this.loadData();
			// For sprint view, we want to count ALL issues in sprints, not just user-assigned ones
			const allIssues = this.issues; // Use all issues, not filtered ones

			// Create project nodes with their sprint children
			const projectNodes: JiraTreeItem[] = [];

			for (const project of this.projects) {
				const projectSprints = sprintsByProject.get(project.key) || [];

				// Skip projects with no sprints
				if (projectSprints.length === 0) {
					continue;
				}

				// Count total issues across all sprints in this project
				let totalProjectSprintIssues = 0;
				const sprintItems: JiraTreeItem[] = [];

				for (const sprint of projectSprints) {
					// Count issues in this sprint
					const issuesInSprint = allIssues.filter(issue => {
						const issueSprintId = this.getIssueSprintId(issue);
						return issueSprintId === sprint.id.toString();
					});

					totalProjectSprintIssues += issuesInSprint.length;

					// Add state indicator to sprint name
					const stateIcon = sprint.state === 'active' ? '🏃' : sprint.state === 'closed' ? '✅' : '📅';
					const sprintName = `${stateIcon} ${sprint.name}`;

					sprintItems.push(new JiraSprintItem(
						sprint.id.toString(),
						sprintName,
						issuesInSprint.length
					));
				}

				// Create a project node that will contain sprints
				projectNodes.push(new JiraProjectSprintItem(
					project,
					projectSprints.length,
					totalProjectSprintIssues,
					sprintItems
				));
			}

			console.log(`[Jira Debug] Created ${projectNodes.length} starred project nodes with sprints`);
			return projectNodes;

		} catch (error) {
			console.log('[Jira Debug] Failed to fetch sprints from API, falling back to issue-based detection:', error);
			return this.getSprintNodesFromIssues();
		}
	}

	// Fallback method that uses the old approach of extracting sprints from issues
	private async getSprintNodesFromIssues(): Promise<JiraTreeItem[]> {
		await this.loadData();
		const sprints = new Map<string, { name: string, id: string, issues: JiraIssue[] }>();

		console.log('[Jira Debug] Checking sprint data for', this.getFilteredIssues().length, 'issues');

		this.getFilteredIssues().forEach(issue => {
			// Try different possible sprint field structures
			let sprint = issue.fields.sprint;

			// Sometimes sprint is an array, take the latest active sprint
			if (Array.isArray(sprint) && sprint.length > 0) {
				sprint = sprint[sprint.length - 1]; // Get the most recent sprint
			}

			// Handle custom field variations for sprint
			if (!sprint) {
				// Try common sprint custom fields
				const sprintFields = [
					'customfield_10020', // Common Sprint field
					'customfield_10010', // Another common Sprint field
					'customfield_10016'  // Another variation
				];

				for (const fieldName of sprintFields) {
					const customField = (issue.fields as any)[fieldName];
					if (customField) {
						if (Array.isArray(customField) && customField.length > 0) {
							sprint = customField[customField.length - 1];
						} else {
							sprint = customField;
						}
						break;
					}
				}
			}

			if (sprint && !Array.isArray(sprint)) {
				const sprintId = sprint.id?.toString() || sprint.name || 'unknown';
				const sprintName = sprint.name || `Sprint ${sprintId}`;

				if (!sprints.has(sprintId)) {
					sprints.set(sprintId, { name: sprintName, id: sprintId, issues: [] });
				}
				sprints.get(sprintId)!.issues.push(issue);
			} else {
				// Add issues without sprints to a "No Sprint" group
				const noSprintId = 'no-sprint';
				if (!sprints.has(noSprintId)) {
					sprints.set(noSprintId, { name: 'No Sprint', id: noSprintId, issues: [] });
				}
				sprints.get(noSprintId)!.issues.push(issue);
			}
		});

		console.log('[Jira Debug] Found sprints from issues:', Array.from(sprints.keys()));

		return Array.from(sprints.values()).map(sprint =>
			new JiraSprintItem(sprint.id, sprint.name, sprint.issues.length)
		);
	}

	private getStatusesForSprint(sprintId: string): JiraTreeItem[] {
		const sprintIssues = this.getFilteredIssues().filter(issue => {
			if (sprintId === 'no-sprint') {
				return !this.getIssueSprintId(issue);
			}
			return this.getIssueSprintId(issue) === sprintId;
		});

		const statusGroups = new Map<string, number>();
		sprintIssues.forEach(issue => {
			const status = issue.fields.status?.name || 'Unknown';
			statusGroups.set(status, (statusGroups.get(status) || 0) + 1);
		});

		return Array.from(statusGroups.entries()).map(([status, count]) =>
			new JiraSprintStatusItem(sprintId, status, count)
		);
	}

	private getIssuesForSprintStatus(sprintId: string, statusName: string): JiraTreeItem[] {
		const issues = this.getFilteredIssues().filter(issue => {
			const issueSprintId = this.getIssueSprintId(issue);
			if (sprintId === 'no-sprint') {
				return !issueSprintId && issue.fields.status?.name === statusName;
			}
			return issueSprintId === sprintId && issue.fields.status?.name === statusName;
		});
		return issues.map(issue => new JiraIssueItem(issue, this.gitService));
	}

	// Helper method to extract sprint ID from various possible field locations
	private getIssueSprintId(issue: JiraIssue): string | null {
		// Try the standard sprint field first
		let sprint = issue.fields.sprint;

		// Sometimes sprint is an array, take the latest active sprint
		if (Array.isArray(sprint) && sprint.length > 0) {
			sprint = sprint[sprint.length - 1];
		}

		// Handle custom field variations for sprint
		if (!sprint) {
			const sprintFields = [
				'customfield_10020', // Common Sprint field
				'customfield_10010', // Another common Sprint field
				'customfield_10016'  // Another variation
			];

			for (const fieldName of sprintFields) {
				const customField = (issue.fields as any)[fieldName];
				if (customField) {
					if (Array.isArray(customField) && customField.length > 0) {
						sprint = customField[customField.length - 1];
					} else {
						sprint = customField;
					}
					break;
				}
			}
		}

		return (sprint && !Array.isArray(sprint)) ? (sprint.id?.toString() || sprint.name || null) : null;
	}

	// Filter methods
	private getFilteredIssues(): JiraIssue[] {
		let filtered = [...this.issues];

		if (this.activeFilters.has('assignedToMe')) {
			// For now, we'll use a more practical approach - filter by JQL later
			// This is a placeholder that will be improved when we have user context
			filtered = filtered.filter(issue =>
				issue.fields.assignee?.displayName // Just filter to assigned issues for now
			);
		}

		if (this.activeFilters.has('recentlyUpdated')) {
			const threeDaysAgo = new Date();
			threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
			filtered = filtered.filter(issue =>
				new Date(issue.fields.updated) > threeDaysAgo
			);
		}

		if (this.activeFilters.has('bugsOnly')) {
			filtered = filtered.filter(issue =>
				issue.fields.issuetype?.name?.toLowerCase().includes('bug')
			);
		}

		return filtered;
	}

	// Filter management
	toggleFilter(filterName: string): void {
		if (this.activeFilters.has(filterName)) {
			this.activeFilters.delete(filterName);
		} else {
			this.activeFilters.add(filterName);
		}
		this.refresh();
	}

	clearAllFilters(): void {
		this.activeFilters.clear();
		this.refresh();
	}

	getActiveFilters(): string[] {
		return Array.from(this.activeFilters);
	}

	// Git integration methods
	private async getGitItemsForIssue(ticketKey: string): Promise<JiraTreeItem[]> {
		const gitItems: JiraTreeItem[] = [];

		try {
			// Get branches, commits, and PRs in parallel
			const [branches, commits, prs] = await Promise.all([
				this.gitService.getBranchesForTicket(ticketKey),
				this.gitService.getCommitsForTicket(ticketKey),
				this.gitService.getPRsForTicket(ticketKey)
			]);

			// Add development section header
			if (branches.length > 0 || commits.length > 0 || prs.length > 0) {
				gitItems.push(new GitSectionItem('Development', branches.length + commits.length + prs.length));
			}

			// Add branches
			branches.forEach(branch => {
				gitItems.push(new GitBranchItem(branch, ticketKey));
			});

			// Add PRs
			prs.forEach(pr => {
				gitItems.push(new GitPRItem(pr, ticketKey));
			});

			// Add commits (limit to recent ones)
			commits.slice(0, 5).forEach(commit => {
				gitItems.push(new GitCommitItem(commit, ticketKey));
			});

			// Add quick actions if no branches exist
			if (branches.length === 0) {
				gitItems.push(new GitActionItem('create-branch', `Create branch for ${ticketKey}`, ticketKey));
			}

		} catch (error) {
			console.error('[Git] Error loading Git data:', error);
		}

		return gitItems;
	}

	async createBranchForTicket(ticketKey: string): Promise<void> {
		const branchType = await vscode.window.showQuickPick([
			{ label: 'feature', description: 'Feature branch (feature/ticket-key)' },
			{ label: 'bugfix', description: 'Bug fix branch (bugfix/ticket-key)' },
			{ label: 'hotfix', description: 'Hotfix branch (hotfix/ticket-key)' }
		], {
			placeHolder: 'Select branch type'
		});

		if (branchType) {
			const success = await this.gitService.createBranchForTicket(ticketKey, branchType.label as any);
			if (success) {
				this.refresh();
			}
		}
	}

	async createPRForTicket(ticketKey: string): Promise<void> {
		const issue = this.getIssueByKey(ticketKey);
		if (!issue) {
			vscode.window.showErrorMessage('Issue not found');
			return;
		}

		const title = await vscode.window.showInputBox({
			prompt: 'Enter PR title',
			value: issue.fields.summary,
			placeHolder: 'Brief description of changes'
		});

		if (title) {
			const description = await vscode.window.showInputBox({
				prompt: 'Enter PR description (optional)',
				value: `Fixes ${ticketKey}\n\n${issue.fields.description || ''}`,
				placeHolder: 'Detailed description of changes'
			});

			await this.gitService.createPRForBranch(ticketKey, title, description || '');
			this.refresh();
		}
	}

	getIssueByKey(key: string): JiraIssue | undefined {
		return this.issues.find(issue => issue.key === key);
	}
}

abstract class JiraTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly contextValue: string
	) {
		super(label, collapsibleState);
	}
}

class JiraProjectItem extends JiraTreeItem {
	constructor(
		public readonly project: JiraProject,
		public readonly issueCount: number,
		public readonly projectKey: string = project.key
	) {
		super(
			`${project.key} - ${project.name} (${issueCount})`,
			vscode.TreeItemCollapsibleState.Collapsed,
			'project'
		);

		this.tooltip = `${project.name}\nLead: ${project.lead?.displayName || 'Unassigned'}\nType: ${project.projectTypeKey || 'Unknown'}`;
		this.iconPath = new vscode.ThemeIcon('project');
	}
}

class JiraStatusItem extends JiraTreeItem {
	constructor(
		public readonly statusName: string,
		public readonly issueCount: number
	) {
		super(
			`${statusName} (${issueCount})`,
			vscode.TreeItemCollapsibleState.Collapsed,
			'status'
		);

		this.tooltip = `Issues with status: ${statusName}`;
		this.iconPath = this.getStatusIcon(statusName);
	}

	private getStatusIcon(status: string): vscode.ThemeIcon {
		const lowerStatus = status.toLowerCase();
		if (lowerStatus.includes('done') || lowerStatus.includes('closed') || lowerStatus.includes('resolved')) {
			return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
		} else if (lowerStatus.includes('progress') || lowerStatus.includes('review')) {
			return new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
		} else if (lowerStatus.includes('todo') || lowerStatus.includes('open') || lowerStatus.includes('new')) {
			return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.blue'));
		} else {
			return new vscode.ThemeIcon('circle-filled');
		}
	}
}

class JiraIssueItem extends JiraTreeItem {
	constructor(public readonly issue: JiraIssue, private gitService?: GitService) {
		super(
			`${issue.key}: ${issue.fields.summary}`,
			gitService ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
			'issue'
		);

		this.description = `${issue.fields.issuetype?.name || 'Unknown'} • ${issue.fields.status?.name || 'Unknown'}`;
		this.tooltip = this.buildTooltip();
		this.iconPath = this.getIssueTypeIcon();

		// Add command to open issue details
		this.command = {
			command: 'mirai-jira.viewIssueDetails',
			title: 'View Issue Details',
			arguments: [issue.key]
		};
	}

	private buildTooltip(): vscode.MarkdownString {
		const tooltip = new vscode.MarkdownString();
		tooltip.appendMarkdown(`**${this.issue.key}**: ${this.issue.fields.summary}\n\n`);
		tooltip.appendMarkdown(`**Type**: ${this.issue.fields.issuetype?.name || 'Unknown'}\n`);
		tooltip.appendMarkdown(`**Status**: ${this.issue.fields.status?.name || 'Unknown'}\n`);
		tooltip.appendMarkdown(`**Priority**: ${this.issue.fields.priority?.name || 'None'}\n`);
		tooltip.appendMarkdown(`**Assignee**: ${this.issue.fields.assignee?.displayName || 'Unassigned'}\n`);
		tooltip.appendMarkdown(`**Updated**: ${new Date(this.issue.fields.updated).toLocaleDateString()}\n\n`);

		if (this.issue.fields.description) {
			const desc = this.issue.fields.description.length > 200
				? this.issue.fields.description.substring(0, 200) + '...'
				: this.issue.fields.description;
			tooltip.appendMarkdown(`**Description**: ${desc}`);
		}

		return tooltip;
	}

	private getIssueTypeIcon(): vscode.ThemeIcon {
		const issueType = (this.issue.fields.issuetype?.name || 'unknown').toLowerCase();

		if (issueType.includes('bug')) {
			return new vscode.ThemeIcon('bug', new vscode.ThemeColor('charts.red'));
		} else if (issueType.includes('story')) {
			return new vscode.ThemeIcon('book', new vscode.ThemeColor('charts.green'));
		} else if (issueType.includes('task')) {
			return new vscode.ThemeIcon('checklist', new vscode.ThemeColor('charts.blue'));
		} else if (issueType.includes('epic')) {
			return new vscode.ThemeIcon('milestone', new vscode.ThemeColor('charts.purple'));
		} else {
			return new vscode.ThemeIcon('circle-filled');
		}
	}
}

class JiraEpicItem extends JiraTreeItem {
	constructor(
		public readonly epic: JiraIssue,
		public readonly epicKey: string = epic.key
	) {
		super(
			`🎯 ${epic.key}: ${epic.fields.summary}`,
			vscode.TreeItemCollapsibleState.Collapsed,
			'epic'
		);

		this.description = `Epic • ${epic.fields.status?.name || 'Unknown'}`;
		this.tooltip = `Epic: ${epic.fields.summary}\nStatus: ${epic.fields.status?.name}`;
		this.iconPath = new vscode.ThemeIcon('milestone', new vscode.ThemeColor('charts.purple'));
	}
}

class JiraStoryItem extends JiraTreeItem {
	constructor(
		public readonly story: JiraIssue,
		public readonly storyKey: string = story.key
	) {
		super(
			`📖 ${story.key}: ${story.fields.summary}`,
			vscode.TreeItemCollapsibleState.Collapsed,
			'story'
		);

		this.description = `Story • ${story.fields.status?.name || 'Unknown'}`;
		this.tooltip = `Story: ${story.fields.summary}\nStatus: ${story.fields.status?.name}`;
		this.iconPath = new vscode.ThemeIcon('book', new vscode.ThemeColor('charts.green'));
	}
}

class JiraSprintItem extends JiraTreeItem {
	constructor(
		public readonly sprintId: string,
		public readonly sprintName: string,
		public readonly issueCount: number
	) {
		super(
			`🏃 ${sprintName} (${issueCount})`,
			vscode.TreeItemCollapsibleState.Collapsed,
			'sprint'
		);

		this.tooltip = `Sprint: ${sprintName}\nIssues: ${issueCount}`;
		this.iconPath = new vscode.ThemeIcon('rocket', new vscode.ThemeColor('charts.orange'));
	}
}

class JiraSprintStatusItem extends JiraTreeItem {
	constructor(
		public readonly sprintId: string,
		public readonly statusName: string,
		public readonly issueCount: number
	) {
		super(
			`${statusName} (${issueCount})`,
			vscode.TreeItemCollapsibleState.Collapsed,
			'sprint-status'
		);

		this.tooltip = `Status: ${statusName} in sprint\nIssues: ${issueCount}`;
		this.iconPath = this.getStatusIcon(statusName);
	}

	private getStatusIcon(status: string): vscode.ThemeIcon {
		const lowerStatus = status.toLowerCase();
		if (lowerStatus.includes('done') || lowerStatus.includes('closed') || lowerStatus.includes('resolved')) {
			return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
		} else if (lowerStatus.includes('progress') || lowerStatus.includes('review')) {
			return new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
		} else if (lowerStatus.includes('todo') || lowerStatus.includes('open') || lowerStatus.includes('new')) {
			return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('charts.blue'));
		} else {
			return new vscode.ThemeIcon('circle-filled');
		}
	}
}
// Git integration tree items
class GitSectionItem extends JiraTreeItem {
	constructor(sectionName: string, itemCount: number) {
		super(
			`💻 ${sectionName} (${itemCount})`,
			vscode.TreeItemCollapsibleState.Expanded,
			'git-section'
		);
		this.iconPath = new vscode.ThemeIcon('source-control');
	}
}

class GitBranchItem extends JiraTreeItem {
	constructor(public readonly branch: GitBranch, public readonly ticketKey: string) {
		super(
			`🌿 ${branch.name}${branch.current ? ' (current)' : ''}`,
			vscode.TreeItemCollapsibleState.None,
			'git-branch'
		);

		this.description = branch.lastCommit?.message.substring(0, 50) || '';
		this.tooltip = `Branch: ${branch.name}\nLast commit: ${branch.lastCommit?.message || 'Unknown'}\nAuthor: ${branch.lastCommit?.author || 'Unknown'}`;
		this.iconPath = new vscode.ThemeIcon(
			branch.current ? 'git-branch' : 'source-control',
			branch.current ? new vscode.ThemeColor('charts.green') : undefined
		);

		// Add command to checkout branch
		this.command = {
			command: 'mirai-jira.checkoutBranch',
			title: 'Checkout Branch',
			arguments: [branch.name]
		};
	}
}

class GitPRItem extends JiraTreeItem {
	constructor(public readonly pr: GitHubPR, public readonly ticketKey: string) {
		const statusIcon = pr.state === 'merged' ? '🟣' : pr.state === 'open' ? '🟢' : '🔴';

		super(
			`${statusIcon} #${pr.number}: ${pr.title}`,
			vscode.TreeItemCollapsibleState.None,
			'git-pr'
		);

		const reviewStatus = this.getReviewStatus(pr);

		this.description = `${pr.state} • ${reviewStatus}`;
		this.tooltip = `PR #${pr.number}: ${pr.title}\nState: ${pr.state}\nAuthor: ${pr.author}\nBranch: ${pr.branch}`;
		this.iconPath = new vscode.ThemeIcon('git-pull-request', this.getPRColor(pr.state));

		// Add command to open PR in browser
		this.command = {
			command: 'vscode.open',
			title: 'Open PR',
			arguments: [vscode.Uri.parse(pr.url)]
		};
	}

	private getReviewStatus(pr: GitHubPR): string {
		if (!pr.reviews || pr.reviews.length === 0) return 'No reviews';

		const approved = pr.reviews.filter(r => r.state === 'APPROVED').length;
		const changesRequested = pr.reviews.filter(r => r.state === 'CHANGES_REQUESTED').length;

		if (changesRequested > 0) return `Changes requested`;
		if (approved > 0) return `✅ Approved`;
		return 'Under review';
	}

	private getPRColor(state: string): vscode.ThemeColor | undefined {
		switch (state) {
			case 'merged': return new vscode.ThemeColor('charts.purple');
			case 'open': return new vscode.ThemeColor('charts.green');
			case 'closed': return new vscode.ThemeColor('charts.red');
			default: return undefined;
		}
	}
}

class GitCommitItem extends JiraTreeItem {
	constructor(public readonly commit: GitCommit, public readonly ticketKey: string) {
		super(
			`📝 ${commit.hash}: ${commit.message}`,
			vscode.TreeItemCollapsibleState.None,
			'git-commit'
		);

		this.description = `${commit.author} • ${new Date(commit.date).toLocaleDateString()}`;
		this.tooltip = `Commit: ${commit.hash}\nMessage: ${commit.message}\nAuthor: ${commit.author}\nDate: ${commit.date}\nFiles: ${commit.files.length}`;
		this.iconPath = new vscode.ThemeIcon('git-commit');

		// Add command to show commit diff
		this.command = {
			command: 'git.openChange',
			title: 'Show Commit',
			arguments: [commit.hash]
		};
	}
}

class JiraProjectSprintItem extends JiraTreeItem {
	constructor(
		public readonly project: JiraProject,
		public readonly sprintCount: number,
		public readonly totalIssues: number,
		public readonly sprintItems: JiraTreeItem[]
	) {
		super(
			`⭐ ${project.key} - ${project.name} (${sprintCount} sprints, ${totalIssues} issues)`,
			vscode.TreeItemCollapsibleState.Collapsed,
			'project-sprint'
		);

		this.tooltip = `Starred Project: ${project.name}\nYou have starred this project\nSprints: ${sprintCount}\nTotal Issues: ${totalIssues}`;
		this.iconPath = new vscode.ThemeIcon('star-full', new vscode.ThemeColor('charts.yellow'));
	}
}

class GitActionItem extends JiraTreeItem {
	constructor(
		public readonly actionType: string,
		actionLabel: string,
		public readonly ticketKey: string
	) {
		super(
			actionLabel,
			vscode.TreeItemCollapsibleState.None,
			'git-action'
		);

		this.iconPath = new vscode.ThemeIcon('add', new vscode.ThemeColor('charts.blue'));

		// Add command based on action type
		if (actionType === 'create-branch') {
			this.command = {
				command: 'mirai-jira.createBranch',
				title: 'Create Branch',
				arguments: [ticketKey]
			};
		}
	}
}
