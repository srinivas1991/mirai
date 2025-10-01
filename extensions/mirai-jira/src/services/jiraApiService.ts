import * as vscode from 'vscode';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { JiraOAuthService } from './jiraOAuthService';

export interface JiraIssue {
	id: string;
	key: string;
	fields: {
		summary: string;
		description?: string;
		status: {
			name: string;
			statusCategory: {
				key: string;
				colorName: string;
			};
		};
		issuetype: {
			name: string;
			iconUrl: string;
		};
		priority?: {
			name: string;
			iconUrl: string;
		};
		assignee?: {
			displayName: string;
			emailAddress: string;
			accountId: string;
		};
		reporter: {
			displayName: string;
			emailAddress: string;
		};
		created: string;
		updated: string;
		project: {
			key: string;
			name: string;
		};
		labels: string[];
		components: Array<{
			name: string;
		}>;
		parent?: {
			key: string;
			fields: {
				summary: string;
			};
		};
		sprint?: {
			id: number;
			name: string;
			state: string;
		} | Array<{
			id: number;
			name: string;
			state: string;
		}>;
		customfield_10014?: string; // Epic Link field
		customfield_10020?: { id: number; name: string; state: string } | { id: number; name: string; state: string }[]; // Sprint field
		customfield_10010?: { id: number; name: string; state: string } | { id: number; name: string; state: string }[]; // Alternative Sprint field
		customfield_10016?: { id: number; name: string; state: string } | { id: number; name: string; state: string }[]; // Another Sprint field
	};
}

export interface JiraProject {
	id: string;
	key: string;
	name: string;
	projectTypeKey: string;
	lead: {
		displayName: string;
		accountId?: string;
	};
}

export interface JiraUser {
	accountId: string;
	displayName: string;
	emailAddress?: string;
}

export interface JiraSprint {
	id: number;
	name: string;
	state: 'closed' | 'active' | 'future';
	startDate?: string;
	endDate?: string;
	completeDate?: string;
	originBoardId?: number;
	goal?: string;
}

export interface JiraSearchResponse {
	expand: string;
	startAt: number;
	maxResults: number;
	total: number;
	issues: JiraIssue[];
}

export interface JiraProjectsResponse {
	values: JiraProject[];
}

export interface JiraSprintsResponse {
	maxResults: number;
	startAt: number;
	total: number;
	isLast: boolean;
	values: JiraSprint[];
}

export interface JiraCreateIssueRequest {
	fields: {
		project: {
			key: string;
		};
		summary: string;
		description?: string;
		issuetype: {
			name: string;
		};
		priority?: {
			name: string;
		};
		labels?: string[];
		components?: Array<{
			name: string;
		}>;
	};
}

export class JiraApiService {
	private client: AxiosInstance | null = null;
	private config = vscode.workspace.getConfiguration('mirai-jira');
	private oauthService: JiraOAuthService;
	private isRefreshing = false;
	private failedQueue: Array<{ resolve: Function; reject: Function }> = [];

	constructor() {
		this.oauthService = new JiraOAuthService();
		this.setupClient();
		this.watchConfigChanges();
	}

	private watchConfigChanges() {
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('mirai-jira')) {
				this.config = vscode.workspace.getConfiguration('mirai-jira');
				this.setupClient();
			}
		});
	}

	private setupClient() {
		// Refresh config to ensure we have the latest values
		this.config = vscode.workspace.getConfiguration('mirai-jira');

		// Check for OAuth configuration first
		const oauthToken = this.config.get<string>('oauthAccessToken');
		const cloudId = this.config.get<string>('cloudId');

		if (oauthToken && cloudId) {
			// OAuth authentication - Use Atlassian API gateway (confirmed working)
			// OAuth tokens must go through the API gateway, not direct instance URLs
			console.log('[Jira API] Setting up OAuth with Atlassian API gateway');
			console.log('[Jira API] CloudId:', cloudId);
			console.log('[Jira API] Token length:', oauthToken.length);
			console.log('[Jira API] Token prefix:', oauthToken.substring(0, 20) + '...');

			this.client = axios.create({
				baseURL: `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`,
				headers: {
					'Authorization': `Bearer ${oauthToken}`,
					'Accept': 'application/json',
					'Content-Type': 'application/json',
				},
				timeout: 30000,
			});

			// Add response interceptor for automatic token refresh
			this.setupTokenRefreshInterceptor();
			return;
		}

		// Fallback to API token authentication
		const baseUrl = this.config.get<string>('baseUrl');
		const email = this.config.get<string>('email');
		const apiToken = this.config.get<string>('apiToken');

		if (!baseUrl || !email || !apiToken) {
			this.client = null;
			return;
		}

		this.client = axios.create({
			baseURL: `${baseUrl}/rest/api/3`,
			auth: {
				username: email,
				password: apiToken,
			},
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json',
			},
			timeout: 30000,
		});
	}

	private setupTokenRefreshInterceptor() {
		if (!this.client) return;

		// Response interceptor to handle 401 errors and refresh tokens
		this.client.interceptors.response.use(
			(response) => response,
			async (error) => {
				const originalRequest = error.config;

				// Check if this is a 401 error and we haven't already tried to refresh
				if (error.response?.status === 401 && !originalRequest._retry) {
					originalRequest._retry = true;

					console.log('[Jira API] 401 error detected, attempting token refresh...');

					// If we're already refreshing, queue this request
					if (this.isRefreshing) {
						return new Promise((resolve, reject) => {
							this.failedQueue.push({ resolve, reject });
						}).then(() => {
							// Retry with the new token
							const newToken = this.config.get<string>('oauthAccessToken');
							originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
							return this.client!.request(originalRequest);
						});
					}

					this.isRefreshing = true;

					try {
						// Get the refresh token
						const refreshToken = this.config.get<string>('oauthRefreshToken');

						if (!refreshToken) {
							console.error('[Jira API] No refresh token available');
							throw new Error('No refresh token available');
						}

						// Refresh the token
						const { accessToken, refreshToken: newRefreshToken } = await this.oauthService.refreshToken(refreshToken);

						// Update the stored tokens
						await this.config.update('oauthAccessToken', accessToken, vscode.ConfigurationTarget.Global);
						await this.config.update('oauthRefreshToken', newRefreshToken, vscode.ConfigurationTarget.Global);

						console.log('[Jira API] Token refreshed successfully');

						// Update the client's authorization header
						if (this.client) {
							this.client.defaults.headers['Authorization'] = `Bearer ${accessToken}`;
						}

						// Process the failed queue
						this.failedQueue.forEach(({ resolve }) => {
							resolve();
						});
						this.failedQueue = [];

						// Retry the original request with the new token
						originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
						return this.client!.request(originalRequest);

					} catch (refreshError) {
						console.error('[Jira API] Token refresh failed:', refreshError);

						// Process the failed queue with rejections
						this.failedQueue.forEach(({ reject }) => {
							reject(refreshError);
						});
						this.failedQueue = [];

						// Clear the tokens since refresh failed
						await this.config.update('oauthAccessToken', '', vscode.ConfigurationTarget.Global);
						await this.config.update('oauthRefreshToken', '', vscode.ConfigurationTarget.Global);

						// Show user-friendly error message
						vscode.window.showErrorMessage(
							'Jira authentication expired. Please re-authenticate using the OAuth flow.',
							'Re-authenticate'
						).then((selection) => {
							if (selection === 'Re-authenticate') {
								vscode.commands.executeCommand('mirai-jira.authenticateWithOAuth');
							}
						});

						return Promise.reject(refreshError);
					} finally {
						this.isRefreshing = false;
					}
				}

				return Promise.reject(error);
			}
		);
	}

	public isConfigured(): boolean {
		return this.client !== null;
	}

	public async testConnection(): Promise<boolean> {
		if (!this.client) {
			throw new Error('Jira API not configured. Please set your base URL, email, and API token.');
		}

		try {
			const response = await this.client.get('/myself');
			return response.status === 200;
		} catch (error) {
			console.error('Jira connection test failed:', error);
			return false;
		}
	}

	public async getProjects(): Promise<JiraProject[]> {
		if (!this.client) {
			throw new Error('Jira API not configured');
		}

		try {
			const response: AxiosResponse<JiraProject[]> = await this.client.get('/project');
			return response.data;
		} catch (error) {
			console.error('Failed to fetch Jira projects:', error);
			throw new Error(`Failed to fetch projects: ${error}`);
		}
	}

	public async getCurrentUser(): Promise<JiraUser | null> {
		if (!this.client) {
			throw new Error('Jira API not configured');
		}

		try {
			const response: AxiosResponse<JiraUser> = await this.client.get('/myself');
			console.log('[Jira Debug] Current user info:', response.data);
			return response.data;
		} catch (error) {
			console.error('Failed to fetch current user:', error);
			return null;
		}
	}

	public async getStarredProjects(): Promise<JiraProject[]> {
		if (!this.client) {
			throw new Error('Jira API not configured');
		}

		try {
			// Get starred projects using the search endpoint with the starred filter
			const response: AxiosResponse<{ values: JiraProject[] }> = await this.client.get('/project/search?action=browse&expand=description,lead,projectKeys&status=live,archived&properties=starred');
			const projects = response.data.values || [];

			// Alternative approach if the above doesn't work - get user property
			if (projects.length === 0) {
				console.log('[Jira Debug] No starred projects found with search, trying user properties...');

				// Try to get user's starred projects from user properties
				try {
					const userPropsResponse = await this.client.get('/user/properties/jira.starredprojects');
					const starredProjectKeys = userPropsResponse.data?.value?.projectKeys || [];

					if (starredProjectKeys.length > 0) {
						// Get full project details for starred projects
						const allProjects = await this.getProjects();
						const starredProjects = allProjects.filter(project => starredProjectKeys.includes(project.key));
						console.log(`[Jira Debug] Found ${starredProjects.length} starred projects from user properties`);
						return starredProjects;
					}
				} catch (propsError) {
					console.log('[Jira Debug] Could not get starred projects from user properties:', propsError);
				}
			}

			console.log(`[Jira Debug] Found ${projects.length} starred projects from search`);
			return projects;
		} catch (error) {
			console.error('[Jira Debug] Failed to fetch starred projects:', error);

			// Final fallback - get all projects (user can star them to filter next time)
			console.log('[Jira Debug] Falling back to all projects');
			try {
				const allProjects = await this.getProjects();
				console.log(`[Jira Debug] Fallback: returning ${allProjects.length} total projects`);
				return allProjects;
			} catch (fallbackError) {
				console.error('[Jira Debug] Fallback also failed:', fallbackError);
				return [];
			}
		}
	}

	public async getSprints(boardId?: number, maxResults: number = 10): Promise<JiraSprint[]> {
		if (!this.client) {
			throw new Error('Jira API not configured');
		}

		try {
			// Create a separate client for agile API calls
			const agileClient = this.createAgileApiClient();
			if (!agileClient) {
				console.log('[Jira Debug] Could not create agile API client');
				return [];
			}

			// If no board ID is provided, try to get sprints from all boards
			if (!boardId) {
				// First, try to get boards to find sprints
				console.log('[Jira Debug] Trying to fetch boards...');
				const boardsResponse = await agileClient.get('/board');
				const boards = boardsResponse.data.values || [];

				if (boards.length === 0) {
					console.log('[Jira Debug] No boards found');
					return [];
				}

				console.log(`[Jira Debug] Found ${boards.length} boards`);

				// Get sprints from all boards and combine them
				const allSprints: JiraSprint[] = [];
				for (const board of boards.slice(0, 3)) { // Limit to first 3 boards to avoid too many requests
					try {
						console.log(`[Jira Debug] Fetching sprints for board ${board.id} (${board.name})`);
						const sprintResponse: AxiosResponse<JiraSprintsResponse> = await agileClient.get(`/board/${board.id}/sprint?maxResults=${maxResults}`);
						allSprints.push(...sprintResponse.data.values);
					} catch (boardError) {
						console.log(`[Jira Debug] Failed to fetch sprints for board ${board.id}:`, boardError);
						// Continue with other boards
					}
				}

				// Sort by ID (most recent sprints typically have higher IDs) and take the most recent
				return allSprints
					.sort((a, b) => b.id - a.id)
					.slice(0, maxResults);
			}

			// Get sprints for specific board
			const response: AxiosResponse<JiraSprintsResponse> = await agileClient.get(`/board/${boardId}/sprint?maxResults=${maxResults}`);
			return response.data.values.sort((a, b) => b.id - a.id); // Sort by ID descending (most recent first)
		} catch (error: any) {
			console.log('[Jira Debug] Failed to fetch sprints:', error?.response?.status, error?.message);
			// Don't throw error - just return empty array to avoid breaking authentication
			return [];
		}
	}

	public async getSprintsByProject(maxResults: number = 10): Promise<Map<string, JiraSprint[]>> {
		if (!this.client) {
			throw new Error('Jira API not configured');
		}

		console.log('[Jira Debug] Starting getSprintsByProject for starred projects...');

		try {
			// Get starred projects directly
			console.log('[Jira Debug] Fetching starred projects...');

			const starredProjects = await this.getStarredProjects();
			console.log(`[Jira Debug] Found ${starredProjects.length} starred projects`);

			if (starredProjects.length === 0) {
				console.log('[Jira Debug] No starred projects found');
				return new Map();
			}

			// Log starred project names
			starredProjects.forEach(project => {
				console.log(`[Jira Debug] Starred project: ${project.key} - ${project.name}`);
			});

			const sprintsByProject = new Map<string, JiraSprint[]>();

			// For each starred project, get recent sprints using JQL
			for (const project of starredProjects) {
				try {
					console.log(`[Jira Debug] Fetching recent issues for starred project ${project.key} to extract sprints...`);

					// Get recent issues from this project to extract sprint information
					const recentIssuesJQL = `project = "${project.key}" AND sprint is not EMPTY ORDER BY updated DESC`;
					const issuesResponse = await this.getIssues(recentIssuesJQL, 100);

					console.log(`[Jira Debug] Found ${issuesResponse.issues.length} issues with sprints in starred project ${project.key}`);

					// Extract unique sprints from issues
					const sprintMap = new Map<number, JiraSprint>();

					for (const issue of issuesResponse.issues) {
						const sprints = this.extractSprintsFromIssue(issue);
						for (const sprint of sprints) {
							if (!sprintMap.has(sprint.id)) {
								sprintMap.set(sprint.id, sprint);
							}
						}
					}

					// Convert to array and sort by ID (most recent first)
					const projectSprints = Array.from(sprintMap.values())
						.sort((a, b) => b.id - a.id)
						.slice(0, maxResults);

					sprintsByProject.set(project.key, projectSprints);
					console.log(`[Jira Debug] Starred project ${project.key} has ${projectSprints.length} recent sprints`);

				} catch (projectError) {
					console.log(`[Jira Debug] Failed to get sprints for starred project ${project.key}:`, projectError);
					sprintsByProject.set(project.key, []);
				}
			}

			console.log(`[Jira Debug] Successfully fetched sprints for ${sprintsByProject.size} starred projects`);
			return sprintsByProject;

		} catch (error: any) {
			console.error('[Jira Debug] Failed to fetch sprints by starred projects:', error?.response?.status, error?.message, error);
			// Don't throw error - just return empty map
			return new Map();
		}
	}

	private extractSprintsFromIssue(issue: any): JiraSprint[] {
		const sprints: JiraSprint[] = [];

		// Try the standard sprint field
		let sprintData = issue.fields.sprint;

		// If sprint is not found, try custom fields
		if (!sprintData) {
			const sprintFields = ['customfield_10020', 'customfield_10010', 'customfield_10016'];
			for (const fieldName of sprintFields) {
				sprintData = issue.fields[fieldName];
				if (sprintData) break;
			}
		}

		if (!sprintData) return sprints;

		// Handle both single sprint and array of sprints
		const sprintArray = Array.isArray(sprintData) ? sprintData : [sprintData];

		for (const sprint of sprintArray) {
			if (sprint && sprint.id && sprint.name) {
				sprints.push({
					id: sprint.id,
					name: sprint.name,
					state: sprint.state || 'unknown',
					startDate: sprint.startDate,
					endDate: sprint.endDate,
					completeDate: sprint.completeDate,
					originBoardId: sprint.originBoardId,
					goal: sprint.goal
				});
			}
		}

		return sprints;
	}

	private createAgileApiClient(): AxiosInstance | null {
		// Check for OAuth configuration first
		const oauthToken = this.config.get<string>('oauthAccessToken');
		const cloudId = this.config.get<string>('cloudId');

		if (oauthToken && cloudId) {
			// OAuth authentication - Use Atlassian API gateway for agile API
			return axios.create({
				baseURL: `https://api.atlassian.com/ex/jira/${cloudId}/rest/agile/1.0`,
				headers: {
					'Authorization': `Bearer ${oauthToken}`,
					'Accept': 'application/json',
					'Content-Type': 'application/json',
				},
				timeout: 30000,
			});
		}

		// Fallback to API token authentication
		const baseUrl = this.config.get<string>('baseUrl');
		const email = this.config.get<string>('email');
		const apiToken = this.config.get<string>('apiToken');

		if (!baseUrl || !email || !apiToken) {
			return null;
		}

		return axios.create({
			baseURL: `${baseUrl}/rest/agile/1.0`,
			auth: {
				username: email,
				password: apiToken,
			},
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json',
			},
			timeout: 30000,
		});
	}

	public async getIssues(jql?: string, maxResults: number = 50): Promise<JiraSearchResponse> {
		if (!this.client) {
			throw new Error('Jira API not configured');
		}

		const query = jql || 'assignee = currentUser() ORDER BY updated DESC';

		// Add debugging info
		const authMethod = this.getAuthMethod();
		const baseURL = this.client.defaults.baseURL;
		console.log('[Jira Debug] API Request:', {
			authMethod,
			baseURL,
			query,
			maxResults
		});

		try {
			// Use the new /search/jql endpoint with POST method
			const response: AxiosResponse<JiraSearchResponse> = await this.client.post('/search/jql', {
				jql: query,
				maxResults,
				fields: [
					'summary',
					'description',
					'status',
					'issuetype',
					'priority',
					'assignee',
					'reporter',
					'created',
					'updated',
					'project',
					'labels',
					'components',
					'parent',
					'sprint',
					'customfield_10014', // Epic Link
					'customfield_10020', // Sprint (common field)
					'customfield_10010', // Sprint (another common field)
					'customfield_10016'  // Sprint (another variation)
				]
			});
			return response.data;
		} catch (error: any) {
			console.error('[Jira Debug] API Error:', {
				status: error.response?.status,
				statusText: error.response?.statusText,
				data: error.response?.data,
				config: {
					method: error.config?.method,
					url: error.config?.url,
					baseURL: error.config?.baseURL,
					headers: error.config?.headers
				}
			});
			throw new Error(`Failed to fetch issues: ${error}`);
		}
	}

	public async getIssue(issueKey: string): Promise<JiraIssue> {
		if (!this.client) {
			throw new Error('Jira API not configured');
		}

		try {
			const response: AxiosResponse<JiraIssue> = await this.client.get(`/issue/${issueKey}`, {
				params: {
					fields: [
						'summary',
						'description',
						'status',
						'issuetype',
						'priority',
						'assignee',
						'reporter',
						'created',
						'updated',
						'project',
						'labels',
						'components'
					].join(',')
				}
			});
			return response.data;
		} catch (error) {
			console.error(`Failed to fetch issue ${issueKey}:`, error);
			throw new Error(`Failed to fetch issue: ${error}`);
		}
	}

	public async createIssue(issue: JiraCreateIssueRequest): Promise<JiraIssue> {
		if (!this.client) {
			throw new Error('Jira API not configured');
		}

		try {
			const response: AxiosResponse<{ key: string }> = await this.client.post('/issue', issue);
			// Fetch the created issue to return full details
			return await this.getIssue(response.data.key);
		} catch (error) {
			console.error('Failed to create Jira issue:', error);
			throw new Error(`Failed to create issue: ${error}`);
		}
	}

	public async updateIssue(issueKey: string, fields: any): Promise<void> {
		if (!this.client) {
			throw new Error('Jira API not configured');
		}

		try {
			await this.client.put(`/issue/${issueKey}`, { fields });
		} catch (error) {
			console.error(`Failed to update issue ${issueKey}:`, error);
			throw new Error(`Failed to update issue: ${error}`);
		}
	}

	public async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
		if (!this.client) {
			throw new Error('Jira API not configured');
		}

		try {
			await this.client.post(`/issue/${issueKey}/transitions`, {
				transition: {
					id: transitionId
				}
			});
		} catch (error) {
			console.error(`Failed to transition issue ${issueKey}:`, error);
			throw new Error(`Failed to transition issue: ${error}`);
		}
	}

	public async getIssueTransitions(issueKey: string): Promise<any[]> {
		if (!this.client) {
			throw new Error('Jira API not configured');
		}

		try {
			const response = await this.client.get(`/issue/${issueKey}/transitions`);
			return response.data.transitions;
		} catch (error) {
			console.error(`Failed to get transitions for issue ${issueKey}:`, error);
			throw new Error(`Failed to get transitions: ${error}`);
		}
	}

	public async addComment(issueKey: string, comment: string): Promise<void> {
		if (!this.client) {
			throw new Error('Jira API not configured');
		}

		try {
			await this.client.post(`/issue/${issueKey}/comment`, {
				body: {
					type: 'doc',
					version: 1,
					content: [
						{
							type: 'paragraph',
							content: [
								{
									text: comment,
									type: 'text'
								}
							]
						}
					]
				}
			});
		} catch (error) {
			console.error(`Failed to add comment to issue ${issueKey}:`, error);
			throw new Error(`Failed to add comment: ${error}`);
		}
	}

	public async searchIssues(searchText: string, maxResults: number = 20): Promise<JiraSearchResponse> {
		const jql = `text ~ "${searchText}" ORDER BY updated DESC`;
		return this.getIssues(jql, maxResults);
	}

	public getIssueUrl(issueKey: string): string {
		const authMethod = this.getAuthMethod();

		if (authMethod === 'oauth') {
			// For OAuth, we need to construct the URL from cloud ID
			// We'll need to store the site URL when we authenticate
			const siteUrl = this.config.get<string>('siteUrl');
			if (siteUrl) {
				return `${siteUrl}/browse/${issueKey}`;
			}
			// Fallback: if we don't have site URL, use a generic format
			// This shouldn't normally happen if OAuth is properly configured
			return `https://your-domain.atlassian.net/browse/${issueKey}`;
		} else {
			// For API token, use the configured base URL
			const baseUrl = this.config.get<string>('baseUrl');
			return `${baseUrl}/browse/${issueKey}`;
		}
	}

	public clearConfiguration(): void {
		// Clear OAuth configuration
		this.config.update('oauthAccessToken', '', vscode.ConfigurationTarget.Global);
		this.config.update('oauthRefreshToken', '', vscode.ConfigurationTarget.Global);
		this.config.update('cloudId', '', vscode.ConfigurationTarget.Global);

		// Clear API token configuration
		this.config.update('baseUrl', '', vscode.ConfigurationTarget.Global);
		this.config.update('email', '', vscode.ConfigurationTarget.Global);
		this.config.update('apiToken', '', vscode.ConfigurationTarget.Global);

		this.client = null;
	}

	public getAuthMethod(): 'oauth' | 'token' | 'none' {
		const oauthToken = this.config.get<string>('oauthAccessToken');
		const cloudId = this.config.get<string>('cloudId');
		const apiToken = this.config.get<string>('apiToken');
		const baseUrl = this.config.get<string>('baseUrl');
		const email = this.config.get<string>('email');

		if (oauthToken && cloudId) {
			return 'oauth';
		} else if (apiToken && baseUrl && email) {
			return 'token';
		} else {
			return 'none';
		}
	}
}
