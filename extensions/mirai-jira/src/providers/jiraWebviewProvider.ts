import * as vscode from 'vscode';
import { JiraApiService } from '../services/jiraApiService';

export class JiraWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'mirai-jira-ai';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private jiraApi: JiraApiService
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				vscode.Uri.joinPath(this._extensionUri, 'media')
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(async (data) => {
			switch (data.type) {
				case 'authenticate':
					await this.authenticate();
					break;
				case 'authenticateOAuth':
					await vscode.commands.executeCommand('mirai-jira.authenticateWithOAuth');
					break;
				case 'clearToken':
					this.clearToken();
					break;
				case 'refreshData':
					await this.refreshData();
					break;
				case 'createIssue':
					await this.createIssue(data.issueData);
					break;
				case 'sendToChat':
					if (data.issueKey) {
						await vscode.commands.executeCommand('mirai-jira.sendIssueToChat', data.issueKey);
					}
					break;
				case 'analyzeIssue':
					if (data.issueKey) {
						await vscode.commands.executeCommand('mirai-jira.analyzeIssueWithChat', data.issueKey);
					}
					break;
				case 'generateCode':
					if (data.issueKey) {
						await vscode.commands.executeCommand('mirai-jira.generateCodeFromIssue', data.issueKey);
					}
					break;
				case 'openIssue':
					if (data.issueKey) {
						const url = this.jiraApi.getIssueUrl(data.issueKey);
						vscode.env.openExternal(vscode.Uri.parse(url));
					}
					break;
			}
		});

		// Update view when configuration changes
		vscode.workspace.onDidChangeConfiguration((e) => {
			if (e.affectsConfiguration('mirai-jira')) {
				this.updateView();
			}
		});

		this.updateView();
	}

	public show() {
		if (this._view) {
			this._view.show(true);
		}
	}

	private async authenticate() {
		try {
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
			this.updateViewStatus('Connecting to Jira...');

			const isConnected = await this.jiraApi.testConnection();
			if (isConnected) {
				vscode.window.showInformationMessage('Successfully connected to Jira!');
				await vscode.commands.executeCommand('setContext', 'mirai-jira:authenticated', true);
				this.updateView();
			} else {
				vscode.window.showErrorMessage('Failed to connect to Jira. Please check your credentials.');
				this.clearToken();
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Authentication failed: ${error}`);
			this.clearToken();
		}
	}

	private clearToken() {
		this.jiraApi.clearConfiguration();
		vscode.commands.executeCommand('setContext', 'mirai-jira:authenticated', false);
		this.updateView();
	}

	private async refreshData() {
		try {
			this.updateViewStatus('Refreshing...');
			await vscode.commands.executeCommand('mirai-jira.refreshIssues');
			this.updateView();
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to refresh: ${error}`);
		}
	}

	private async createIssue(issueData: any) {
		try {
			const issue = await this.jiraApi.createIssue(issueData);
			vscode.window.showInformationMessage(`Issue ${issue.key} created successfully!`);
			await this.refreshData();
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create issue: ${error}`);
		}
	}

	private updateView() {
		if (this._view) {
			this._view.webview.html = this._getHtmlForWebview(this._view.webview);
		}
	}

	private updateViewStatus(status: string) {
		if (this._view) {
			this._view.webview.postMessage({
				type: 'updateStatus',
				status: status
			});
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

		const isConfigured = this.jiraApi.isConfigured();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleUri}" rel="stylesheet">
				<title>Mirai Jira</title>
			</head>
			<body>
				<div id="app">
					<div class="header">
						<h2>🎯 Mirai Jira</h2>
						<p>Seamlessly integrate Jira into your workflow</p>
						<div id="status-indicator" class="status-indicator" style="display: none;">
							<span id="status-text"></span>
						</div>
					</div>

					<div id="not-configured" class="section" style="display: ${isConfigured ? 'none' : 'block'};">
						<div class="welcome">
							<div class="welcome-icon">🎯</div>
							<h3>Connect to Jira</h3>
							<p>Get started by connecting your Jira account</p>

							<div class="auth-options">
								<button id="oauth-btn" class="btn btn-primary">
									<span class="icon">🔐</span>
									Login with Jira
								</button>
								<button id="auth-btn" class="btn btn-secondary">
									<span class="icon">🔑</span>
									Setup Personal Token
								</button>
							</div>

							<div class="help-text">
								<p><strong>🔐 Login with Jira</strong> (Recommended)</p>
								<ul>
									<li>One-click authentication in your browser</li>
									<li>No manual setup required</li>
									<li>Secure OAuth 2.0 flow</li>
								</ul>

								<p><strong>🔑 Setup Personal Token</strong></p>
								<ul>
									<li>Your Jira instance URL</li>
									<li>Your email address</li>
									<li>An API token from Atlassian</li>
								</ul>
								<a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank">
									Generate API Token
								</a>
							</div>
						</div>
					</div>

					<div id="configured" class="section" style="display: ${isConfigured ? 'block' : 'none'};">
						<div class="main-actions">
							<div class="search-section">
								<input type="text" id="issue-search" placeholder="Search issues by key or text..." />
								<button id="search-btn" class="btn btn-secondary">
									<span class="icon">🔍</span>
									Search
								</button>
							</div>

							<div class="action-grid">
								<button id="create-issue-btn" class="action-card">
									<div class="card-icon">➕</div>
									<div class="card-content">
										<h4>Create Issue</h4>
										<p>Create a new Jira issue</p>
									</div>
								</button>


								<button id="generate-tests-btn" class="action-card">
									<div class="card-icon">🧪</div>
									<div class="card-content">
										<h4>Generate Tests</h4>
										<p>Create test cases from issues</p>
									</div>
								</button>
							</div>

							<div class="quick-actions">
								<h4>Quick Actions</h4>
								<div class="quick-action-buttons">
									<button id="my-issues-btn" class="btn btn-ghost">
										<span class="icon">👤</span>
										My Issues
									</button>
									<button id="recent-issues-btn" class="btn btn-ghost">
										<span class="icon">⏰</span>
										Recent
									</button>
									<button id="in-progress-btn" class="btn btn-ghost">
										<span class="icon">🔄</span>
										In Progress
									</button>
								</div>
							</div>

							<div class="secondary-actions">
								<button id="refresh-btn" class="btn btn-ghost">
									<span class="icon">🔄</span>
									Refresh
								</button>
								<button id="clear-token-btn" class="btn btn-ghost">
									<span class="icon">🗑️</span>
									Disconnect
								</button>
							</div>
						</div>
					</div>

					<!-- Issue Quick View Modal -->
					<div id="issue-modal" class="modal" style="display: none;">
						<div class="modal-content">
							<div class="modal-header">
								<h3 id="issue-title">Issue Details</h3>
								<button id="close-modal" class="close-btn">&times;</button>
							</div>
							<div class="modal-body" id="issue-details">
								<!-- Issue details will be populated here -->
							</div>
							<div class="modal-footer">
								<button id="send-to-chat-btn" class="btn btn-primary">
									<span class="icon">💬</span>
									Send to Chat
								</button>
								<button id="analyze-issue-btn" class="btn btn-secondary">
									<span class="icon">🔍</span>
									Analyze
								</button>
								<button id="generate-code-btn" class="btn btn-secondary">
									<span class="icon">🤖</span>
									Generate Code
								</button>
								<button id="open-jira-btn" class="btn btn-ghost">
									<span class="icon">🔗</span>
									Open in Jira
								</button>
							</div>
						</div>
					</div>
				</div>

				<script src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}
