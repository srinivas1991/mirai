import * as vscode from 'vscode';
import * as path from 'path';

export interface ConnectionConfig {
	id: string;
	name: string;
	description: string;
	icon: string;
	status: 'connected' | 'disconnected' | 'error';
	lastConnected?: string;
	fields: ConnectionField[];
	testCommand?: string;
	actions: ConnectionAction[];
}

export interface ConnectionField {
	key: string;
	label: string;
	type: 'text' | 'password' | 'url' | 'token';
	required: boolean;
	placeholder?: string;
	description?: string;
	value?: string;
}

export interface ConnectionAction {
	id: string;
	label: string;
	command: string;
	icon: string;
	primary?: boolean;
}

export class ConnectionsWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'mirai-connections';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
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
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'saveConnection':
					this.handleSaveConnection(data.connectionId, data.fields);
					break;
				case 'testConnection':
					this.handleTestConnection(data.connectionId);
					break;
				case 'disconnect':
					this.handleDisconnect(data.connectionId);
					break;
				case 'reconnect':
					this.handleReconnect(data.connectionId);
					break;
				case 'refresh':
					this.refresh();
					break;
				case 'executeCommand':
					vscode.commands.executeCommand(data.command);
					break;
				case 'openUrl':
					vscode.env.openExternal(vscode.Uri.parse(data.url));
					break;
				case 'showQuickSettings':
					this.handleQuickSettings(data.connectionId);
					break;
			}
		});

		this.refresh();
	}

	public refresh() {
		if (this._view) {
			this._view.webview.postMessage({
				type: 'refreshConnections',
				connections: this.getConnections()
			});
		}
	}

	private getConnections(): ConnectionConfig[] {
		return [
			this.getJiraConnection(),
			this.getFigmaConnection(),
			this.getGitHubConnection(),
			// Future: this.getSlackConnection(),
			// Future: this.getNotionConnection(),
		];
	}

	private getJiraConnection(): ConnectionConfig {
		const config = vscode.workspace.getConfiguration('mirai-jira');
		const oauthToken = config.get<string>('oauthAccessToken');
		const apiToken = config.get<string>('apiToken');
		const hasConnection = !!(oauthToken || apiToken);

		return {
			id: 'jira',
			name: 'Jira',
			description: 'Connect to Jira for issue management and project tracking',
			icon: 'jira',
			status: hasConnection ? 'connected' : 'disconnected',
			lastConnected: hasConnection ? config.get<string>('lastConnected') : undefined,
			fields: [
				{
					key: 'baseUrl',
					label: 'Jira Instance URL',
					type: 'url',
					required: true,
					placeholder: 'https://yourcompany.atlassian.net',
					description: 'Your Jira instance URL',
					value: config.get<string>('baseUrl') || config.get<string>('siteUrl')
				},
				{
					key: 'email',
					label: 'Email',
					type: 'text',
					required: true,
					placeholder: 'user@company.com',
					description: 'Your Jira account email',
					value: config.get<string>('email')
				},
				{
					key: 'apiToken',
					label: 'API Token',
					type: 'token',
					required: true,
					placeholder: 'Your Jira API token',
					description: 'Generate from Atlassian Account Settings',
					value: config.get<string>('apiToken') ? '••••••••' : ''
				}
			],
			testCommand: 'mirai-jira.testConnection',
			actions: [
				{
					id: 'oauth',
					label: 'Connect with OAuth',
					command: 'mirai-jira.authenticateWithOAuth',
					icon: '🔐',
					primary: true
				}
			]
		};
	}

	private getFigmaConnection(): ConnectionConfig {
		const config = vscode.workspace.getConfiguration('mirai-figma');
		const accessToken = config.get<string>('accessToken');
		const hasConnection = !!accessToken;

		return {
			id: 'figma',
			name: 'Figma',
			description: 'Connect to Figma for design file access and collaboration',
			icon: 'figma',
			status: hasConnection ? 'connected' : 'disconnected',
			lastConnected: hasConnection ? config.get<string>('lastConnected') : undefined,
			fields: [
				{
					key: 'accessToken',
					label: 'Personal Access Token',
					type: 'token',
					required: true,
					placeholder: 'Your Figma personal access token',
					description: 'Generate from Figma Account Settings',
					value: accessToken ? '••••••••' : ''
				}
			],
			testCommand: 'mirai-figma.testConnection',
			actions: [
				{
					id: 'oauth',
					label: 'Connect with OAuth',
					command: 'mirai-figma.authenticateWithOAuth',
					icon: '🔐',
					primary: true
				},
				{
					id: 'configure',
					label: 'Open Figma Panel',
					command: 'mirai-figma.openFigmaPanel',
					icon: '⚙️'
				}
			]
		};
	}

	private getGitHubConnection(): ConnectionConfig {
		const config = vscode.workspace.getConfiguration('mirai-jira');
		const githubToken = config.get<string>('githubToken');
		const hasConnection = !!githubToken;

		return {
			id: 'github',
			name: 'GitHub',
			description: 'Connect to GitHub for repository integration and PR management',
			icon: 'github',
			status: hasConnection ? 'connected' : 'disconnected',
			lastConnected: hasConnection ? new Date().toISOString() : undefined,
			fields: [
				{
					key: 'githubToken',
					label: 'Personal Access Token',
					type: 'token',
					required: true,
					placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
					description: 'GitHub token with repo access',
					value: githubToken ? '••••••••' : ''
				}
			],
			testCommand: 'mirai-jira.testGitHubConnection',
			actions: [
				{
					id: 'configure',
					label: 'Configure Token',
					command: 'mirai-jira.configureGitHubToken',
					icon: '🔗'
				},
				{
					id: 'generate',
					label: 'Generate Token',
					command: 'vscode.open',
					icon: '🔗',
					primary: false
				}
			]
		};
	}

	private async handleSaveConnection(connectionId: string, fields: Record<string, string>) {
		try {
			const config = vscode.workspace.getConfiguration(`mirai-${connectionId}`);

			for (const [key, value] of Object.entries(fields)) {
				if (value && value !== '••••••••') {
					await config.update(key, value, vscode.ConfigurationTarget.Global);
				}
			}

			// Update last connected timestamp
			await config.update('lastConnected', new Date().toISOString(), vscode.ConfigurationTarget.Global);

			vscode.window.showInformationMessage(`${connectionId} connection saved successfully`);
			this.refresh();
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to save ${connectionId} connection: ${error}`);
		}
	}

	private async handleTestConnection(connectionId: string) {
		try {
			// Execute the test command for the specific connection
			await vscode.commands.executeCommand(`mirai-${connectionId}.testConnection`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to test ${connectionId} connection: ${error}`);
		}
	}

	private async handleDisconnect(connectionId: string) {
		const result = await vscode.window.showWarningMessage(
			`Disconnect from ${connectionId}? This will remove all stored credentials.`,
			'Disconnect',
			'Cancel'
		);

		if (result === 'Disconnect') {
			const config = vscode.workspace.getConfiguration(`mirai-${connectionId}`);

			// Clear connection-specific settings
			const settingsToClear = ['accessToken', 'apiToken', 'githubToken', 'oauthAccessToken', 'email', 'baseUrl'];

			for (const setting of settingsToClear) {
				try {
					await config.update(setting, undefined, vscode.ConfigurationTarget.Global);
				} catch (error) {
					// Ignore errors for settings that don't exist
				}
			}

			vscode.window.showInformationMessage(`Disconnected from ${connectionId}`);
			this.refresh();
		}
	}

	private async handleReconnect(connectionId: string) {
		// Trigger the primary connection action
		const connections = this.getConnections();
		const connection = connections.find(c => c.id === connectionId);

		if (connection && connection.actions.length > 0) {
			const primaryAction = connection.actions.find(a => a.primary) || connection.actions[0];
			await vscode.commands.executeCommand(primaryAction.command);
		}
	}

	private async handleQuickSettings(connectionId: string) {
		// For now, just show the configuration for the specific service
		const connections = this.getConnections();
		const connection = connections.find(c => c.id === connectionId);

		if (connection) {
			const configAction = connection.actions.find(a => a.id === 'configure');
			if (configAction) {
				if (configAction.command === 'vscode.open') {
					// Special handling for URL opening commands
					if (connectionId === 'github') {
						await vscode.env.openExternal(vscode.Uri.parse('https://github.com/settings/tokens/new?description=Mirai%20VS%20Code&scopes=repo,read:user'));
					}
				} else {
					await vscode.commands.executeCommand(configAction.command);
				}
			}
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Get resource URIs
		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));
		const scriptMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'connections.js'));

		// Get nonce for security
		const nonce = getNonce();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleMainUri}" rel="stylesheet">
				<title>Connections</title>
				<style>
					/* Simple icon fallbacks using Unicode symbols */
					.icon-jira::before { content: "📋"; }
					.icon-figma::before { content: "🎨"; }
					.icon-github::before { content: "⚡"; }
					.icon-settings::before { content: "⚙️"; }
					.icon-refresh::before { content: "🔄"; }
					.icon-plug::before { content: "🔌"; }

					.connection-icon {
						font-size: 16px !important;
						line-height: 1 !important;
					}
				</style>
			</head>
			<body>
				<div class="connections-compact">
					<div class="connections-header">
						<h2><span class="icon-plug"></span> Connections</h2>
						<button id="refresh-btn" class="btn-icon" title="Refresh">
							<span class="icon-refresh"></span>
						</button>
					</div>

					<div id="connections-list" class="connections-simple-list">
						<!-- Connections will be populated by JavaScript -->
					</div>
				</div>

				<script nonce="${nonce}" src="${scriptMainUri}"></script>
			</body>
			</html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
