import * as vscode from 'vscode';
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
}

export class GitHubRepoService {
	private static readonly GITHUB_API_BASE = 'https://api.github.com';

	/**
	 * Fetches all repositories for the authenticated user
	 */
	async getUserRepositories(): Promise<GitHubRepository[]> {
		try {
			// Get GitHub authentication session from custom Mirai GitHub provider
			const session = await vscode.authentication.getSession('mirai-github', ['repo', 'read:user', 'read:org'], {
				createIfNone: true
			});

			if (!session) {
				throw new Error('No GitHub session found');
			}

			const repos: GitHubRepository[] = [];

			// Fetch user's personal and collaborative repos
			await this.fetchUserRepos(session.accessToken, repos);

			// Fetch organization repos
			await this.fetchOrgRepos(session.accessToken, repos);

			// Remove duplicates based on repo ID
			const uniqueRepos = Array.from(
				new Map(repos.map(repo => [repo.id, repo])).values()
			);

			return uniqueRepos;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				throw new Error(`Failed to fetch GitHub repositories: ${error.message}`);
			}
			throw error;
		}
	}

	/**
	 * Fetch user's personal and collaborative repositories
	 */
	private async fetchUserRepos(accessToken: string, repos: GitHubRepository[]): Promise<void> {
		let page = 1;
		const perPage = 100;

		while (true) {
			const response = await axios.get<GitHubRepository[]>(
				`${GitHubRepoService.GITHUB_API_BASE}/user/repos`,
				{
					headers: {
						'Authorization': `Bearer ${accessToken}`,
						'Accept': 'application/vnd.github.v3+json',
						'User-Agent': 'Void-Editor'
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
	}

	/**
	 * Fetch repositories from all user's organizations
	 */
	private async fetchOrgRepos(accessToken: string, repos: GitHubRepository[]): Promise<void> {
		try {
			// First, get list of user's organizations
			const orgsResponse = await axios.get<Array<{ login: string }>>(
				`${GitHubRepoService.GITHUB_API_BASE}/user/orgs`,
				{
					headers: {
						'Authorization': `Bearer ${accessToken}`,
						'Accept': 'application/vnd.github.v3+json',
						'User-Agent': 'Void-Editor'
					}
				}
			);

			// Fetch repos from each organization
			for (const org of orgsResponse.data) {
				let page = 1;
				const perPage = 100;

				while (true) {
					const response = await axios.get<GitHubRepository[]>(
						`${GitHubRepoService.GITHUB_API_BASE}/orgs/${org.login}/repos`,
						{
							headers: {
								'Authorization': `Bearer ${accessToken}`,
								'Accept': 'application/vnd.github.v3+json',
								'User-Agent': 'Void-Editor'
							},
							params: {
								per_page: perPage,
								page: page,
								sort: 'updated',
								type: 'all' // Get all repos (public, private, internal)
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
			}
		} catch (error) {
			// Silently fail if org repos can't be fetched
			console.warn('Failed to fetch organization repositories:', error);
		}
	}

	/**
	 * Fetches repositories for a specific organization
	 */
	async getOrgRepositories(orgName: string): Promise<GitHubRepository[]> {
		try {
			const session = await vscode.authentication.getSession('mirai-github', ['repo', 'read:user'], {
				createIfNone: true
			});

			if (!session) {
				throw new Error('No GitHub session found');
			}

			const repos: GitHubRepository[] = [];
			let page = 1;
			const perPage = 100;

			while (true) {
				const response = await axios.get<GitHubRepository[]>(
					`${GitHubRepoService.GITHUB_API_BASE}/orgs/${orgName}/repos`,
					{
						headers: {
							'Authorization': `Bearer ${session.accessToken}`,
							'Accept': 'application/vnd.github.v3+json',
							'User-Agent': 'Void-Editor'
						},
						params: {
							per_page: perPage,
							page: page,
							sort: 'updated'
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

			return repos;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				throw new Error(`Failed to fetch org repositories: ${error.message}`);
			}
			throw error;
		}
	}

	/**
	 * Gets the authenticated user's information
	 */
	async getAuthenticatedUser(): Promise<{ login: string; name: string; avatar_url: string }> {
		try {
			const session = await vscode.authentication.getSession('mirai-github', ['read:user'], {
				createIfNone: true
			});

			if (!session) {
				throw new Error('No GitHub session found');
			}

			const response = await axios.get(
				`${GitHubRepoService.GITHUB_API_BASE}/user`,
				{
					headers: {
						'Authorization': `Bearer ${session.accessToken}`,
						'Accept': 'application/vnd.github.v3+json',
						'User-Agent': 'Void-Editor'
					}
				}
			);

			return response.data;
		} catch (error) {
			if (axios.isAxiosError(error)) {
				throw new Error(`Failed to fetch user info: ${error.message}`);
			}
			throw error;
		}
	}

	/**
	 * Clones a repository to a local directory
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

		// Use VS Code's git.clone command
		await vscode.commands.executeCommand('git.clone', cloneUrl, parentPath);
	}
}

