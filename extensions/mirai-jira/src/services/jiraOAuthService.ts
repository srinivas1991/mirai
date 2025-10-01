import * as vscode from 'vscode';
import axios from 'axios';

export interface JiraOAuthConfig {
	clientId: string;
	clientSecret: string;
	redirectUri: string;
	scope: string;
	audience: string;
}

export class JiraOAuthService {
	private static readonly DEFAULT_SCOPE = 'read:jira-user read:jira-work write:jira-work';
	private static readonly DEFAULT_AUDIENCE = 'api.atlassian.com';

	private uriHandler?: vscode.Disposable;

	constructor(private config?: JiraOAuthConfig) { }

	private getConfig(): JiraOAuthConfig {
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
			oauthConfig = {
				JIRA_CLIENT_ID: process.env.JIRA_CLIENT_ID || 'YOUR_JIRA_CLIENT_ID_HERE',
				JIRA_CLIENT_SECRET: process.env.JIRA_CLIENT_SECRET || 'YOUR_JIRA_CLIENT_SECRET_HERE',
				JIRA_REDIRECT_URI: 'mirai://mirai.mirai-jira/oauth-callback'
			};
		}

		return {
			clientId: oauthConfig.JIRA_CLIENT_ID,
			clientSecret: oauthConfig.JIRA_CLIENT_SECRET,
			redirectUri: oauthConfig.JIRA_REDIRECT_URI,
			scope: JiraOAuthService.DEFAULT_SCOPE,
			audience: JiraOAuthService.DEFAULT_AUDIENCE
		};
	}

	isConfigured(): boolean {
		const config = this.getConfig();
		// Check if system credentials are properly set
		return !!(
			config.clientId &&
			config.clientSecret &&
			config.clientId !== 'YOUR_JIRA_CLIENT_ID_HERE' &&
			config.clientSecret !== 'YOUR_JIRA_CLIENT_SECRET_HERE'
		);
	}

	async authenticate(): Promise<{ accessToken: string; refreshToken: string; cloudId: string; siteUrl: string; siteName: string }> {
		const config = this.getConfig();
		if (!this.isConfigured()) {
			throw new Error('OAuth not configured. Please set CLIENT_ID and CLIENT_SECRET first, or use API token authentication instead.');
		}

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
						if (state !== 'mirai-jira-auth') {
							reject(new Error('Invalid state parameter'));
							return;
						}

						// Exchange code for access token
						const tokens = await this.exchangeCodeForToken(code);
						resolve(tokens);
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
			audience: config.audience,
			client_id: config.clientId,
			scope: config.scope,
			redirect_uri: config.redirectUri,
			response_type: 'code',
			state: 'mirai-jira-auth',
			prompt: 'consent'
		});

		return `https://auth.atlassian.com/authorize?${params.toString()}`;
	}

	private async exchangeCodeForToken(code: string): Promise<{ accessToken: string; refreshToken: string; cloudId: string; siteUrl: string; siteName: string }> {
		const config = this.getConfig();
		try {
			// Step 1: Exchange code for access token
			const formData = new URLSearchParams();
			formData.append('grant_type', 'authorization_code');
			formData.append('client_id', config.clientId);
			formData.append('client_secret', config.clientSecret);
			formData.append('code', code);
			formData.append('redirect_uri', config.redirectUri);

			const tokenResponse = await axios.post('https://auth.atlassian.com/oauth/token', formData, {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				}
			});

			const tokenData = tokenResponse.data;

			if (tokenData.error) {
				throw new Error(`Token exchange error: ${tokenData.error}`);
			}

			// Step 2: Get accessible resources (cloud instances)
			const resourcesResponse = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
				headers: {
					'Authorization': `Bearer ${tokenData.access_token}`,
					'Accept': 'application/json'
				}
			});

			const resources = resourcesResponse.data;
			if (!resources || resources.length === 0) {
				throw new Error('No accessible Jira instances found for this account');
			}

			// Log all available resources for debugging
			console.log('[Jira OAuth Debug] Available resources:', resources.map((r: any) => ({
				id: r.id,
				name: r.name,
				url: r.url,
				scopes: r.scopes
			})));

			// Let user choose their Jira instance if multiple are available
			let selectedResource;
			if (resources.length === 1) {
				selectedResource = resources[0];
			} else {
				// Show picker for multiple instances
				const vscode = require('vscode');
				const options = resources.map((r: any) => ({
					label: r.name,
					description: r.url,
					detail: `Cloud ID: ${r.id}`,
					resource: r
				}));

				const selected = await vscode.window.showQuickPick(options, {
					placeHolder: 'Select your Jira instance',
					ignoreFocusOut: true
				});

				if (!selected) {
					throw new Error('No Jira instance selected');
				}

				selectedResource = selected.resource;
			}

			const cloudId = selectedResource.id;

			console.log('[Jira OAuth Debug] Authentication successful:', {
				tokenPrefix: tokenData.access_token ? tokenData.access_token.substring(0, 10) + '...' : 'undefined',
				tokenLength: tokenData.access_token ? tokenData.access_token.length : 0,
				cloudId: cloudId,
				siteName: selectedResource.name,
				siteUrl: selectedResource.url,
				scopes: selectedResource.scopes
			});

			return {
				accessToken: tokenData.access_token,
				refreshToken: tokenData.refresh_token,
				cloudId: cloudId,
				siteUrl: selectedResource.url,
				siteName: selectedResource.name
			};
		} catch (error: any) {
			console.error('Jira OAuth error:', error.response?.data || error.message);
			throw new Error(`Token exchange failed: ${error.response?.data?.error_description || error.message}`);
		}
	}

	async refreshToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
		const config = this.getConfig();
		try {
			const formData = new URLSearchParams();
			formData.append('grant_type', 'refresh_token');
			formData.append('client_id', config.clientId);
			formData.append('client_secret', config.clientSecret);
			formData.append('refresh_token', refreshToken);

			const response = await axios.post('https://auth.atlassian.com/oauth/token', formData, {
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				}
			});

			const data = response.data;

			if (data.error) {
				throw new Error(`Token refresh error: ${data.error}`);
			}

			return {
				accessToken: data.access_token,
				refreshToken: data.refresh_token || refreshToken // Some providers don't return a new refresh token
			};
		} catch (error: any) {
			throw new Error(`Token refresh failed: ${error.response?.data?.error_description || error.message}`);
		}
	}

	private cleanup() {
		if (this.uriHandler) {
			this.uriHandler.dispose();
			this.uriHandler = undefined;
		}
	}

	static createDefaultConfig(): JiraOAuthConfig {
		return {
			clientId: '', // Your Atlassian app client ID
			clientSecret: '', // Your Atlassian app client secret
			redirectUri: 'mirai://mirai.mirai-jira/oauth-callback',
			scope: JiraOAuthService.DEFAULT_SCOPE,
			audience: JiraOAuthService.DEFAULT_AUDIENCE
		};
	}
}
