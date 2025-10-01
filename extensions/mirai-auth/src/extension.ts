import * as vscode from 'vscode';
import { MiraiAuthenticationProvider } from './miraiAuthProvider';

export function activate(context: vscode.ExtensionContext) {
	console.log('🚀 Mirai Authentication Provider activating... - BUILD: 2024-09-24-22:00');
	console.log('🔐 This will register Mirai with the VS Code account icon menu');

	const miraiAuthProvider = new MiraiAuthenticationProvider(context);

	// Register the authentication provider
	console.log('🔄 Registering Mirai authentication provider with ID "mirai"...');
	const disposable = vscode.authentication.registerAuthenticationProvider(
		'mirai',
		'Mirai',
		miraiAuthProvider,
		{ supportsMultipleAccounts: false }
	);

	context.subscriptions.push(disposable);
	console.log('✅ Mirai authentication provider registered successfully!');

	// Register URI handler for OAuth callbacks
	const uriHandler = vscode.window.registerUriHandler({
		handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
			console.log('🔗 [MiraiAuth] URI handler called:', uri.toString());

			if (uri.path === '/auth-callback') {
				return miraiAuthProvider.handleCallback(uri);
			}

			console.warn('🚨 [MiraiAuth] Unhandled URI:', uri.toString());
		}
	});
	context.subscriptions.push(uriHandler);

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
					console.log('🧪 Testing Mirai auth provider...');
					const session = await vscode.authentication.getSession('mirai', [], { createIfNone: true });
					console.log('✅ Auth test successful:', session);
				} catch (error) {
					console.error('❌ Auth test failed:', error);
					vscode.window.showErrorMessage(`Mirai auth test failed: ${error}`);
				}
			})
		);

		// Add URI test command to check if URI handling works
		context.subscriptions.push(
			vscode.commands.registerCommand('mirai-auth.testUri', async () => {
				try {
					console.log('🔗 Testing URI handler with fake callback...');
					const testUri = vscode.Uri.parse('mirai://mirai.mirai-auth/auth-callback?token=test123&state=teststate&user_id=testuser');
					await miraiAuthProvider.handleCallback(testUri);
					console.log('✅ URI handler test completed');
				} catch (error) {
					console.error('❌ URI handler test failed:', error);
					vscode.window.showErrorMessage(`URI handler test failed: ${error}`);
				}
			})
		);
	}

	console.log('✅ Mirai Authentication Provider activated');
	console.log('👤 CHECK: Look for "Accounts" section in BOTTOM-LEFT corner (above "Manage" gear button)');
	console.log('🔍 STEPS: Look in Accounts section → Should see "Mirai" as an option');
	console.log('⚠️  NOTE: If you don\'t see it, the extension may not be loaded yet');

	// Force the auth provider to be available immediately
	console.log('🔧 Forcing authentication provider registration...');
}

export function deactivate() {
	console.log('🔄 Mirai Authentication Provider deactivated');
}
