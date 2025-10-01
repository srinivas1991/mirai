import * as vscode from 'vscode';
import { FigmaApiService } from '../services/figmaApiService';

export class FigmaInspectorProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'mirai-figma-inspector';

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
					case 'openInFigma':
						if (message.url) {
							vscode.env.openExternal(vscode.Uri.parse(message.url));
						}
						break;
					case 'copyNodeId':
						vscode.env.clipboard.writeText(message.nodeId);
						vscode.window.showInformationMessage('Node ID copied to clipboard');
						break;
				}
			},
			undefined,
			[]
		);
	}

	public updateInspector(fileKey: string, nodeId?: string) {
		if (this._view) {
			this._view.webview.postMessage({
				type: 'updateInspector',
				fileKey,
				nodeId
			});
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'inspector.js'));
		const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'inspector.css'));

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleUri}" rel="stylesheet">
				<title>Design Inspector</title>
				<style>
					body {
						font-family: var(--vscode-font-family);
						font-size: var(--vscode-font-size);
						font-weight: var(--vscode-font-weight);
						color: var(--vscode-foreground);
						background-color: var(--vscode-editor-background);
						margin: 0;
						padding: 16px;
					}

					.inspector-container {
						display: flex;
						flex-direction: column;
						gap: 16px;
					}

					.property-group {
						background: var(--vscode-editor-inactiveSelectionBackground);
						border-radius: 6px;
						padding: 12px;
					}

					.property-group h3 {
						margin: 0 0 8px 0;
						font-size: 13px;
						font-weight: 600;
						color: var(--vscode-textLink-foreground);
					}

					.property {
						display: flex;
						justify-content: space-between;
						align-items: center;
						padding: 4px 0;
						border-bottom: 1px solid var(--vscode-widget-border);
					}

					.property:last-child {
						border-bottom: none;
					}

					.property-name {
						font-size: 12px;
						color: var(--vscode-descriptionForeground);
					}

					.property-value {
						font-size: 12px;
						font-family: var(--vscode-editor-font-family);
						color: var(--vscode-editor-foreground);
					}

					.color-preview {
						width: 16px;
						height: 16px;
						border-radius: 2px;
						border: 1px solid var(--vscode-widget-border);
						display: inline-block;
						margin-right: 8px;
					}

					.btn {
						background: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						border: none;
						padding: 6px 12px;
						border-radius: 4px;
						cursor: pointer;
						font-size: 12px;
					}

					.btn:hover {
						background: var(--vscode-button-hoverBackground);
					}

					.no-selection {
						text-align: center;
						color: var(--vscode-descriptionForeground);
						font-style: italic;
						padding: 32px;
					}
				</style>
			</head>
			<body>
				<div class="inspector-container">
					<div id="no-selection" class="no-selection">
						Select a design element to inspect its properties
					</div>

					<div id="inspector-content" style="display: none;">
						<div class="property-group">
							<h3>📐 Dimensions</h3>
							<div class="property">
								<span class="property-name">Width</span>
								<span class="property-value" id="width">-</span>
							</div>
							<div class="property">
								<span class="property-name">Height</span>
								<span class="property-value" id="height">-</span>
							</div>
							<div class="property">
								<span class="property-name">X Position</span>
								<span class="property-value" id="x">-</span>
							</div>
							<div class="property">
								<span class="property-name">Y Position</span>
								<span class="property-value" id="y">-</span>
							</div>
						</div>

						<div class="property-group">
							<h3>🎨 Appearance</h3>
							<div id="fills-container"></div>
							<div id="strokes-container"></div>
							<div id="effects-container"></div>
						</div>

						<div class="property-group">
							<h3>📝 Typography</h3>
							<div id="typography-container"></div>
						</div>

						<div class="property-group">
							<h3>🔗 Actions</h3>
							<button class="btn" onclick="openInFigma()">Open in Figma</button>
							<button class="btn" onclick="copyNodeId()">Copy Node ID</button>
						</div>
					</div>
				</div>

				<script src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

