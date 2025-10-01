import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios, { AxiosResponse } from 'axios';

const execAsync = promisify(exec);

export interface GitBranch {
	name: string;
	current: boolean;
	remote?: string;
	lastCommit?: {
		hash: string;
		message: string;
		author: string;
		date: string;
	};
}

export interface GitCommit {
	hash: string;
	message: string;
	author: string;
	date: string;
	files: string[];
}

export interface GitHubPR {
	number: number;
	title: string;
	state: 'open' | 'closed' | 'merged';
	author: string;
	url: string;
	createdAt: string;
	updatedAt: string;
	branch: string;
	mergeable?: boolean;
	reviews?: GitHubReview[];
	checks?: GitHubCheck[];
}

export interface GitHubReview {
	state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
	author: string;
	submittedAt: string;
}

export interface GitHubCheck {
	name: string;
	status: 'pending' | 'success' | 'failure';
	conclusion?: string;
}

export interface GitHubSearchResult {
	total_count: number;
	items: GitHubPR[];
}

export interface GitHubGraphQLResponse {
	data: {
		search: {
			nodes: Array<{
				title: string;
				url: string;
				state: string;
				number: number;
				merged?: boolean;
				author: {
					login: string;
				};
				createdAt: string;
				updatedAt: string;
				headRefName: string;
				mergeable: string;
				reviewRequests: {
					totalCount: number;
				};
				reviews: {
					nodes: Array<{
						state: string;
						author: {
							login: string;
						};
						submittedAt: string;
					}>;
				};
				commits?: {
					nodes: Array<{
						commit: {
							statusCheckRollup?: {
								state: string;
								contexts: {
									nodes: Array<{
										name?: string;
										status?: string;
										conclusion?: string;
										context?: string;
										state?: string;
									}>;
								};
							};
						};
					}>;
				};
			}>;
		};
	};
}

export class GitService {
	private githubToken?: string;
	private repoOwner?: string;
	private repoName?: string;

	constructor() {
		this.loadGitHubConfig();
	}

	private loadGitHubConfig() {
		const config = vscode.workspace.getConfiguration('mirai-jira');
		this.githubToken = config.get<string>('githubToken');

		// Try to detect repo from git remote
		this.detectGitHubRepo();
	}

	private async detectGitHubRepo() {
		try {
			const { stdout } = await execAsync('git remote get-url origin');
			const remoteUrl = stdout.trim();

			// Parse GitHub URL (both HTTPS and SSH)
			const githubMatch = remoteUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
			if (githubMatch) {
				this.repoOwner = githubMatch[1];
				this.repoName = githubMatch[2];
				console.log(`[Git] Detected GitHub repo: ${this.repoOwner}/${this.repoName}`);
			}
		} catch (error) {
			console.log('[Git] Could not detect GitHub repo:', error);
		}
	}

	// Git operations
	async getBranchesForTicket(ticketKey: string): Promise<GitBranch[]> {
		try {
			// Get the workspace root directory
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				console.error('[Git] No workspace folder found');
				return [];
			}

			const workingDir = workspaceFolder.uri.fsPath;

			const { stdout } = await execAsync('git branch -a --format="%(refname:short)|%(HEAD)|%(upstream:short)|%(objectname:short)|%(subject)|%(authorname)|%(committerdate:iso)"', { cwd: workingDir });

			const branches: GitBranch[] = [];
			const lines = stdout.trim().split('\n').filter(line => line);

			for (const line of lines) {
				const [name, head, upstream, hash, message, author, date] = line.split('|');

				// Check if branch name contains the ticket key
				if (name.toLowerCase().includes(ticketKey.toLowerCase())) {
					branches.push({
						name: name.replace('origin/', ''),
						current: head === '*',
						remote: upstream,
						lastCommit: {
							hash,
							message,
							author,
							date
						}
					});
				}
			}

			return branches;
		} catch (error) {
			console.error('[Git] Error getting branches:', error);
			return [];
		}
	}

	async getCommitsForTicket(ticketKey: string): Promise<GitCommit[]> {
		try {
			// Get the workspace root directory
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				console.error('[Git] No workspace folder found');
				return [];
			}

			const workingDir = workspaceFolder.uri.fsPath;

			// Search commit messages for ticket key
			const { stdout } = await execAsync(`git log --all --grep="${ticketKey}" --pretty=format:"%H|%s|%an|%ai" --name-only`, { cwd: workingDir });

			const commits: GitCommit[] = [];
			const blocks = stdout.split('\n\n').filter(block => block.trim());

			for (const block of blocks) {
				const lines = block.trim().split('\n');
				if (lines.length === 0) continue;

				const [hash, message, author, date] = lines[0].split('|');
				const files = lines.slice(1).filter(line => line.trim());

				commits.push({
					hash: hash.substring(0, 8),
					message,
					author,
					date,
					files
				});
			}

			return commits;
		} catch (error) {
			console.error('[Git] Error getting commits:', error);
			return [];
		}
	}

	async createBranchForTicket(ticketKey: string, branchType: 'feature' | 'bugfix' | 'hotfix' = 'feature'): Promise<boolean> {
		try {
			const branchName = `${branchType}/${ticketKey.toLowerCase()}`;

			// Get the workspace root directory
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage('No workspace folder found');
				return false;
			}

			const workingDir = workspaceFolder.uri.fsPath;
			console.log(`[Git] Creating branch in directory: ${workingDir}`);
			console.log(`[Git] Branch name: ${branchName}`);

			// Check current branch first
			const { stdout: currentBranch } = await execAsync('git branch --show-current', { cwd: workingDir });
			console.log(`[Git] Current branch before: ${currentBranch.trim()}`);

			// Create and switch to new branch
			const { stdout, stderr } = await execAsync(`git checkout -b ${branchName}`, { cwd: workingDir });
			console.log(`[Git] Checkout output: ${stdout}`);
			if (stderr) {
				console.log(`[Git] Checkout stderr: ${stderr}`);
			}

			// Verify the branch switch
			const { stdout: newBranch } = await execAsync('git branch --show-current', { cwd: workingDir });
			console.log(`[Git] Current branch after: ${newBranch.trim()}`);

			// Force refresh VS Code's git view
			await vscode.commands.executeCommand('git.refresh');

			// Also try to refresh the source control view
			await vscode.commands.executeCommand('workbench.view.scm');

			// Show success message with verification
			if (newBranch.trim() === branchName) {
				vscode.window.showInformationMessage(`✅ Created and switched to branch: ${branchName}`);
				return true;
			} else {
				vscode.window.showWarningMessage(`⚠️ Branch created but switch verification failed. Current: ${newBranch.trim()}`);
				return false;
			}

		} catch (error: any) {
			console.error('[Git] Error creating branch:', error);
			const errorMessage = error.stderr || error.message || error.toString();
			vscode.window.showErrorMessage(`Failed to create branch: ${errorMessage}`);
			return false;
		}
	}

	// GitHub API operations
	async getPRsForTicket(ticketKey: string): Promise<GitHubPR[]> {
		if (!this.githubToken || !this.repoOwner || !this.repoName) {
			return [];
		}

		try {
			// Try GraphQL search first for better accuracy
			const graphqlResults = await this.searchPRsWithGraphQL(ticketKey);
			if (graphqlResults.length > 0) {
				return graphqlResults;
			}

			// Fallback to REST API search
			const restResults = await this.searchPRsWithREST(ticketKey);
			return restResults;

		} catch (error) {
			console.error('[GitHub] Error fetching PRs:', error);
			return [];
		}
	}

	private async getPRReviews(prNumber: number): Promise<GitHubReview[]> {
		if (!this.githubToken || !this.repoOwner || !this.repoName) {
			return [];
		}

		try {
			const response: AxiosResponse<any[]> = await axios.get(
				`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/pulls/${prNumber}/reviews`,
				{
					headers: {
						'Authorization': `Bearer ${this.githubToken}`,
						'Accept': 'application/vnd.github.v3+json'
					}
				}
			);

			return response.data.map(review => ({
				state: review.state,
				author: review.user.login,
				submittedAt: review.submitted_at
			}));
		} catch (error) {
			console.error('[GitHub] Error getting PR reviews:', error);
			return [];
		}
	}

	private async getPRChecks(prNumber: number): Promise<GitHubCheck[]> {
		if (!this.githubToken || !this.repoOwner || !this.repoName) {
			return [];
		}

		try {
			// Get the PR to get the head SHA
			const prResponse = await axios.get(
				`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/pulls/${prNumber}`,
				{
					headers: {
						'Authorization': `Bearer ${this.githubToken}`,
						'Accept': 'application/vnd.github.v3+json'
					}
				}
			);

			const headSha = prResponse.data.head.sha;

			// Get check runs for the head SHA
			const checksResponse: AxiosResponse<any> = await axios.get(
				`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/commits/${headSha}/check-runs`,
				{
					headers: {
						'Authorization': `Bearer ${this.githubToken}`,
						'Accept': 'application/vnd.github.v3+json'
					}
				}
			);

			return checksResponse.data.check_runs.map((check: any) => ({
				name: check.name,
				status: check.status,
				conclusion: check.conclusion
			}));
		} catch (error) {
			console.error('[GitHub] Error getting PR checks:', error);
			return [];
		}
	}

	async createPRForBranch(ticketKey: string, title: string, description: string): Promise<string | null> {
		if (!this.githubToken || !this.repoOwner || !this.repoName) {
			vscode.window.showErrorMessage('GitHub not configured. Please set your GitHub token.');
			return null;
		}

		try {
			const { stdout: currentBranch } = await execAsync('git branch --show-current');
			const branch = currentBranch.trim();

			if (!branch.toLowerCase().includes(ticketKey.toLowerCase())) {
				vscode.window.showWarningMessage('Current branch does not seem related to this ticket.');
			}

			const response: AxiosResponse<any> = await axios.post(
				`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/pulls`,
				{
					title: `${ticketKey}: ${title}`,
					body: description,
					head: branch,
					base: 'main' // or 'master', could be configurable
				},
				{
					headers: {
						'Authorization': `Bearer ${this.githubToken}`,
						'Accept': 'application/vnd.github.v3+json'
					}
				}
			);

			const prUrl = response.data.html_url;
			vscode.window.showInformationMessage(
				`Pull Request created: #${response.data.number}`,
				'Open PR'
			).then(action => {
				if (action === 'Open PR') {
					vscode.env.openExternal(vscode.Uri.parse(prUrl));
				}
			});

			return prUrl;
		} catch (error: any) {
			const message = error.response?.data?.message || error.message;
			vscode.window.showErrorMessage(`Failed to create PR: ${message}`);
			return null;
		}
	}

	private async searchPRsWithGraphQL(ticketKey: string): Promise<GitHubPR[]> {
		try {
			const query = `
				query {
					search(
						query: "${ticketKey} in:title,body type:pr repo:${this.repoOwner}/${this.repoName}"
						type: ISSUE
						first: 10
					) {
						nodes {
							... on PullRequest {
								title
								url
								state
								number
								author {
									login
								}
								createdAt
								updatedAt
								headRefName
								mergeable
								merged
								reviewRequests {
									totalCount
								}
								reviews(first: 10) {
									nodes {
										state
										author {
											login
										}
										submittedAt
									}
								}
								commits(last: 1) {
									nodes {
										commit {
											statusCheckRollup {
												state
												contexts(first: 10) {
													nodes {
														... on CheckRun {
															name
															status
															conclusion
															detailsUrl
														}
														... on StatusContext {
															context
															state
															targetUrl
														}
													}
												}
											}
										}
									}
								}
							}
						}
					}
				}
			`;

			const response = await axios.post(
				'https://api.github.com/graphql',
				{ query },
				{
					headers: {
						'Authorization': `Bearer ${this.githubToken}`,
						'Content-Type': 'application/json'
					}
				}
			);

			const data: GitHubGraphQLResponse = response.data;
			const prs: GitHubPR[] = [];

			for (const node of data.data.search.nodes) {
				const reviews: GitHubReview[] = node.reviews.nodes.map(review => ({
					state: review.state as 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED',
					author: review.author.login,
					submittedAt: review.submittedAt
				}));

				// Extract checks from the statusCheckRollup
				const checks: GitHubCheck[] = [];
				const lastCommit = node.commits?.nodes[0];
				if (lastCommit?.commit.statusCheckRollup?.contexts) {
					for (const context of lastCommit.commit.statusCheckRollup.contexts.nodes) {
						if (context.name) {
							// CheckRun
							checks.push({
								name: context.name,
								status: (context.status || 'pending') as 'pending' | 'success' | 'failure',
								conclusion: context.conclusion
							});
						} else if (context.context) {
							// StatusContext
							checks.push({
								name: context.context,
								status: (context.state || 'pending') as 'pending' | 'success' | 'failure'
							});
						}
					}
				}

				prs.push({
					number: node.number,
					title: node.title,
					state: node.merged ? 'merged' : (node.state.toLowerCase() as 'open' | 'closed'),
					author: node.author.login,
					url: node.url,
					createdAt: node.createdAt,
					updatedAt: node.updatedAt,
					branch: node.headRefName,
					mergeable: node.mergeable === 'MERGEABLE',
					reviews,
					checks
				});
			}

			console.log(`[GitHub GraphQL] Found ${prs.length} PRs for ${ticketKey}`);
			return prs;

		} catch (error) {
			console.error('[GitHub GraphQL] Search failed:', error);
			return [];
		}
	}

	private async searchPRsWithREST(ticketKey: string): Promise<GitHubPR[]> {
		try {
			// Use GitHub's search API for better results
			const searchResponse: AxiosResponse<any> = await axios.get(
				'https://api.github.com/search/issues',
				{
					headers: {
						'Authorization': `Bearer ${this.githubToken}`,
						'Accept': 'application/vnd.github.v3+json'
					},
					params: {
						q: `${ticketKey} in:title,body type:pr repo:${this.repoOwner}/${this.repoName}`,
						sort: 'updated',
						order: 'desc',
						per_page: 10
					}
				}
			);

			const prs: GitHubPR[] = [];

			for (const item of searchResponse.data.items) {
				// Get detailed PR info
				const prResponse = await axios.get(
					`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/pulls/${item.number}`,
					{
						headers: {
							'Authorization': `Bearer ${this.githubToken}`,
							'Accept': 'application/vnd.github.v3+json'
						}
					}
				);

				const pr = prResponse.data;

				// Get reviews and checks
				const [reviews, checks] = await Promise.all([
					this.getPRReviews(pr.number),
					this.getPRChecks(pr.number)
				]);

				prs.push({
					number: pr.number,
					title: pr.title,
					state: pr.merged_at ? 'merged' : pr.state,
					author: pr.user.login,
					url: pr.html_url,
					createdAt: pr.created_at,
					updatedAt: pr.updated_at,
					branch: pr.head.ref,
					mergeable: pr.mergeable,
					reviews,
					checks
				});
			}

			console.log(`[GitHub REST] Found ${prs.length} PRs for ${ticketKey}`);
			return prs;

		} catch (error) {
			console.error('[GitHub REST] Search failed:', error);
			return [];
		}
	}

	async getCurrentBranch(): Promise<string> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				return 'unknown';
			}

			const workingDir = workspaceFolder.uri.fsPath;
			const { stdout } = await execAsync('git branch --show-current', { cwd: workingDir });
			return stdout.trim();
		} catch (error) {
			console.error('[Git] Error getting current branch:', error);
			return 'unknown';
		}
	}

	isGitHubConfigured(): boolean {
		return !!(this.githubToken && this.repoOwner && this.repoName);
	}

	getRepoInfo(): { owner?: string; name?: string } {
		return {
			owner: this.repoOwner,
			name: this.repoName
		};
	}
}
