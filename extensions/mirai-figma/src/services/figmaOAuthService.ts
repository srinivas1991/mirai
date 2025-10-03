import * as vscode from 'vscode';
import axios from 'axios';

export interface FigmaOAuthConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	scope: string;
}

export class FigmaOAuthService {
	private static readonly FIGMA_AUTH_URL = 'https://www.figma.com/oauth';
	private static readonly FIGMA_TOKEN_URL = 'https://api.figma.com/v1/oauth/token';
	private static readonly DEFAULT_SCOPE = 'file_read';

	private uriHandler?: vscode.Disposable;

	constructor(private config?: FigmaOAuthConfig) { }

	private getConfig(): FigmaOAuthConfig {
		if (this.config) {
			return this.config;
		}

		// System-level OAuth configuration - hidden from users
		let oauthConfig;
		try {
			// Try to load from config file (for development/deployment)
			oauthConfig = require('../../oauth.config.js');
		} catch (error) {
			// Fallback to environment variables or defaults
			// Note: FIGMA_REDIRECT_URI is not used from env as we generate it dynamically
			oauthConfig = {
				FIGMA_CLIENT_ID: process.env.FIGMA_CLIENT_ID || 'YOUR_FIGMA_CLIENT_ID_HERE',
				FIGMA_CLIENT_SECRET: process.env.FIGMA_CLIENT_SECRET || 'YOUR_FIGMA_CLIENT_SECRET_HERE',
				FIGMA_REDIRECT_URI: '' // Will be generated dynamically
			};
		}

		return {
			clientId: oauthConfig.FIGMA_CLIENT_ID,
			clientSecret: oauthConfig.FIGMA_CLIENT_SECRET,
			redirectUri: oauthConfig.FIGMA_REDIRECT_URI,
			scope: FigmaOAuthService.DEFAULT_SCOPE
		};
	}

	isConfigured(): boolean {
		const config = this.getConfig();
		// Check if system credentials are properly set
		return !!(
			config.clientId &&
			config.clientSecret &&
			config.clientId !== 'YOUR_FIGMA_CLIENT_ID_HERE' &&
			config.clientSecret !== 'YOUR_FIGMA_CLIENT_SECRET_HERE'
		);
	}

	async authenticate(): Promise<string> {
		const config = this.getConfig();
		if (!this.isConfigured()) {
			throw new Error('OAuth not configured. Please set CLIENT_ID and CLIENT_SECRET first.');
		}

		// Generate redirect URI dynamically using vscode.env.asExternalUri
		const callbackUri = await vscode.env.asExternalUri(vscode.Uri.parse(`${vscode.env.uriScheme}://mirai.mirai-figma/oauth-callback`));
		config.redirectUri = callbackUri.toString(true);

		return new Promise((resolve, reject) => {
			// Register URI handler for OAuth callback
			this.uriHandler = vscode.window.registerUriHandler({
				handleUri: async (uri: vscode.Uri) => {
					try {
						// Parse the callback URI
						const query = new URLSearchParams(uri.query);
						const code = query.get('code');
						const error = query.get('error');
						const state = query.get('state');

						// Clean up the handler
						this.cleanup();

						if (error) {
							reject(new Error(`OAuth error: ${error}`));
							return;
						}

						if (!code) {
							reject(new Error('No authorization code received'));
							return;
						}

						// Verify state parameter (optional but recommended)
						if (state !== 'mirai-figma-auth') {
							reject(new Error('Invalid state parameter'));
							return;
						}

						// Exchange code for access token
						const token = await this.exchangeCodeForToken(code);
						resolve(token);
					} catch (err) {
						this.cleanup();
						reject(err);
					}
				}
			});

			// Open the authorization URL in the browser
			const authUrl = this.buildAuthUrl();
			vscode.env.openExternal(vscode.Uri.parse(authUrl));

			// Set a timeout for the authentication process (5 minutes)
			setTimeout(() => {
				this.cleanup();
				reject(new Error('Authentication timed out'));
			}, 5 * 60 * 1000);
		});
	}

	private buildAuthUrl(): string {
		const config = this.getConfig();
		const params = new URLSearchParams({
			client_id: config.clientId,
			redirect_uri: config.redirectUri,
			scope: config.scope,
			response_type: 'code',
			state: 'mirai-figma-auth'
		});

		return `${FigmaOAuthService.FIGMA_AUTH_URL}?${params.toString()}`;
	}

	private async exchangeCodeForToken(code: string): Promise<string> {
		const config = this.getConfig();
		try {
			// Prepare form data as required by OAuth2 specification
			const formData = new URLSearchParams();
			formData.append('client_id', config.clientId);
			formData.append('client_secret', config.clientSecret);
			formData.append('redirect_uri', config.redirectUri);
			formData.append('code', code);
			formData.append('grant_type', 'authorization_code');

			const response = await axios.post(FigmaOAuthService.FIGMA_TOKEN_URL, formData, {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				}
			});

			const data = response.data;

			if (data.error) {
				throw new Error(`Token exchange error: ${data.error}`);
			}

			// Debug logging for token format
			console.log('[Figma OAuth Debug] Received token from Figma API:', {
				tokenPrefix: data.access_token ? data.access_token.substring(0, 10) + '...' : 'undefined',
				tokenLength: data.access_token ? data.access_token.length : 0,
				startsWithFigd: data.access_token ? data.access_token.startsWith('figd_') : false,
				fullResponse: data // Be careful - this logs the full token in dev console
			});

			return data.access_token;
		} catch (error: any) {
			throw new Error(`Token exchange failed: ${error.message}`);
		}
	}

	private cleanup() {
		if (this.uriHandler) {
			this.uriHandler.dispose();
			this.uriHandler = undefined;
		}
	}

	static createDefaultConfig(): FigmaOAuthConfig {
		return {
			clientId: '', // Your Figma app client ID
			clientSecret: '', // Your Figma app client secret
			redirectUri: '', // Generated dynamically during authentication
			scope: FigmaOAuthService.DEFAULT_SCOPE
		};
	}
}
