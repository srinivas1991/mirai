import * as vscode from 'vscode';
import { JiraApiService, JiraIssue } from './jiraApiService';
import axios from 'axios';

export interface GitHubRepository {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	private: boolean;
	html_url: string;
	clone_url: string;
	ssh_url: string;
	updated_at: string;
	language: string | null;
	stargazers_count: number;
	forks_count: number;
	owner: {
		login: string;
		avatar_url: string;
	};
	topics?: string[];
}

export interface RepoMatchResult {
	repo: GitHubRepository;
	relevanceScore: number;
	reasoning: string;
}

export class JiraRepoDiscoveryService {
	private static readonly GITHUB_API_BASE = 'https://api.github.com';

	constructor(private jiraApi: JiraApiService) {
		console.log('🔍 [RepoDiscovery] Service initialized - AI-powered repository matching');
	}

	/**
	 * Get current workspace Git repository info
	 */
	private async getCurrentWorkspaceRepo(): Promise<{ name: string; remoteUrl: string; path: string } | null> {
		try {
			const workspaceFolders = vscode.workspace.workspaceFolders;
			if (!workspaceFolders || workspaceFolders.length === 0) {
				return null;
			}

			// Check the first workspace folder for git
			const workspaceRoot = workspaceFolders[0].uri.fsPath;

			// Get git extension
			const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
			if (!gitExtension) {
				console.log('🔍 [RepoDiscovery] Git extension not available');
				return null;
			}

			const git = gitExtension.getAPI(1);
			if (!git || git.repositories.length === 0) {
				console.log('🔍 [RepoDiscovery] No git repositories in workspace');
				return null;
			}

			// Get the first repository
			const repo = git.repositories[0];
			const remotes = repo.state.remotes;

			if (remotes.length === 0) {
				console.log('🔍 [RepoDiscovery] No git remotes configured');
				return null;
			}

			// Get origin or first remote
			const remote = remotes.find((r: any) => r.name === 'origin') || remotes[0];
			const remoteUrl = remote.fetchUrl || remote.pushUrl;

			if (!remoteUrl) {
				return null;
			}

			// Extract repo name from URL
			// Handles: git@github.com:user/repo.git, https://github.com/user/repo.git
			const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)/);
			const repoName = match ? match[1].replace('.git', '') : null;

			if (!repoName) {
				console.log('🔍 [RepoDiscovery] Remote URL is not a GitHub repository');
				return null;
			}

			console.log(`🔍 [RepoDiscovery] Current workspace repo: ${repoName}`);
			return {
				name: repoName,
				remoteUrl,
				path: workspaceRoot
			};
		} catch (error) {
			console.warn('🔍 [RepoDiscovery] Failed to get workspace repo info:', error);
			return null;
		}
	}

	/**
	 * Main feature: Discover relevant repositories for a Jira ticket using AI
	 */
	async discoverReposForTicket(issueKey: string): Promise<void> {
		try {
			// Show progress
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: `🔍 Discovering repositories for ${issueKey}...`,
				cancellable: false
			}, async (progress) => {
				// Step 0: Check current workspace
				progress.report({ message: 'Checking current workspace...', increment: 10 });
				const currentRepo = await this.getCurrentWorkspaceRepo();

				// Step 1: Fetch Jira ticket details
				progress.report({ message: 'Fetching Jira ticket details...', increment: 20 });
				const issue = await this.jiraApi.getIssue(issueKey);

				// Step 2: Fetch GitHub repositories
				progress.report({ message: 'Loading your GitHub repositories...', increment: 30 });
				const repos = await this.getUserRepositories();

				if (repos.length === 0) {
					vscode.window.showWarningMessage('No GitHub repositories found. Please authenticate with GitHub first.');
					return;
				}

				// Step 3: Use AI to analyze and match
				progress.report({ message: `Analyzing ${repos.length} repositories with AI...`, increment: 30 });
				await this.analyzeAndMatchWithAI(issue, repos, currentRepo);

				progress.report({ message: 'Complete!', increment: 10 });
			});
		} catch (error) {
			if (axios.isAxiosError(error) && error.response?.status === 401) {
				vscode.window.showErrorMessage('GitHub authentication required. Please sign in to GitHub.');
			} else {
				vscode.window.showErrorMessage(`Failed to discover repositories: ${error}`);
			}
		}
	}

	/**
	 * Fetch user's GitHub repositories
	 */
	private async getUserRepositories(): Promise<GitHubRepository[]> {
		try {
			// Get all available GitHub sessions (includes PAT if configured)
			const sessions = await vscode.authentication.getSession('mirai-github', ['repo', 'read:user', 'read:org'], {
				silent: true
			});

			// Prefer PAT if available (it's stored with id 'pat')
			let session = sessions;

			if (!session) {
				const action = await vscode.window.showInformationMessage(
					'GitHub authentication required for repository discovery. You can use OAuth or add a Personal Access Token.',
					'Authenticate with OAuth',
					'Add PAT',
					'Cancel'
				);

				if (action === 'Authenticate with OAuth') {
					session = await vscode.authentication.getSession('mirai-github', ['repo', 'read:user', 'read:org'], {
						createIfNone: true
					});

					if (!session) {
						throw new Error('GitHub authentication failed');
					}
				} else if (action === 'Add PAT') {
					// Trigger the PAT flow
					await vscode.commands.executeCommand('mirai-auth.addGitHubPAT');

					// Try to get session again
					session = await vscode.authentication.getSession('mirai-github', ['repo', 'read:user', 'read:org'], {
						silent: true
					});

					if (!session) {
						vscode.window.showWarningMessage('GitHub PAT not configured. Please try again.');
						return [];
					}
				} else {
					return [];
				}
			}

			console.log(`🔍 [RepoDiscovery] Using GitHub authentication: ${session.account.label}`);
			return await this.fetchRepositories(session.accessToken);
		} catch (error) {
			console.error('Failed to fetch GitHub repositories:', error);
			throw error;
		}
	}

	/**
	 * Fetch repositories from GitHub API
	 */
	private async fetchRepositories(accessToken: string): Promise<GitHubRepository[]> {
		const repos: GitHubRepository[] = [];

		// Fetch user's personal and collaborative repos
		let page = 1;
		const perPage = 100;

		while (page <= 3) { // Limit to first 300 repos for performance
			const response = await axios.get<GitHubRepository[]>(
				`${JiraRepoDiscoveryService.GITHUB_API_BASE}/user/repos`,
				{
					headers: {
						'Authorization': `Bearer ${accessToken}`,
						'Accept': 'application/vnd.github.v3+json',
						'User-Agent': 'Void-Editor-Jira'
					},
					params: {
						per_page: perPage,
						page: page,
						sort: 'updated',
						affiliation: 'owner,collaborator,organization_member'
					}
				}
			);

			if (response.data.length === 0) {
				break;
			}

			repos.push(...response.data);

			if (response.data.length < perPage) {
				break;
			}

			page++;
		}

		// Also fetch organization repos (if permissions allow)
		try {
			const orgsResponse = await axios.get<Array<{ login: string }>>(
				`${JiraRepoDiscoveryService.GITHUB_API_BASE}/user/orgs`,
				{
					headers: {
						'Authorization': `Bearer ${accessToken}`,
						'Accept': 'application/vnd.github.v3+json',
						'User-Agent': 'Void-Editor-Jira'
					}
				}
			);

			console.log(`🔍 [RepoDiscovery] Found ${orgsResponse.data.length} organizations`);

			// Limit to first 3 orgs for performance
			for (const org of orgsResponse.data.slice(0, 3)) {
				try {
					let orgPage = 1;
					while (orgPage <= 2) { // Limit org repos
						const orgReposResponse = await axios.get<GitHubRepository[]>(
							`${JiraRepoDiscoveryService.GITHUB_API_BASE}/orgs/${org.login}/repos`,
							{
								headers: {
									'Authorization': `Bearer ${accessToken}`,
									'Accept': 'application/vnd.github.v3+json',
									'User-Agent': 'Void-Editor-Jira'
								},
								params: {
									per_page: perPage,
									page: orgPage,
									sort: 'updated',
									type: 'all'
								}
							}
						);

						if (orgReposResponse.data.length === 0) {
							break;
						}

						repos.push(...orgReposResponse.data);

						if (orgReposResponse.data.length < perPage) {
							break;
						}

						orgPage++;
					}
					console.log(`🔍 [RepoDiscovery] Fetched repos from organization: ${org.login}`);
				} catch (orgError) {
					// Skip this org if we don't have access (403) or hit rate limit (429)
					if (axios.isAxiosError(orgError)) {
						const status = orgError.response?.status;
						if (status === 403) {
							console.warn(`⚠️ [RepoDiscovery] No access to organization repos for: ${org.login} (403 Forbidden)`);
						} else if (status === 429) {
							console.warn(`⚠️ [RepoDiscovery] Rate limit hit for organization: ${org.login}`);
							break; // Stop fetching more orgs if rate limited
						} else {
							console.warn(`⚠️ [RepoDiscovery] Failed to fetch repos for org ${org.login}:`, orgError.message);
						}
					}
					// Continue to next org
					continue;
				}
			}
		} catch (error) {
			// If we can't even list organizations, that's fine - just use user repos
			if (axios.isAxiosError(error)) {
				const status = error.response?.status;
				if (status === 403) {
					console.warn('⚠️ [RepoDiscovery] No permission to list organizations (requires read:org scope)');
				} else if (status === 401) {
					console.warn('⚠️ [RepoDiscovery] GitHub token is invalid or expired');
				} else {
					console.warn(`⚠️ [RepoDiscovery] Failed to fetch organizations: ${error.message}`);
				}
			}
			// Continue with just user repos
		}

		// Remove duplicates based on repo ID
		const uniqueRepos = Array.from(
			new Map(repos.map(repo => [repo.id, repo])).values()
		);

		console.log(`🔍 [RepoDiscovery] Fetched ${uniqueRepos.length} unique repositories`);

		// Show helpful message if we only got personal repos (no org repos due to permissions)
		if (uniqueRepos.length > 0 && uniqueRepos.length < 50) {
			console.log('💡 [RepoDiscovery] Tip: If you expected more repositories, your GitHub token may need "read:org" scope for organization repos');
		}

		return uniqueRepos;
	}

	/**
	 * Analyze and match repositories using AI
	 */
	private async analyzeAndMatchWithAI(
		issue: JiraIssue,
		repos: GitHubRepository[],
		currentRepo: { name: string; remoteUrl: string; path: string } | null
	): Promise<void> {
		// Build context for AI analysis
		const ticketContext = this.buildTicketContext(issue);
		const repoContext = this.buildRepoContext(repos);

		// Create the AI prompt
		const aiPrompt = this.buildAIMatchingPrompt(ticketContext, repoContext, currentRepo);

		console.log('🤖 [RepoDiscovery] Sending analysis request to AI...');

		try {
			// Send to Void chat for AI analysis
			await vscode.commands.executeCommand('void.openSidebar');
			await vscode.commands.executeCommand('void.sendChatMessage', aiPrompt);

			vscode.window.showInformationMessage(
				`🔍 Repository discovery analysis for ${issue.key} sent to AI chat! Check the AI's recommendations.`,
				'View Chat'
			).then(action => {
				if (action === 'View Chat') {
					vscode.commands.executeCommand('void.openSidebar');
				}
			});
		} catch (commandError) {
			// Fallback: copy to clipboard
			await vscode.env.clipboard.writeText(aiPrompt);
			vscode.window.showInformationMessage(
				`Repository discovery analysis copied to clipboard! Paste it into Mirai chat.`,
				'Open Mirai Chat'
			).then(action => {
				if (action === 'Open Mirai Chat') {
					vscode.commands.executeCommand('void.openSidebar');
				}
			});
		}
	}

	/**
	 * Build ticket context for AI
	 */
	private buildTicketContext(issue: JiraIssue): string {
		const components = issue.fields.components.map(c => c.name).join(', ') || 'None';
		const labels = issue.fields.labels.join(', ') || 'None';
		const priority = issue.fields.priority?.name || 'None';
		const description = this.extractTextFromDescription(issue.fields.description);

		return `**JIRA TICKET: ${issue.key}**
**Summary:** ${issue.fields.summary}
**Project:** ${issue.fields.project.name} (${issue.fields.project.key})
**Issue Type:** ${issue.fields.issuetype.name}
**Status:** ${issue.fields.status.name}
**Priority:** ${priority}
**Components:** ${components}
**Labels:** ${labels}

**Description:**
${description || 'No description provided'}

**Link:** ${this.jiraApi.getIssueUrl(issue.key)}`;
	}

	/**
	 * Build repository context for AI (summarized to avoid token limits)
	 */
	private buildRepoContext(repos: GitHubRepository[]): string {
		// Group repos by language for better organization
		const reposByLanguage: Record<string, GitHubRepository[]> = {};

		repos.forEach(repo => {
			const lang = repo.language || 'Unknown';
			if (!reposByLanguage[lang]) {
				reposByLanguage[lang] = [];
			}
			reposByLanguage[lang].push(repo);
		});

		let context = `**AVAILABLE GITHUB REPOSITORIES (${repos.length} total)**\n\n`;

		// List all repos with key information
		Object.entries(reposByLanguage).forEach(([language, langRepos]) => {
			context += `\n**${language} Repositories (${langRepos.length}):**\n`;
			langRepos.slice(0, 20).forEach(repo => { // Limit per language to avoid token overflow
				const privacy = repo.private ? '🔒' : '🌐';
				const desc = repo.description ? repo.description.substring(0, 100) : 'No description';
				const updated = new Date(repo.updated_at).toLocaleDateString();
				context += `- ${privacy} **${repo.full_name}** - ${desc} | ⭐${repo.stargazers_count} | Updated: ${updated}\n`;
			});
			if (langRepos.length > 20) {
				context += `  ... and ${langRepos.length - 20} more ${language} repositories\n`;
			}
		});

		return context;
	}

	/**
	 * Build AI matching prompt
	 */
	private buildAIMatchingPrompt(
		ticketContext: string,
		repoContext: string,
		currentRepo: { name: string; remoteUrl: string; path: string } | null
	): string {
		const workspaceInfo = currentRepo
			? `\n<current_workspace>
The user is currently working in this repository:
- Repository: ${currentRepo.name}
- Path: ${currentRepo.path}

IMPORTANT: First assess whether the currently open repository "${currentRepo.name}" is appropriate for this Jira ticket.
- If it IS relevant: Explain why and give it a high relevance score
- If it is NOT relevant: Clearly state this and recommend which repository they should switch to
</current_workspace>\n`
			: '';

		return `🔍 **JIRA TICKET-BASED REPOSITORY DISCOVERY REQUEST**

I need your help identifying which GitHub repositories are most relevant for working on this Jira ticket.
${workspaceInfo}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 JIRA TICKET DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${ticketContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📂 GITHUB REPOSITORIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${repoContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 ANALYSIS REQUEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please analyze the Jira ticket and identify the **TOP 5-10 most relevant repositories** for working on this ticket.

${currentRepo ? `\n**🔴 CRITICAL:** First, assess whether the currently open repository "${currentRepo.name}" is appropriate for this ticket. If it IS relevant, explain why and give it a high score. If it is NOT relevant, clearly state this and recommend which repository the user should switch to.\n` : ''}
For each recommended repository, provide:

1. **Repository Name** (full_name)
2. **Relevance Score** (0-100%)
3. **Reasoning** - Why this repo is relevant (consider: name match, description match, components, labels, issue type, technology stack)
4. **Suggested Actions** - What work might be needed in this repo${currentRepo ? '\n5. **Switch Recommendation** - If user needs to switch from current repo, clearly state: "⚠️ SWITCH REQUIRED: You should close the current workspace and open this repository instead"' : ''}

**Scoring Criteria:**
- **90-100%**: Primary repository, direct match with ticket requirements
- **70-89%**: Highly relevant, likely needs changes
- **50-69%**: Moderately relevant, may need updates
- **30-49%**: Possibly relevant, check for dependencies
- **0-29%**: Low relevance, unlikely to need changes

**Analysis Factors to Consider:**
✅ Keyword matching (summary, description, repo name)
✅ Component alignment (Jira components → repo purpose)
✅ Label correlation (Jira labels → repo tags/topics)
✅ Technology stack (languages, frameworks)
✅ Issue type (bug → production repos, feature → feature repos)
✅ Recent activity (recently updated repos more likely)
✅ Repository structure and purpose

**Output Format:**
Please structure your response as:

🏆 **HIGHLY RELEVANT (90-100%)**
- [repo-name] (score%) - reasoning and suggested actions

📌 **RELEVANT (70-89%)**
- [repo-name] (score%) - reasoning

💡 **POSSIBLY RELEVANT (50-69%)**
- [repo-name] (score%) - reasoning

Also provide a brief **summary** explaining the overall repository landscape for this ticket.`;
	}

	/**
	 * Extract text from Jira description (handles ADF format)
	 */
	private extractTextFromDescription(description: any): string {
		if (typeof description === 'string') {
			return description;
		}

		if (typeof description === 'object' && description !== null) {
			// Handle Atlassian Document Format (ADF)
			if (description.content && Array.isArray(description.content)) {
				return this.extractTextFromADF(description);
			}

			if (description.text) {
				return description.text;
			}

			if (description.value) {
				return description.value;
			}

			return JSON.stringify(description).replace(/[{}"\[\]]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 500);
		}

		return 'No description available';
	}

	/**
	 * Extract text from Atlassian Document Format
	 */
	private extractTextFromADF(adf: any): string {
		if (!adf || !adf.content) {
			return '';
		}

		let text = '';

		const traverse = (node: any): void => {
			if (node.text) {
				text += node.text;
			}

			if (node.content && Array.isArray(node.content)) {
				node.content.forEach(traverse);
			}

			if (node.type === 'paragraph' || node.type === 'heading') {
				text += '\n';
			}
		};

		adf.content.forEach(traverse);

		return text.trim();
	}

	/**
	 * Quick action: Clone a repository
	 */
	async cloneRepository(repo: GitHubRepository): Promise<void> {
		const folderUri = await vscode.window.showOpenDialog({
			canSelectFolders: true,
			canSelectFiles: false,
			canSelectMany: false,
			openLabel: 'Select folder to clone into'
		});

		if (!folderUri || folderUri.length === 0) {
			return;
		}

		const parentPath = folderUri[0].fsPath;
		const cloneUrl = repo.clone_url;

		try {
			await vscode.commands.executeCommand('git.clone', cloneUrl, parentPath);
			vscode.window.showInformationMessage(`Repository ${repo.name} cloned successfully!`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to clone repository: ${error}`);
		}
	}
}

