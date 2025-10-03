import * as vscode from 'vscode';
import { GitHubRepoService, GitHubRepository } from './githubRepoService';

export class GitHubRepoTreeItem extends vscode.TreeItem {
	constructor(
		public readonly repo: GitHubRepository,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState
	) {
		super(repo.name, collapsibleState);

		this.tooltip = this.getTooltip();
		this.description = this.getDescription();
		this.contextValue = 'githubRepository';
		this.iconPath = new vscode.ThemeIcon(
			repo.private ? 'lock' : 'repo',
			repo.private ? new vscode.ThemeColor('charts.red') : new vscode.ThemeColor('charts.blue')
		);

		// Set command to show actions when clicked
		this.command = {
			command: 'mirai-auth.showRepoActions',
			title: 'Show Repository Actions',
			arguments: [this.repo]
		};
	}

	private getDescription(): string {
		const parts: string[] = [];

		if (this.repo.stargazers_count > 0) {
			parts.push(`⭐ ${this.repo.stargazers_count}`);
		}

		if (this.repo.language) {
			parts.push(this.repo.language);
		}

		return parts.join(' • ');
	}

	private getTooltip(): string {
		const lines = [
			`Repository: ${this.repo.full_name}`,
			``,
			this.repo.description || 'No description',
			``,
			`Visibility: ${this.repo.private ? 'Private 🔒' : 'Public 🌐'}`,
			`Language: ${this.repo.language || 'Unknown'}`,
			`Stars: ${this.repo.stargazers_count}`,
			`Forks: ${this.repo.forks_count}`,
			`Last Updated: ${new Date(this.repo.updated_at).toLocaleString()}`,
		];

		return lines.join('\n');
	}
}

export class GitHubRepoTreeProvider implements vscode.TreeDataProvider<GitHubRepoTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<GitHubRepoTreeItem | undefined | null | void> = new vscode.EventEmitter<GitHubRepoTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<GitHubRepoTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private repos: GitHubRepository[] = [];
	private isLoading: boolean = false;
	private error: string | undefined;

	constructor(private githubRepoService: GitHubRepoService) { }

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	async loadRepositories(): Promise<void> {
		this.isLoading = true;
		this.error = undefined;
		this.refresh();

		try {
			this.repos = await this.githubRepoService.getUserRepositories();
			this.isLoading = false;
			this.refresh();
		} catch (error) {
			this.isLoading = false;
			this.error = error instanceof Error ? error.message : String(error);
			this.refresh();
			throw error;
		}
	}

	getTreeItem(element: GitHubRepoTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: GitHubRepoTreeItem): Promise<GitHubRepoTreeItem[]> {
		// Root level - show repositories
		if (!element) {
			if (this.isLoading) {
				return [];
			}

			if (this.error) {
				return [];
			}

			if (this.repos.length === 0) {
				return [];
			}

			// Sort by updated date (most recent first)
			const sortedRepos = [...this.repos].sort((a, b) =>
				new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
			);

			return sortedRepos.map(repo =>
				new GitHubRepoTreeItem(repo, vscode.TreeItemCollapsibleState.None)
			);
		}

		return [];
	}

	getParent(): vscode.ProviderResult<GitHubRepoTreeItem> {
		return undefined;
	}

	getRepoCount(): number {
		return this.repos.length;
	}

	hasError(): boolean {
		return !!this.error;
	}

	getError(): string | undefined {
		return this.error;
	}

	clearRepositories(): void {
		this.repos = [];
		this.error = undefined;
		this.isLoading = false;
		this.refresh();
	}
}

