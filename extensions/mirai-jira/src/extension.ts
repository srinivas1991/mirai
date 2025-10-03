import * as vscode from 'vscode';
import { JiraApiService } from './services/jiraApiService';
import { JiraIssueProvider } from './providers/jiraIssueProvider';
import { ConnectionsWebviewProvider } from './providers/connectionsWebviewProvider';
import { JiraChatService } from './services/jiraChatService';
import { JiraOAuthService } from './services/jiraOAuthService';
import { GitService } from './services/gitService';
import { JiraRepoDiscoveryService } from './services/jiraRepoDiscoveryService';

export function activate(context: vscode.ExtensionContext) {
	console.log('🚀 Mirai Jira extension is now active! - BUILD VERSION: 2024-09-24-22:10');
	console.log('🔧 Extension features: Jira Issues, Sprint Analysis, Git Integration, AI Features');
	console.log('🔐 Uses system-wide Mirai authentication (just like GitHub/Microsoft auth)');
	console.log('📦 Extension path:', context.extensionPath);

	// Initialize services
	const jiraApi = new JiraApiService();
	const jiraChatService = new JiraChatService(jiraApi);
	const jiraRepoDiscovery = new JiraRepoDiscoveryService(jiraApi);

	// Initialize providers
	const jiraIssueProvider = new JiraIssueProvider(jiraApi);
	const connectionsProvider = new ConnectionsWebviewProvider(context.extensionUri);

	// Set up context keys for conditional views
	const updateContextKeys = async () => {
		const isAuthenticated = jiraApi.isConfigured();
		await vscode.commands.executeCommand('setContext', 'mirai-jira:authenticated', isAuthenticated);
		await vscode.commands.executeCommand('setContext', 'mirai-jira:authenticating', false);

		if (isAuthenticated) {
			try {
				// Check if we have issues to determine if we should show the empty state
				const issuesResponse = await jiraApi.getIssues(undefined, 1);
				await vscode.commands.executeCommand('setContext', 'mirai-jira:noIssues', issuesResponse.total === 0);
			} catch (error) {
				await vscode.commands.executeCommand('setContext', 'mirai-jira:noIssues', true);
			}
		} else {
			await vscode.commands.executeCommand('setContext', 'mirai-jira:noIssues', false);
		}
	};

	// Initialize context
	updateContextKeys();

	// Register tree data provider
	const treeView = vscode.window.createTreeView('mirai-jira-issues', {
		treeDataProvider: jiraIssueProvider,
		showCollapseAll: true
	});

	// Register webview providers
	console.log('📋 [Extension] Registering webview providers...');
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('mirai-connections-view', connectionsProvider, {
			webviewOptions: {
				retainContextWhenHidden: true
			}
		})
	);
	console.log('✅ [Extension] All webview providers registered successfully');

	// Authentication helper function
	async function authenticateWithApiToken() {
		// Prompt for Jira instance URL
		const baseUrl = await vscode.window.showInputBox({
			prompt: 'Enter your Jira instance URL',
			placeHolder: 'https://yourcompany.atlassian.net',
			value: vscode.workspace.getConfiguration('mirai-jira').get<string>('baseUrl') || ''
		});

		if (!baseUrl) {
			return;
		}

		// Prompt for email
		const email = await vscode.window.showInputBox({
			prompt: 'Enter your Jira account email',
			placeHolder: 'your.email@company.com',
			value: vscode.workspace.getConfiguration('mirai-jira').get<string>('email') || ''
		});

		if (!email) {
			return;
		}

		// Prompt for API token
		const apiToken = await vscode.window.showInputBox({
			prompt: 'Enter your Jira API token',
			placeHolder: 'Generate at https://id.atlassian.com/manage-profile/security/api-tokens',
			password: true
		});

		if (!apiToken) {
			return;
		}

		// Save configuration
		const config = vscode.workspace.getConfiguration('mirai-jira');
		await config.update('baseUrl', baseUrl, vscode.ConfigurationTarget.Global);
		await config.update('email', email, vscode.ConfigurationTarget.Global);
		await config.update('apiToken', apiToken, vscode.ConfigurationTarget.Global);

		// Test connection
		const isConnected = await jiraApi.testConnection();
		if (isConnected) {
			vscode.window.showInformationMessage('Successfully connected to Jira!');
			await updateContextKeys();
			jiraIssueProvider.refresh();
		} else {
			vscode.window.showErrorMessage('Failed to connect to Jira. Please check your credentials.');
			// Clear invalid credentials
			await config.update('baseUrl', '', vscode.ConfigurationTarget.Global);
			await config.update('email', '', vscode.ConfigurationTarget.Global);
			await config.update('apiToken', '', vscode.ConfigurationTarget.Global);
		}
	}

	// Register commands
	const commands = [
		vscode.commands.registerCommand('mirai-jira.authenticateWithToken', async () => {
			try {
				// Directly call the authentication logic here
				await authenticateWithApiToken();
			} catch (error) {
				vscode.window.showErrorMessage(`Authentication failed: ${error}`);
			}
		}),

		vscode.commands.registerCommand('mirai-jira.authenticateWithOAuth', async () => {
			try {
				const oauthService = new JiraOAuthService();

				if (!oauthService.isConfigured()) {
					const action = await vscode.window.showWarningMessage(
						'OAuth is not configured. Use API token authentication instead?',
						'Use API Token',
						'Learn More'
					);

					if (action === 'Use API Token') {
						await vscode.commands.executeCommand('mirai-jira.authenticateWithToken');
						return;
					} else if (action === 'Learn More') {
						vscode.env.openExternal(vscode.Uri.parse('https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/'));
						return;
					}
					return;
				}

				await vscode.commands.executeCommand('setContext', 'mirai-jira:authenticating', true);

				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: 'Authenticating with Jira...',
					cancellable: false
				}, async (progress) => {
					progress.report({ message: 'Opening browser for authentication...' });

					try {
						const tokens = await oauthService.authenticate();

						// Save the OAuth tokens, cloud ID, and site info
						const config = vscode.workspace.getConfiguration('mirai-jira');
						await config.update('oauthAccessToken', tokens.accessToken, vscode.ConfigurationTarget.Global);
						await config.update('oauthRefreshToken', tokens.refreshToken, vscode.ConfigurationTarget.Global);
						await config.update('cloudId', tokens.cloudId, vscode.ConfigurationTarget.Global);
						await config.update('siteUrl', tokens.siteUrl, vscode.ConfigurationTarget.Global);
						await config.update('siteName', tokens.siteName, vscode.ConfigurationTarget.Global);

						// Update context keys
						await updateContextKeys();

						vscode.window.showInformationMessage('🎉 OAuth authentication successful!');

						// Refresh the issue provider
						jiraIssueProvider.refresh();
					} catch (error: any) {
						await vscode.commands.executeCommand('setContext', 'mirai-jira:authenticating', false);
						vscode.window.showErrorMessage(`OAuth authentication failed: ${error.message}`);
					}
				});
			} catch (error) {
				await vscode.commands.executeCommand('setContext', 'mirai-jira:authenticating', false);
				vscode.window.showErrorMessage(`Authentication failed: ${error}`);
			}
		}),

		vscode.commands.registerCommand('mirai-jira.clearToken', async () => {
			jiraApi.clearConfiguration();
			await updateContextKeys();
			jiraIssueProvider.refresh();
			vscode.window.showInformationMessage('Jira token cleared successfully');
		}),

		vscode.commands.registerCommand('mirai-jira.refreshIssues', async () => {
			try {
				jiraIssueProvider.refresh();
				await updateContextKeys();
				vscode.window.showInformationMessage('Issues refreshed successfully');
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to refresh issues: ${error}`);
			}
		}),

		vscode.commands.registerCommand('mirai-jira.createIssue', async () => {
			try {
				if (!jiraApi.isConfigured()) {
					vscode.window.showWarningMessage('Please authenticate with Jira first');
					return;
				}

				// Get project
				const projects = await jiraApi.getProjects();
				const projectItems = projects.map(p => ({
					label: `${p.key} - ${p.name}`,
					description: p.projectTypeKey,
					project: p
				}));

				const selectedProject = await vscode.window.showQuickPick(projectItems, {
					placeHolder: 'Select a project for the new issue'
				});

				if (!selectedProject) {
					return;
				}

				// Get issue type
				const issueTypes = [
					{ label: 'Story', value: 'Story' },
					{ label: 'Task', value: 'Task' },
					{ label: 'Bug', value: 'Bug' },
					{ label: 'Epic', value: 'Epic' }
				];

				const selectedType = await vscode.window.showQuickPick(issueTypes, {
					placeHolder: 'Select issue type'
				});

				if (!selectedType) {
					return;
				}

				// Get summary
				const summary = await vscode.window.showInputBox({
					prompt: 'Enter issue summary',
					placeHolder: 'Brief description of the issue'
				});

				if (!summary) {
					return;
				}

				// Get description (optional)
				const description = await vscode.window.showInputBox({
					prompt: 'Enter issue description (optional)',
					placeHolder: 'Detailed description of the issue'
				});

				// Create the issue
				const newIssue = await jiraApi.createIssue({
					fields: {
						project: { key: selectedProject.project.key },
						summary,
						description: description || '',
						issuetype: { name: selectedType.value }
					}
				});

				const issueUrl = jiraApi.getIssueUrl(newIssue.key);
				const action = await vscode.window.showInformationMessage(
					`Issue ${newIssue.key} created successfully!`,
					'Open in Jira',
					'View Details'
				);

				if (action === 'Open in Jira') {
					vscode.env.openExternal(vscode.Uri.parse(issueUrl));
				} else if (action === 'View Details') {
					await vscode.commands.executeCommand('mirai-jira.viewIssueDetails', newIssue.key);
				}

				// Refresh the tree view
				jiraIssueProvider.refresh();
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to create issue: ${error}`);
			}
		}),

		vscode.commands.registerCommand('mirai-jira.viewIssueDetails', async (issueKey: string) => {
			try {
				const issue = await jiraApi.getIssue(issueKey);
				const assignee = issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned';
				const priority = issue.fields.priority ? issue.fields.priority.name : 'None';

				const panel = vscode.window.createWebviewPanel(
					'jiraIssueDetails',
					`${issue.key}: ${issue.fields.summary}`,
					vscode.ViewColumn.One,
					{
						enableScripts: true
					}
				);

				panel.webview.html = getIssueDetailsHtml(issue, jiraApi.getIssueUrl(issueKey));
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to load issue details: ${error}`);
			}
		}),

		vscode.commands.registerCommand('mirai-jira.sendIssueToChat', async (issueKey: string) => {
			await jiraChatService.sendIssueToChat(issueKey);
		}),

		vscode.commands.registerCommand('mirai-jira.analyzeIssueWithChat', async (issueKey: string) => {
			await jiraChatService.analyzeIssueWithChat(issueKey);
		}),

		vscode.commands.registerCommand('mirai-jira.generateCodeFromIssue', async (issueKey: string) => {
			await jiraChatService.generateCodeFromIssue(issueKey);
		}),

		vscode.commands.registerCommand('mirai-jira.estimateComplexity', async (treeItem?: any) => {
			let issueKey: string;

			// If called from tree view context menu, extract issue key from tree item
			if (treeItem && treeItem.issue && treeItem.issue.key) {
				issueKey = treeItem.issue.key;
			} else if (treeItem && typeof treeItem === 'string') {
				// If called directly with issue key
				issueKey = treeItem;
			} else {
				// If no issue key provided, prompt for one
				const inputKey = await vscode.window.showInputBox({
					prompt: 'Enter a Jira issue key to estimate complexity',
					placeHolder: 'e.g., PROJ-123, AQAAS-7198'
				});

				if (!inputKey) {
					return;
				}
				issueKey = inputKey;
			}

			await jiraChatService.estimateIssueComplexity(issueKey);
		}),

		vscode.commands.registerCommand('mirai-jira.generateTestCases', async (issueKey: string) => {
			await jiraChatService.generateTestCases(issueKey);
		}),

		vscode.commands.registerCommand('mirai-jira.suggestImprovements', async (issueKey: string) => {
			await jiraChatService.suggestImprovements(issueKey);
		}),

		vscode.commands.registerCommand('mirai-jira.searchIssues', async () => {
			const query = await vscode.window.showInputBox({
				prompt: 'Enter search query',
				placeHolder: 'Search issues by text, key, or JQL'
			});

			if (query) {
				await jiraIssueProvider.searchIssues(query);
			}
		}),

		vscode.commands.registerCommand('mirai-jira.filterByAssignee', async () => {
			const options = [
				{ label: 'My Issues', value: 'currentUser' },
				{ label: 'Unassigned', value: 'unassigned' },
				{ label: 'Custom...', value: 'custom' }
			];

			const selected = await vscode.window.showQuickPick(options, {
				placeHolder: 'Filter issues by assignee'
			});

			if (selected) {
				if (selected.value === 'custom') {
					const assignee = await vscode.window.showInputBox({
						prompt: 'Enter assignee email or display name'
					});
					if (assignee) {
						await jiraIssueProvider.filterByAssignee(assignee);
					}
				} else {
					await jiraIssueProvider.filterByAssignee(selected.value);
				}
			}
		}),

		vscode.commands.registerCommand('mirai-jira.filterByStatus', async () => {
			const statuses = [
				'To Do',
				'In Progress',
				'In Review',
				'Done',
				'Closed'
			];

			const selected = await vscode.window.showQuickPick(statuses, {
				placeHolder: 'Filter issues by status'
			});

			if (selected) {
				await jiraIssueProvider.filterByStatus(selected);
			}
		}),

		vscode.commands.registerCommand('mirai-jira.showConfig', async () => {
			const config = vscode.workspace.getConfiguration('mirai-jira');
			const authMethod = jiraApi.getAuthMethod();

			let configInfo = `**Current Jira Configuration:**\n\n`;
			configInfo += `**Auth Method:** ${authMethod}\n\n`;

			if (authMethod === 'oauth') {
				const siteName = config.get<string>('siteName');
				const siteUrl = config.get<string>('siteUrl');
				const cloudId = config.get<string>('cloudId');
				const oauthToken = config.get<string>('oauthAccessToken');
				configInfo += `**Jira Instance:** ${siteName || 'Not set'}\n`;
				configInfo += `**Site URL:** ${siteUrl || 'Not set'}\n`;
				configInfo += `**Cloud ID:** ${cloudId || 'Not set'}\n`;
				if (oauthToken) {
					// Show first 20 and last 10 characters for debugging
					const tokenPreview = oauthToken.length > 30
						? `${oauthToken.substring(0, 20)}...${oauthToken.substring(oauthToken.length - 10)}`
						: oauthToken;
					configInfo += `**Access Token:** ${tokenPreview}\n`;
				}
			} else if (authMethod === 'token') {
				const baseUrl = config.get<string>('baseUrl');
				const email = config.get<string>('email');
				configInfo += `**Base URL:** ${baseUrl || 'Not set'}\n`;
				configInfo += `**Email:** ${email || 'Not set'}\n`;
			} else {
				configInfo += `No authentication configured.\n`;
			}

			vscode.window.showInformationMessage(configInfo);
		}),

		vscode.commands.registerCommand('mirai-jira.toggleViewMode', async () => {
			const config = vscode.workspace.getConfiguration('mirai-jira');
			const currentMode = config.get<string>('viewMode') || 'byProjectHierarchy';

			const modes = ['byProjectHierarchy', 'bySprint', 'byStatus'];
			const currentIndex = modes.indexOf(currentMode);
			const newMode = modes[(currentIndex + 1) % modes.length];

			await config.update('viewMode', newMode, vscode.ConfigurationTarget.Workspace);

			const modeNames = {
				'byProjectHierarchy': 'Project → Epic → Story → Subtask',
				'bySprint': 'Sprint → Status → Issues',
				'byStatus': 'Status → Issues'
			};

			vscode.window.showInformationMessage(`View mode: ${modeNames[newMode as keyof typeof modeNames]}`);
			jiraIssueProvider.refresh();
		}),

		vscode.commands.registerCommand('mirai-jira.filterAssignedToMe', () => {
			jiraIssueProvider.toggleFilter('assignedToMe');
			const isActive = jiraIssueProvider.getActiveFilters().includes('assignedToMe');
			vscode.window.showInformationMessage(`Filter "Assigned to Me": ${isActive ? 'ON' : 'OFF'}`);
		}),

		vscode.commands.registerCommand('mirai-jira.filterRecentlyUpdated', () => {
			jiraIssueProvider.toggleFilter('recentlyUpdated');
			const isActive = jiraIssueProvider.getActiveFilters().includes('recentlyUpdated');
			vscode.window.showInformationMessage(`Filter "Recently Updated": ${isActive ? 'ON' : 'OFF'}`);
		}),

		vscode.commands.registerCommand('mirai-jira.filterBugsOnly', () => {
			jiraIssueProvider.toggleFilter('bugsOnly');
			const isActive = jiraIssueProvider.getActiveFilters().includes('bugsOnly');
			vscode.window.showInformationMessage(`Filter "Bugs Only": ${isActive ? 'ON' : 'OFF'}`);
		}),

		vscode.commands.registerCommand('mirai-jira.clearFilters', () => {
			jiraIssueProvider.clearAllFilters();
			vscode.window.showInformationMessage('All filters cleared');
		}),

		vscode.commands.registerCommand('mirai-jira.createBranch', async (ticketKey: string) => {
			await jiraIssueProvider.createBranchForTicket(ticketKey);
		}),

		vscode.commands.registerCommand('mirai-jira.createPR', async (ticketKey: string) => {
			await jiraIssueProvider.createPRForTicket(ticketKey);
		}),

		vscode.commands.registerCommand('mirai-jira.checkoutBranch', async (branchName: string) => {
			try {
				const { exec } = require('child_process');
				const { promisify } = require('util');
				const execAsync = promisify(exec);

				const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
				if (!workspaceFolder) {
					vscode.window.showErrorMessage('No workspace folder found');
					return;
				}

				const workingDir = workspaceFolder.uri.fsPath;
				await execAsync(`git checkout ${branchName}`, { cwd: workingDir });

				// Refresh VS Code's git view
				await vscode.commands.executeCommand('git.refresh');

				vscode.window.showInformationMessage(`Switched to branch: ${branchName}`);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to checkout branch: ${error}`);
			}
		}),

		vscode.commands.registerCommand('mirai-jira.showCurrentBranch', async () => {
			try {
				const gitService = new GitService();
				const currentBranch = await gitService.getCurrentBranch();
				vscode.window.showInformationMessage(`Current branch: ${currentBranch}`);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to get current branch: ${error}`);
			}
		}),

		vscode.commands.registerCommand('mirai-jira.configureGitHubToken', async () => {
			const token = await vscode.window.showInputBox({
				prompt: 'Enter your GitHub Personal Access Token',
				placeHolder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
				password: true,
				ignoreFocusOut: true,
				validateInput: (value) => {
					if (!value) {
						return 'Token is required';
					}
					if (!value.startsWith('ghp_') && !value.startsWith('github_pat_')) {
						return 'Invalid GitHub token format';
					}
					return null;
				}
			});

			if (token) {
				const config = vscode.workspace.getConfiguration('mirai-jira');
				await config.update('githubToken', token, vscode.ConfigurationTarget.Global);
				vscode.window.showInformationMessage('GitHub token configured successfully!');

				// Refresh connections view if it's open
				if (connectionsProvider) {
					connectionsProvider.refresh();
				}
			}
		}),


		vscode.commands.registerCommand('mirai-jira.analyzeSpecificSprint', async (sprintItem: any) => {
			console.log('[Jira Debug] Executing analyzeSpecificSprint command with:', sprintItem);
			try {
				if (sprintItem && sprintItem.sprintId && sprintItem.sprintName) {
					console.log(`[Jira Debug] Analyzing sprint: ${sprintItem.sprintName} (ID: ${sprintItem.sprintId})`);
					await jiraChatService.analyzeSpecificSprint(sprintItem.sprintId, sprintItem.sprintName);
					console.log('[Jira Debug] Sprint analysis completed successfully');
				} else {
					console.error('[Jira Debug] Invalid sprint item:', sprintItem);
					vscode.window.showErrorMessage('Invalid sprint selected for analysis');
				}
			} catch (error) {
				console.error('[Jira Debug] Sprint analysis failed:', error);
				vscode.window.showErrorMessage(`Sprint analysis failed: ${error}`);
			}
		}),

		vscode.commands.registerCommand('mirai-connections.openConnectionsView', async () => {
			await vscode.commands.executeCommand('mirai-connections-view.focus');
		}),

		vscode.commands.registerCommand('mirai-jira.listChatCommands', async () => {
			const chatCommands = [
				'workbench.action.chat.open',
				'workbench.action.chat.newChat',
				'workbench.panel.chat.view.copilot.focus',
				'workbench.action.openChat',
				'chat.action.focus',
				'workbench.action.chat.startChat',
				'workbench.panel.chat.view.copilot.newChat',
				'workbench.view.chat'
			];

			const availableCommands: string[] = [];
			const unavailableCommands: string[] = [];

			for (const command of chatCommands) {
				try {
					const result = await vscode.commands.getCommands(true);
					if (result.includes(command)) {
						availableCommands.push(command);
					} else {
						unavailableCommands.push(command);
					}
				} catch {
					unavailableCommands.push(command);
				}
			}

			const message = `**Available Chat Commands:**\n${availableCommands.join('\n')}\n\n**Unavailable Chat Commands:**\n${unavailableCommands.join('\n')}`;
			console.log('[Jira Debug] Chat Commands Report:\n', message);
			vscode.window.showInformationMessage(`Found ${availableCommands.length} available chat commands. Check console for details.`);
		}),

		// Discuss Issue with AI
		vscode.commands.registerCommand('mirai-jira.discussIssueWithAI', async (treeItem?: any) => {
			let issueKey: string;

			// If called from tree view context menu, extract issue key from tree item
			if (treeItem && treeItem.issue && treeItem.issue.key) {
				issueKey = treeItem.issue.key;
			} else if (treeItem && typeof treeItem === 'string') {
				// If called directly with issue key
				issueKey = treeItem;
			} else {
				// If no issue key provided, prompt for one
				const inputKey = await vscode.window.showInputBox({
					prompt: 'Enter a Jira issue key to discuss with AI',
					placeHolder: 'e.g., PROJ-123, AQAAS-7198'
				});

				if (!inputKey) {
					return;
				}
				issueKey = inputKey;
			}

			await jiraChatService.sendIssueToChat(issueKey);
		}),

		// 🔍 Discover Repositories for Ticket (AI-Powered)
		vscode.commands.registerCommand('mirai-jira.discoverReposForTicket', async (treeItem?: any) => {
			let issueKey: string;

			// If called from tree view context menu, extract issue key from tree item
			if (treeItem && treeItem.issue && treeItem.issue.key) {
				issueKey = treeItem.issue.key;
			} else if (treeItem && typeof treeItem === 'string') {
				// If called directly with issue key
				issueKey = treeItem;
			} else {
				// If no issue key provided, prompt for one
				const inputKey = await vscode.window.showInputBox({
					prompt: 'Enter a Jira issue key to discover repositories',
					placeHolder: 'e.g., PROJ-123, TEAM-456',
					validateInput: (value) => {
						if (!value) {
							return 'Issue key is required';
						}
						if (!value.match(/^[A-Z]+-\d+$/i)) {
							return 'Invalid issue key format. Expected format: PROJ-123';
						}
						return undefined;
					}
				});

				if (!inputKey) {
					return;
				}
				issueKey = inputKey.toUpperCase();
			}

			console.log(`🔍 [RepoDiscovery] Starting discovery for ticket: ${issueKey}`);
			await jiraRepoDiscovery.discoverReposForTicket(issueKey);
		})
	];

	// Register all commands
	commands.forEach(command => context.subscriptions.push(command));

	// Watch for tree selection changes
	treeView.onDidChangeSelection(async (e) => {
		if (e.selection.length > 0) {
			const selectedItem = e.selection[0];
			if (selectedItem.contextValue === 'issue') {
				// Auto-show issue details when selected
				// This could be made configurable
			}
		}
	});

	// Auto-refresh on startup if configured
	if (jiraApi.isConfigured() && vscode.workspace.getConfiguration('mirai-jira').get<boolean>('autoRefresh')) {
		setTimeout(() => {
			jiraIssueProvider.refresh();
		}, 1000);
	}
}

function extractTextFromDescription(description: any): string {
	if (typeof description === 'string') {
		return description;
	}

	if (typeof description === 'object' && description !== null) {
		// Handle Atlassian Document Format (ADF)
		if (description.content && Array.isArray(description.content)) {
			return extractTextFromADF(description);
		}

		// Handle other object formats
		if (description.text) {
			return description.text;
		}

		if (description.value) {
			return description.value;
		}

		// Fallback: try to extract any text content
		return JSON.stringify(description).replace(/[{}"\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
	}

	return 'No description available';
}

function extractTextFromADF(adf: any): string {
	if (!adf || !adf.content) {
		return '';
	}

	let text = '';

	function traverse(node: any): void {
		if (node.text) {
			text += node.text;
		}

		if (node.content && Array.isArray(node.content)) {
			node.content.forEach(traverse);
		}

		// Add line breaks for paragraphs
		if (node.type === 'paragraph') {
			text += '\n';
		}
	}

	adf.content.forEach(traverse);

	return text.trim().replace(/\n+/g, '\n');
}

function getIssueDetailsHtml(issue: any, issueUrl: string): string {
	const assignee = issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned';
	const priority = issue.fields.priority ? issue.fields.priority.name : 'None';
	const components = issue.fields.components.map((c: any) => c.name).join(', ') || 'None';
	const labels = issue.fields.labels.join(', ') || 'None';

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${issue.key} Details</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			padding: 20px;
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
		}
		.header {
			border-bottom: 1px solid var(--vscode-panel-border);
			padding-bottom: 10px;
			margin-bottom: 20px;
		}
		.issue-key {
			color: var(--vscode-textLink-foreground);
			font-weight: bold;
		}
		.field {
			margin-bottom: 10px;
		}
		.field-label {
			font-weight: bold;
			color: var(--vscode-foreground);
		}
		.field-value {
			margin-left: 10px;
		}
		.description {
			margin-top: 20px;
			padding: 15px;
			background-color: var(--vscode-textBlockQuote-background);
			border-left: 4px solid var(--vscode-textBlockQuote-border);
		}
		.actions {
			margin-top: 20px;
			padding-top: 20px;
			border-top: 1px solid var(--vscode-panel-border);
		}
		.btn {
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 8px 16px;
			margin-right: 10px;
			cursor: pointer;
			text-decoration: none;
			display: inline-block;
		}
		.btn:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
	</style>
</head>
<body>
	<div class="header">
		<h1><span class="issue-key">${issue.key}</span>: ${issue.fields.summary}</h1>
	</div>

	<div class="field">
		<span class="field-label">Project:</span>
		<span class="field-value">${issue.fields.project.name} (${issue.fields.project.key})</span>
	</div>

	<div class="field">
		<span class="field-label">Type:</span>
		<span class="field-value">${issue.fields.issuetype.name}</span>
	</div>

	<div class="field">
		<span class="field-label">Status:</span>
		<span class="field-value">${issue.fields.status.name}</span>
	</div>

	<div class="field">
		<span class="field-label">Priority:</span>
		<span class="field-value">${priority}</span>
	</div>

	<div class="field">
		<span class="field-label">Assignee:</span>
		<span class="field-value">${assignee}</span>
	</div>

	<div class="field">
		<span class="field-label">Reporter:</span>
		<span class="field-value">${issue.fields.reporter.displayName}</span>
	</div>

	<div class="field">
		<span class="field-label">Components:</span>
		<span class="field-value">${components}</span>
	</div>

	<div class="field">
		<span class="field-label">Labels:</span>
		<span class="field-value">${labels}</span>
	</div>

	<div class="field">
		<span class="field-label">Created:</span>
		<span class="field-value">${new Date(issue.fields.created).toLocaleDateString()}</span>
	</div>

	<div class="field">
		<span class="field-label">Updated:</span>
		<span class="field-value">${new Date(issue.fields.updated).toLocaleDateString()}</span>
	</div>

	${issue.fields.description ? `
	<div class="description">
		<h3>Description</h3>
		<p>${extractTextFromDescription(issue.fields.description)}</p>
	</div>
	` : ''}

	<div class="actions">
		<a href="${issueUrl}" class="btn" target="_blank">Open in Jira</a>
	</div>
</body>
</html>`;
}

export function deactivate() {
	console.log('Mirai Jira extension is now deactivated');
}
