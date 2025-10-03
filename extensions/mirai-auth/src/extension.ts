import * as vscode from 'vscode';
import { MiraiAuthenticationProvider } from './miraiAuthProvider';
import { MiraiGitHubAuthenticationProvider } from './githubAuthProvider';
import { GitHubRepoService, GitHubRepository } from './githubRepoService';
import { GitHubRepoTreeProvider } from './githubRepoTreeProvider';

export function activate(context: vscode.ExtensionContext) {
	const miraiAuthProvider = new MiraiAuthenticationProvider(context);
	const githubAuthProvider = new MiraiGitHubAuthenticationProvider(context);
	const githubRepoService = new GitHubRepoService();
	const githubRepoTreeProvider = new GitHubRepoTreeProvider(githubRepoService);

	// Register the Mirai authentication provider
	const miraiDisposable = vscode.authentication.registerAuthenticationProvider(
		'mirai',
		'Mirai',
		miraiAuthProvider,
		{ supportsMultipleAccounts: false }
	);
	context.subscriptions.push(miraiDisposable);

	// Register the custom GitHub authentication provider (shows "Authorize Mirai")
	const githubDisposable = vscode.authentication.registerAuthenticationProvider(
		'mirai-github',
		'GitHub (Mirai)',
		githubAuthProvider,
		{ supportsMultipleAccounts: false }
	);
	context.subscriptions.push(githubDisposable);

	// Register URI handler for OAuth callbacks
	const uriHandler = vscode.window.registerUriHandler({
		async handleUri(uri: vscode.Uri): Promise<void> {
			// Route to the appropriate provider based on the path
			if (uri.path === '/auth-callback') {
				return miraiAuthProvider.handleCallback(uri);
			} else if (uri.path === '/github-callback') {
				return githubAuthProvider.handleCallback(uri);
			}
		}
	});
	context.subscriptions.push(uriHandler);

	// Register GitHub Repositories TreeView in SCM
	const treeView = vscode.window.createTreeView('mirai-auth.githubRepos', {
		treeDataProvider: githubRepoTreeProvider,
		showCollapseAll: false,
		canSelectMany: false
	});
	context.subscriptions.push(treeView);

	// Update tree view title with repo count
	const updateTreeViewTitle = () => {
		const count = githubRepoTreeProvider.getRepoCount();
		if (count > 0) {
			treeView.title = `GitHub Repositories (${count})`;
		} else {
			treeView.title = 'GitHub Repositories';
		}
	};

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('mirai-auth.signIn', async () => {
			try {
				await vscode.authentication.getSession('mirai', [], { createIfNone: true });
			} catch (e) {
				vscode.window.showErrorMessage(`Failed to sign in to Mirai: ${e}`);
			}
		})
	);

	// Command to remove GitHub Personal Access Token
	context.subscriptions.push(
		vscode.commands.registerCommand('mirai-auth.removeGitHubPAT', async () => {
			const confirm = await vscode.window.showWarningMessage(
				'Are you sure you want to remove your GitHub Personal Access Token?',
				{ modal: true },
				'Remove'
			);

			if (confirm === 'Remove') {
				try {
					await githubAuthProvider.removeSession('pat');
					// Clear the repository list
					githubRepoTreeProvider.clearRepositories();
					updateTreeViewTitle();
					vscode.window.showInformationMessage('GitHub Personal Access Token removed successfully');
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to remove token: ${error}`);
				}
			}
		})
	);

	// Command to add GitHub Personal Access Token
	context.subscriptions.push(
		vscode.commands.registerCommand('mirai-auth.addGitHubPAT', async () => {
			// Show info message with link to generate token
			const action = await vscode.window.showInformationMessage(
				'You need a GitHub Personal Access Token with "repo", "read:user", "user:email", and "read:org" scopes.',
				'Generate Token',
				'I Have a Token'
			);

			if (action === 'Generate Token') {
				// Open GitHub token generation page with pre-filled settings
				const tokenUrl = 'https://github.com/settings/tokens/new?description=Mirai%20VS%20Code&scopes=repo,read:user,user:email,read:org';
				await vscode.env.openExternal(vscode.Uri.parse(tokenUrl));

				// Show the input box after opening the link
				const continueAction = await vscode.window.showInformationMessage(
					'After generating your token, click "Enter Token" to continue.',
					'Enter Token'
				);

				if (continueAction !== 'Enter Token') {
					return;
				}
			} else if (action !== 'I Have a Token') {
				return;
			}

			const token = await vscode.window.showInputBox({
				prompt: 'Enter your GitHub Personal Access Token',
				password: true,
				placeHolder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
				ignoreFocusOut: true,
				validateInput: (value) => {
					if (!value) {
						return 'Token is required';
					}
					if (!value.startsWith('ghp_') && !value.startsWith('github_pat_')) {
						return 'Invalid token format. Should start with ghp_ or github_pat_';
					}
					return undefined;
				}
			});

			if (!token) {
				return;
			}

			try {
				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: 'Validating GitHub Personal Access Token...',
					cancellable: false
				}, async () => {
					await githubAuthProvider.createSessionFromPAT(token);
				});

				vscode.window.showInformationMessage('GitHub Personal Access Token added successfully!');

				// Refresh repos
				try {
					await githubRepoTreeProvider.loadRepositories();
					updateTreeViewTitle();
				} catch (error) {
					// Silently fail repo refresh
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to add token: ${error instanceof Error ? error.message : error}`);
			}
		})
	);

	// Command to refresh GitHub repositories in tree view
	context.subscriptions.push(
		vscode.commands.registerCommand('mirai-auth.refreshGitHubRepos', async () => {
			try {
				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: 'Fetching GitHub repositories...',
					cancellable: false
				}, async () => {
					await githubRepoTreeProvider.loadRepositories();
					updateTreeViewTitle();
				});
				vscode.window.showInformationMessage(`Loaded ${githubRepoTreeProvider.getRepoCount()} repositories`);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to fetch repositories: ${error}`);
			}
		})
	);

	// Command to show repository actions
	context.subscriptions.push(
		vscode.commands.registerCommand('mirai-auth.showRepoActions', async (repo: GitHubRepository) => {
			const action = await vscode.window.showQuickPick([
				{ label: '$(globe) Open in Browser', value: 'open' },
				{ label: '$(cloud-download) Clone Repository', value: 'clone' },
				{ label: '$(clippy) Copy Clone URL (HTTPS)', value: 'copy-https' },
				{ label: '$(clippy) Copy Clone URL (SSH)', value: 'copy-ssh' },
				{ label: '$(info) Show Details', value: 'details' }
			], {
				placeHolder: `What do you want to do with ${repo.name}?`
			});

			if (action) {
				switch (action.value) {
					case 'open':
						vscode.env.openExternal(vscode.Uri.parse(repo.html_url));
						break;
					case 'clone':
						await githubRepoService.cloneRepository(repo);
						break;
					case 'copy-https':
						await vscode.env.clipboard.writeText(repo.clone_url);
						vscode.window.showInformationMessage('HTTPS clone URL copied to clipboard');
						break;
					case 'copy-ssh':
						await vscode.env.clipboard.writeText(repo.ssh_url);
						vscode.window.showInformationMessage('SSH clone URL copied to clipboard');
						break;
					case 'details': {
						const details = `
Repository: ${repo.full_name}
Description: ${repo.description || 'None'}
Visibility: ${repo.private ? 'Private' : 'Public'}
Language: ${repo.language || 'Unknown'}
Stars: ${repo.stargazers_count}
Forks: ${repo.forks_count}
Last Updated: ${new Date(repo.updated_at).toLocaleString()}
URL: ${repo.html_url}
									`.trim();
						vscode.window.showInformationMessage(details, { modal: true });
						break;
					}
				}
			}
		})
	);

	// Command to list GitHub repositories (legacy - now shows quick pick)
	context.subscriptions.push(
		vscode.commands.registerCommand('mirai-auth.listGitHubRepos', async () => {
			try {
				await vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: 'Fetching GitHub repositories...',
					cancellable: false
				}, async () => {
					const repos = await githubRepoService.getUserRepositories();

					if (repos.length === 0) {
						vscode.window.showInformationMessage('No repositories found');
						return;
					}

					// Create quick pick items
					interface RepoQuickPickItem extends vscode.QuickPickItem {
						repo: GitHubRepository;
					}

					const items: RepoQuickPickItem[] = repos.map(repo => ({
						label: `$(repo) ${repo.name}`,
						description: `${repo.private ? '🔒' : '🌐'} ${repo.owner.login}/${repo.name}`,
						detail: `${repo.description || 'No description'} | ⭐ ${repo.stargazers_count} | ${repo.language || 'Unknown'} | Updated: ${new Date(repo.updated_at).toLocaleDateString()}`,
						repo: repo
					}));

					const selected = await vscode.window.showQuickPick(items, {
						placeHolder: `Select a repository (${repos.length} repositories found)`,
						matchOnDescription: true,
						matchOnDetail: true
					});

					if (selected) {
						// Show actions for the selected repository
						const action = await vscode.window.showQuickPick([
							{ label: '$(globe) Open in Browser', value: 'open' },
							{ label: '$(cloud-download) Clone Repository', value: 'clone' },
							{ label: '$(clippy) Copy Clone URL (HTTPS)', value: 'copy-https' },
							{ label: '$(clippy) Copy Clone URL (SSH)', value: 'copy-ssh' },
							{ label: '$(info) Show Details', value: 'details' }
						], {
							placeHolder: `What do you want to do with ${selected.repo.name}?`
						});

						if (action) {
							switch (action.value) {
								case 'open':
									vscode.env.openExternal(vscode.Uri.parse(selected.repo.html_url));
									break;
								case 'clone':
									await githubRepoService.cloneRepository(selected.repo);
									break;
								case 'copy-https':
									await vscode.env.clipboard.writeText(selected.repo.clone_url);
									vscode.window.showInformationMessage('HTTPS clone URL copied to clipboard');
									break;
								case 'copy-ssh':
									await vscode.env.clipboard.writeText(selected.repo.ssh_url);
									vscode.window.showInformationMessage('SSH clone URL copied to clipboard');
									break;
								case 'details': {
									const details = `
Repository: ${selected.repo.full_name}
Description: ${selected.repo.description || 'None'}
Visibility: ${selected.repo.private ? 'Private' : 'Public'}
Language: ${selected.repo.language || 'Unknown'}
Stars: ${selected.repo.stargazers_count}
Forks: ${selected.repo.forks_count}
Last Updated: ${new Date(selected.repo.updated_at).toLocaleString()}
URL: ${selected.repo.html_url}
									`.trim();
									vscode.window.showInformationMessage(details, { modal: true });
									break;
								}
							}
						}
					}
				});
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to fetch repositories: ${error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('mirai-auth.signOut', async () => {
			try {
				const session = await vscode.authentication.getSession('mirai', [], { silent: true });
				if (session) {
					await miraiAuthProvider.removeSession(session.id);
					vscode.window.showInformationMessage('Signed out of Mirai');
				}
			} catch (error) {
				// No session to sign out
			}
		})
	);

	// Only register test commands in development mode
	const isProduction = process.env.MIRAI_PRODUCTION === 'true';

	if (!isProduction) {
		// Add test command to force the auth provider to show up
		context.subscriptions.push(
			vscode.commands.registerCommand('mirai-auth.test', async () => {
				try {
					const session = await vscode.authentication.getSession('mirai', [], { createIfNone: true });
				} catch (error) {
					vscode.window.showErrorMessage(`Mirai auth test failed: ${error}`);
				}
			})
		);

		// Add URI test command to check if URI handling works
		context.subscriptions.push(
			vscode.commands.registerCommand('mirai-auth.testUri', async () => {
				try {
					const testUri = vscode.Uri.parse(`${vscode.env.uriScheme}://mirai.mirai-auth/auth-callback?token=test123&state=teststate&user_id=testuser`);
					await miraiAuthProvider.handleCallback(testUri);
				} catch (error) {
					vscode.window.showErrorMessage(`URI handler test failed: ${error}`);
				}
			})
		);
	}
}

export function deactivate() { }
