import * as vscode from 'vscode';
import { FigmaApiService } from '../services/figmaApiService';

export class FigmaWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'mirai-figma-panel';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly figmaApi: FigmaApiService
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// Handle messages from the webview
		webviewView.webview.onDidReceiveMessage(
			message => {
				switch (message.type) {
					case 'openFile':
						this.openFigmaFile(message.fileKey);
						break;
					case 'importTokens':
						vscode.commands.executeCommand('mirai-figma.importDesignTokens');
						break;
					case 'generateCode':
						vscode.commands.executeCommand('mirai-figma.generateCode');
						break;
					case 'configureToken':
						this.openSettings();
						break;
					case 'authenticateOAuth':
						vscode.commands.executeCommand('mirai-figma.authenticateWithOAuth');
						break;
					case 'refreshFiles':
						vscode.commands.executeCommand('mirai-figma.refreshFiles');
						break;
					case 'clearToken':
						vscode.commands.executeCommand('mirai-figma.clearToken');
						break;
					case 'generateCodeWithChat':
						vscode.commands.executeCommand('mirai-figma.generateCodeWithChat');
						break;
					case 'analyzeTokensWithChat':
						vscode.commands.executeCommand('mirai-figma.analyzeDesignTokensWithChat');
						break;
					case 'reviewAccessibility':
						vscode.commands.executeCommand('mirai-figma.reviewAccessibilityWithChat');
						break;
					case 'sendToChat':
						vscode.commands.executeCommand('mirai-figma.sendDesignToChat');
						break;
				}
			},
			undefined,
			[]
		);

		// Update webview when configuration changes
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('mirai-figma')) {
				this.updateWebview();
			}
		});

		this.updateWebview();
	}

	public async show() {
		if (this._view) {
			this._view.show?.(true);
			// Update the UI state when showing
			this.updateUI();
		}
	}

	public updateUI() {
		if (this._view) {
			const isConfigured = this.figmaApi.isConfigured();
			this._view.webview.postMessage({
				type: 'update',
				isConfigured: isConfigured
			});
		}
	}

	private async updateWebview() {
		if (this._view) {
			this._view.webview.postMessage({
				type: 'update',
				isConfigured: this.figmaApi.isConfigured()
			});
		}
	}

	private openFigmaFile(fileKey: string) {
		const url = `https://www.figma.com/file/${fileKey}`;
		vscode.env.openExternal(vscode.Uri.parse(url));
	}

	private openSettings() {
		vscode.commands.executeCommand('workbench.action.openSettings', 'mirai-figma');
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleUri}" rel="stylesheet">
				<title>Mirai Figma</title>
			</head>
			<body>
				<div id="app">
					<div class="header">
						<h2>🎨 Mirai Figma</h2>
						<p>Seamlessly integrate Figma into your workflow</p>
						<div id="status-indicator" class="status-indicator" style="display: none;">
							<span id="status-text"></span>
						</div>
					</div>

					<div id="not-configured" class="section" style="display: none;">
						<div class="welcome">
							<div class="welcome-icon">🎨</div>
							<h3>Connect to Figma</h3>
							<p>Get started by connecting your Figma account</p>

							<div class="auth-options">
								<button id="oauth-btn" class="btn btn-primary">
									<span class="icon">🔐</span>
									Login with Figma
								</button>
							</div>
						</div>
					</div>

					<div id="configured" class="section" style="display: none;">
						<div class="main-actions">
							<div class="file-input">
								<input type="text" id="file-key-input" placeholder="Paste Figma file URL or key..." />
							</div>

							<div class="action-grid">
								<button id="send-to-chat-btn" class="action-card">
									<div class="card-icon">💬</div>
									<div class="card-content">
										<h4>Ask AI</h4>
										<p>Get insights about your design</p>
									</div>
								</button>

								<button id="generate-code-chat-btn" class="action-card">
									<div class="card-icon">🤖</div>
									<div class="card-content">
										<h4>Generate Code</h4>
										<p>Create components with AI</p>
									</div>
								</button>

								<button id="analyze-tokens-chat-btn" class="action-card">
									<div class="card-icon">🎨</div>
									<div class="card-content">
										<h4>Design Tokens</h4>
										<p>Extract and analyze tokens</p>
									</div>
								</button>

								<button id="review-accessibility-btn" class="action-card">
									<div class="card-icon">♿</div>
									<div class="card-content">
										<h4>Accessibility</h4>
										<p>Review for WCAG compliance</p>
									</div>
								</button>
							</div>

							<div class="secondary-actions">
								<button id="refresh-files-btn" class="btn btn-ghost">
									<span class="icon">🔄</span>
									Refresh
								</button>
								<button id="clear-token-btn" class="btn btn-ghost">
									<span class="icon">🗑️</span>
									Clear Token
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
