import * as vscode from 'vscode';
import { FigmaApiService } from './services/figmaApiService';
import { FigmaFileProvider } from './providers/figmaFileProvider';
import { FigmaWebviewProvider } from './providers/figmaWebviewProvider';
import { FigmaInspectorProvider } from './providers/figmaInspectorProvider';
import { DesignTokenExtractor } from './services/designTokenExtractor';
import { CodeGenerator } from './services/codeGenerator';
import { FigmaOAuthService } from './services/figmaOAuthService';
import { FigmaChatService } from './services/figmaChatService';

export function activate(context: vscode.ExtensionContext) {
	console.log('Mirai Figma extension is now active!');

	// Initialize services
	const figmaApi = new FigmaApiService();
	const designTokenExtractor = new DesignTokenExtractor();
	const codeGenerator = new CodeGenerator();
	const figmaChatService = new FigmaChatService(figmaApi);

	// Initialize providers
	const figmaFileProvider = new FigmaFileProvider(figmaApi);
	const figmaWebviewProvider = new FigmaWebviewProvider(context.extensionUri, figmaApi);
	const figmaInspectorProvider = new FigmaInspectorProvider(context.extensionUri, figmaApi);

	// Set up context keys for conditional views
	const updateContextKeys = () => {
		const isAuthenticated = figmaApi.isConfigured();
		vscode.commands.executeCommand('setContext', 'mirai-figma:authenticated', isAuthenticated);
		vscode.commands.executeCommand('setContext', 'mirai-figma:authenticating', false);
		vscode.commands.executeCommand('setContext', 'mirai-figma:hasOpenFile', false); // TODO: implement
		vscode.commands.executeCommand('setContext', 'mirai-figma:noFiles', false); // TODO: implement based on file count
	};

	// Initialize context
	updateContextKeys();

	// Register tree data provider
	vscode.window.createTreeView('mirai-figma-files', {
		treeDataProvider: figmaFileProvider,
		showCollapseAll: true
	});

	// Register webview providers for multiple views
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('mirai-figma-ai', figmaWebviewProvider, {
			webviewOptions: {
				retainContextWhenHidden: true
			}
		}),
		vscode.window.registerWebviewViewProvider('mirai-figma-inspector', figmaInspectorProvider, {
			webviewOptions: {
				retainContextWhenHidden: true
			}
		})
	);

	// Register commands
	const commands = [
		vscode.commands.registerCommand('mirai-figma.openFigmaPanel', async () => {
			await figmaWebviewProvider.show();
		}),

		vscode.commands.registerCommand('mirai-figma.importDesignTokens', async () => {
			const fileKey = await promptForFileKey();
			if (fileKey) {
				try {
					vscode.window.withProgress({
						location: vscode.ProgressLocation.Notification,
						title: "Importing design tokens from Figma...",
						cancellable: false
					}, async (progress) => {
						const tokens = await designTokenExtractor.extractTokens(fileKey);
						await saveDesignTokens(tokens);
						vscode.window.showInformationMessage('Design tokens imported successfully!');
					});
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to import design tokens: ${error}`);
				}
			}
		}),

		vscode.commands.registerCommand('mirai-figma.generateCode', async () => {
			const fileKey = await promptForFileKey();
			const nodeId = await promptForNodeId();

			if (fileKey && nodeId) {
				try {
					vscode.window.withProgress({
						location: vscode.ProgressLocation.Notification,
						title: "Generating code from Figma design...",
						cancellable: false
					}, async (progress) => {
						const code = await codeGenerator.generateFromNode(fileKey, nodeId);
						await showGeneratedCode(code);
					});
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to generate code: ${error}`);
				}
			}
		}),

		vscode.commands.registerCommand('mirai-figma.refreshFiles', async () => {
			await figmaFileProvider.refresh();
			vscode.window.showInformationMessage('Figma files refreshed!');
		}),

		vscode.commands.registerCommand('mirai-figma.authenticateWithOAuth', async () => {
			try {
				const oauthService = new FigmaOAuthService();

				if (!oauthService.isConfigured()) {
					vscode.window.showErrorMessage(
						'Figma OAuth is not configured in this build. Please contact support or check documentation for setup instructions.'
					);
					return;
				}

				// Set authenticating state
				vscode.commands.executeCommand('setContext', 'mirai-figma:authenticating', true);

				vscode.window.withProgress({
					location: vscode.ProgressLocation.Notification,
					title: "Authenticating with Figma...",
					cancellable: false
				}, async (progress) => {
					progress.report({ message: "Opening browser for authentication..." });

					try {
						const token = await oauthService.authenticate();

						// Debug logging for received token
						console.log('[Figma OAuth Debug] Token received in extension command:', {
							tokenPrefix: token ? token.substring(0, 10) + '...' : 'undefined',
							tokenLength: token ? token.length : 0,
							startsWithFigd: token ? token.startsWith('figd_') : false,
							tokenType: typeof token
						});

						// Save the token
						const config = vscode.workspace.getConfiguration('mirai-figma');
						await config.update('accessToken', token, vscode.ConfigurationTarget.Global);

						// Verify what was actually saved
						const savedToken = config.get('accessToken');
						console.log('[Figma OAuth Debug] Token after saving to config:', {
							savedTokenPrefix: savedToken ? (savedToken as string).substring(0, 10) + '...' : 'undefined',
							savedTokenLength: savedToken ? (savedToken as string).length : 0,
							savedStartsWithFigd: savedToken ? (savedToken as string).startsWith('figd_') : false
						});

						// Update context keys
						updateContextKeys();

						vscode.window.showInformationMessage('🎉 OAuth authentication successful!');

						// Refresh the file provider
						await figmaFileProvider.refresh();
					} catch (error: any) {
						vscode.commands.executeCommand('setContext', 'mirai-figma:authenticating', false);
						vscode.window.showErrorMessage(`OAuth authentication failed: ${error.message}`);
					}
				});
			} catch (error) {
				vscode.commands.executeCommand('setContext', 'mirai-figma:authenticating', false);
				vscode.window.showErrorMessage(`Authentication failed: ${error}`);
			}
		}),

		// Token management command
		vscode.commands.registerCommand('mirai-figma.clearToken', async () => {
			try {
				const config = vscode.workspace.getConfiguration('mirai-figma');
				await config.update('accessToken', '', vscode.ConfigurationTarget.Global);

				// Update context keys
				updateContextKeys();

				vscode.window.showInformationMessage('Figma token cleared. You can now authenticate again.');

				// Update the webview to show not-configured state
				figmaWebviewProvider.updateUI();

				// Refresh file provider (which will show empty state)
				await figmaFileProvider.refresh();
			} catch (error: any) {
				vscode.window.showErrorMessage(`Failed to clear token: ${error.message}`);
			}
		}),

		// Chat integration commands
		vscode.commands.registerCommand('mirai-figma.generateCodeWithChat', async () => {
			const fileKey = await promptForFileKey();
			if (fileKey) {
				const nodeId = await promptForNodeId();
				const config = vscode.workspace.getConfiguration('mirai-figma');
				const framework = config.get('codeGeneration.framework', 'react');

				await figmaChatService.generateCodeWithChat(fileKey, nodeId, framework);
			}
		}),

		vscode.commands.registerCommand('mirai-figma.analyzeDesignTokensWithChat', async () => {
			const fileKey = await promptForFileKey();
			if (fileKey) {
				await figmaChatService.analyzeDesignTokensWithChat(fileKey);
			}
		}),

		vscode.commands.registerCommand('mirai-figma.reviewAccessibilityWithChat', async () => {
			const fileKey = await promptForFileKey();
			if (fileKey) {
				const nodeId = await promptForNodeId();
				await figmaChatService.reviewAccessibilityWithChat(fileKey, nodeId);
			}
		}),

		vscode.commands.registerCommand('mirai-figma.sendDesignToChat', async () => {
			const fileKey = await promptForFileKey();
			if (fileKey) {
				const nodeId = await promptForNodeId();
				const userPrompt = await vscode.window.showInputBox({
					prompt: 'What would you like to ask about this design?',
					placeHolder: 'e.g., How can I improve this component?'
				});

				try {
					const file = await figmaApi.getFile(fileKey);
					let targetNode;
					if (nodeId) {
						// Find the specific node
						const findNode = (node: any): any => {
							if (node.id === nodeId) return node;
							if (node.children) {
								for (const child of node.children) {
									const found = findNode(child);
									if (found) return found;
								}
							}
							return null;
						};
						targetNode = findNode(file.document);
					}

					const designContext = {
						fileKey,
						fileName: file.name,
						nodeId,
						nodeName: targetNode?.name,
						designData: targetNode || file.document
					};

					await figmaChatService.sendDesignToChat(designContext, userPrompt);
				} catch (error) {
					vscode.window.showErrorMessage(`Failed to send design to chat: ${error}`);
				}
			}
		})
	];

	context.subscriptions.push(...commands);

	// Set context for when extension is enabled
	vscode.commands.executeCommand('setContext', 'mirai-figma:enabled', true);

	// Auto-refresh on startup if enabled
	const config = vscode.workspace.getConfiguration('mirai-figma');
	if (config.get('autoRefresh')) {
		figmaFileProvider.refresh();
	}
}

export function deactivate() {
	vscode.commands.executeCommand('setContext', 'mirai-figma:enabled', false);
}

async function promptForFileKey(): Promise<string | undefined> {
	return await vscode.window.showInputBox({
		prompt: 'Enter Figma file key (from the URL)',
		placeHolder: 'e.g., ABC123DEF456',
		validateInput: (value) => {
			if (!value || value.trim().length === 0) {
				return 'File key is required';
			}
			return null;
		}
	});
}

async function promptForNodeId(): Promise<string | undefined> {
	return await vscode.window.showInputBox({
		prompt: 'Enter Figma node ID (optional - leave empty for entire file)',
		placeHolder: 'e.g., 123:456'
	});
}

async function saveDesignTokens(tokens: any) {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		throw new Error('No workspace folder found');
	}

	const tokensPath = vscode.Uri.joinPath(workspaceFolder.uri, 'design-tokens.json');
	const tokensContent = JSON.stringify(tokens, null, 2);

	await vscode.workspace.fs.writeFile(tokensPath, Buffer.from(tokensContent));

	// Open the generated file
	const document = await vscode.workspace.openTextDocument(tokensPath);
	await vscode.window.showTextDocument(document);
}

async function showGeneratedCode(code: string) {
	const document = await vscode.workspace.openTextDocument({
		content: code,
		language: 'typescript'
	});
	await vscode.window.showTextDocument(document);
}
