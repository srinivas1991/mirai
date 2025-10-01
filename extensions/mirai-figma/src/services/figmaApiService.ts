import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';

export interface FigmaFile {
	key: string;
	name: string;
	thumbnail_url: string;
	last_modified: string;
}

export interface FigmaNode {
	id: string;
	name: string;
	type: string;
	children?: FigmaNode[];
	fills?: any[];
	strokes?: any[];
	effects?: any[];
	characters?: string;
	style?: any;
}

export interface FigmaFileResponse {
	document: FigmaNode;
	components: { [key: string]: any };
	styles: { [key: string]: any };
	name: string;
	lastModified: string;
	thumbnailUrl: string;
	version: string;
}

export interface FigmaUser {
	id: string;
	name: string;
	email: string;
	img_url: string;
}

export interface FigmaTeam {
	id: string;
	name: string;
}

export interface FigmaProject {
	id: string;
	name: string;
}

export interface FigmaFileInfo {
	key: string;
	name: string;
	thumbnail_url: string;
	last_modified: string;
	created_at: string;
}

export interface FigmaProjectFilesResponse {
	files: FigmaFileInfo[];
}

export interface FigmaUserResponse {
	id: string;
	name: string;
	email: string;
	img_url: string;
	// teams may not be included in /v1/me response
	teams?: FigmaTeam[];
}

export interface FigmaTeamProjectsResponse {
	projects: FigmaProject[];
}

export class FigmaApiService {
	private api: AxiosInstance;
	private accessToken: string = '';

	constructor() {
		this.updateAccessToken();

		this.api = axios.create({
			baseURL: 'https://api.figma.com/v1',
			headers: {
				'Authorization': `Bearer ${this.accessToken}`
			}
		});

		// Listen for configuration changes
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('mirai-figma.accessToken')) {
				this.updateAccessToken();
			}
		});
	}

	private updateAccessToken() {
		const config = vscode.workspace.getConfiguration('mirai-figma');
		this.accessToken = config.get('accessToken') || '';

		if (this.api) {
			this.api.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;
		}
	}

	private checkAccessToken() {
		if (!this.accessToken) {
			throw new Error('Figma access token not configured. Please set it in settings.');
		}

		// Debug logging for token info (no validation)
		console.log('[Figma API Debug] Using token:', {
			tokenPrefix: this.accessToken.substring(0, 10) + '...',
			tokenLength: this.accessToken.length,
			actualPrefix: this.accessToken.substring(0, 5),
			authHeader: `Bearer ${this.accessToken.substring(0, 10)}...`
		});

		// No client-side token format validation - let Figma API handle invalid tokens
	}

	isConfigured(): boolean {
		return !!(this.accessToken && this.accessToken.trim().length > 0);
	}


	async getFile(fileKey: string): Promise<FigmaFileResponse> {
		this.checkAccessToken();

		try {
			const response = await this.api.get(`/files/${fileKey}`);
			return response.data;
		} catch (error) {
			console.error('Error fetching file:', error);
			throw new Error('Failed to fetch Figma file');
		}
	}

	async getFileNodes(fileKey: string, nodeIds: string[]): Promise<{ [key: string]: FigmaNode }> {
		this.checkAccessToken();

		try {
			const response = await this.api.get(`/files/${fileKey}/nodes`, {
				params: {
					ids: nodeIds.join(',')
				}
			});
			return response.data.nodes || {};
		} catch (error) {
			console.error('Error fetching file nodes:', error);
			throw new Error('Failed to fetch file nodes');
		}
	}

	async getImages(fileKey: string, nodeIds: string[], options: { format?: 'jpg' | 'png' | 'svg' | 'pdf', scale?: number } = {}): Promise<{ [key: string]: string }> {
		this.checkAccessToken();

		try {
			const response = await this.api.get(`/images/${fileKey}`, {
				params: {
					ids: nodeIds.join(','),
					format: options.format || 'png',
					scale: options.scale || 1
				}
			});
			return response.data.images || {};
		} catch (error) {
			console.error('Error fetching images:', error);
			throw new Error('Failed to fetch images');
		}
	}

	async getRecentFiles(): Promise<FigmaFile[]> {
		this.checkAccessToken();
		console.log('[Figma API Debug] Checking access token:', this.accessToken);

		try {
			const response = await this.api.get('/files/recent');
			return response.data.files || [];
		} catch (error: any) {
			console.error('Error fetching recent files:', error);

			// Provide specific error messages based on status code
			let errorMessage = 'Failed to fetch recent files';
			if (error.response?.status === 403) {
				errorMessage = 'Invalid Figma access token. Please check your token and try again.';
			} else if (error.response?.status === 401) {
				errorMessage = 'Figma access token expired or invalid. Please re-authenticate.';
			} else if (error.response?.status === 429) {
				errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
			} else if (!error.response) {
				errorMessage = 'Network error. Please check your internet connection.';
			}

			// Show error to user but return empty array to prevent crashes
			vscode.window.showErrorMessage(`Error fetching recent files: ${errorMessage}`);
			return [];
		}
	}

	async getUser(): Promise<FigmaUserResponse> {
		this.checkAccessToken();

		try {
			const response = await this.api.get('/me');
			return response.data;
		} catch (error) {
			console.error('Error fetching user info:', error);
			throw new Error('Failed to fetch user information');
		}
	}

	/**
	 * Get teams for the current user
	 */
	async getTeams(): Promise<FigmaTeam[]> {
		this.checkAccessToken();

		try {
			const response = await this.api.get('/teams');
			return response.data.teams || [];
		} catch (error: any) {
			console.error('Error fetching teams:', error);
			throw new Error(`Failed to fetch teams: ${error.response?.data?.message || error.message}`);
		}
	}

	/**
	 * Get projects for a specific team
	 */
	async getTeamProjects(teamId: string): Promise<FigmaTeamProjectsResponse> {
		this.checkAccessToken();

		try {
			const response = await this.api.get(`/teams/${teamId}/projects`);
			return response.data;
		} catch (error: any) {
			console.error('Error fetching team projects:', error);
			throw new Error(`Failed to fetch team projects: ${error.response?.data?.message || error.message}`);
		}
	}

	/**
	 * Get files for a specific project
	 */
	async getProjectFiles(projectId: string): Promise<FigmaProjectFilesResponse> {
		this.checkAccessToken();

		try {
			const response = await this.api.get(`/projects/${projectId}/files`);
			return response.data;
		} catch (error: any) {
			console.error('Error fetching project files:', error);
			throw new Error(`Failed to fetch project files: ${error.response?.data?.message || error.message}`);
		}
	}

	/**
	 * Get recent files across all teams and projects, sorted by last_modified
	 * This method tries multiple approaches to get teams and gracefully falls back
	 */
	async getRecentFilesProper(): Promise<FigmaFileInfo[]> {
		this.checkAccessToken();

		console.log('[Figma API Debug] Starting getRecentFilesProper...');

		// Always fall back to the original working method for now
		// until we can debug the teams structure properly
		try {
			console.log('[Figma API Debug] Using fallback to original getRecentFiles method');
			const recentFiles = await this.getRecentFiles();

			// Convert FigmaFile[] to FigmaFileInfo[] format
			const convertedFiles = recentFiles.map(file => ({
				key: file.key,
				name: file.name,
				thumbnail_url: file.thumbnail_url,
				last_modified: file.last_modified,
				created_at: file.last_modified // Use last_modified as fallback for created_at
			}));

			console.log(`[Figma API Debug] Successfully converted ${convertedFiles.length} files from original method`);
			return convertedFiles;

		} catch (fallbackError: any) {
			console.error('Original method also failed:', fallbackError);
			throw new Error(`Failed to fetch recent files: ${fallbackError.message}`);
		}
	}

	/**
	 * Future implementation for proper teams/projects/files approach
	 * TODO: Enable this once we understand the correct API structure
	 */
	async getRecentFilesProperFuture(): Promise<FigmaFileInfo[]> {
		this.checkAccessToken();

		try {
			// Get user info first
			const user = await this.getUser();
			console.log('[Figma API Debug] User response:', JSON.stringify(user, null, 2));

			// Try to get teams - first from user response, then from dedicated endpoint
			let teams: FigmaTeam[] = [];

			if (user.teams && Array.isArray(user.teams)) {
				teams = user.teams;
				console.log('[Figma API Debug] Found teams in user response:', teams.length);
			} else {
				try {
					teams = await this.getTeams();
					console.log('[Figma API Debug] Found teams from /teams endpoint:', teams.length);
				} catch (teamsError) {
					console.warn('[Figma API Debug] Failed to fetch teams from /teams endpoint:', teamsError);
				}
			}

			// If still no teams, fall back to original method
			if (!teams || teams.length === 0) {
				console.warn('[Figma API Debug] No teams found, falling back to original method');
				return await this.getRecentFilesProper();
			}

			console.log('[Figma API Debug] Processing teams:', teams.map(t => ({ id: t.id, name: t.name })));

			const allFiles: FigmaFileInfo[] = [];

			// Get files from all teams
			for (const team of teams) {
				try {
					// Get projects for this team
					const projectsResponse = await this.getTeamProjects(team.id);
					console.log(`[Figma API Debug] Team "${team.name}" has ${projectsResponse.projects.length} projects`);

					// Get files from all projects in this team
					for (const project of projectsResponse.projects) {
						try {
							const filesResponse = await this.getProjectFiles(project.id);
							console.log(`[Figma API Debug] Project "${project.name}" has ${filesResponse.files.length} files`);

							// Add project context to files
							const projectFiles = filesResponse.files.map((file: any) => ({
								...file,
								projectName: project.name,
								teamName: team.name,
								teamId: team.id,
								projectId: project.id
							}));

							allFiles.push(...projectFiles);
						} catch (projectError) {
							console.warn(`[Figma API Debug] Failed to fetch files for project ${project.name}:`, projectError);
						}
					}
				} catch (teamError) {
					console.warn(`[Figma API Debug] Failed to fetch projects for team ${team.name}:`, teamError);
				}
			}

			// Sort by last_modified (most recent first)
			allFiles.sort((a, b) => new Date(b.last_modified).getTime() - new Date(a.last_modified).getTime());

			console.log(`[Figma API Debug] Found ${allFiles.length} total files across all teams`);
			return allFiles;

		} catch (error: any) {
			console.error('Error fetching recent files properly:', error);
			console.error('Error details:', JSON.stringify(error.response?.data, null, 2));
			throw new Error(`Failed to fetch recent files: ${error.message}`);
		}
	}

}
