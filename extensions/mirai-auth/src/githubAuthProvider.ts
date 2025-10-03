import * as vscode from 'vscode';
import axios from 'axios';

interface GitHubSession {
	id: string;
	accessToken: string;
	account: {
		label: string;
		id: string;
	};
	scopes: string[];
}

export class MiraiGitHubAuthenticationProvider implements vscode.AuthenticationProvider {
	private static readonly STORAGE_KEY = 'mirai.github.sessions';
	private static readonly PAT_STORAGE_KEY = 'mirai.github.pat';
	private static readonly PAT_INFO_KEY = 'mirai.github.pat.info';
	private _onDidChangeSessions = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	constructor(private context: vscode.ExtensionContext) { }

	async getSessions(scopes?: readonly string[], options?: vscode.AuthenticationProviderSessionOptions): Promise<vscode.AuthenticationSession[]> {
		// Get stored sessions (OAuth)
		const storedSessions = this.context.globalState.get<GitHubSession[]>(MiraiGitHubAuthenticationProvider.STORAGE_KEY, []);

		// Get PAT session if exists
		const patSession = await this.getPATSession();
		const allSessions = patSession ? [...storedSessions, patSession] : storedSessions;

		if (!scopes || scopes.length === 0) {
			return allSessions;
		}

		// Filter by scopes (PAT has all scopes)
		return allSessions.filter(session =>
			session.id === 'pat' || scopes.every(scope => session.scopes.includes(scope))
		);
	}

	async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
		const serverUrl = vscode.workspace.getConfiguration('mirai-auth').get<string>('serverUrl', 'http://localhost:5173');

		// Generate state for OAuth
		const state = this.generateState();

		// Build OAuth URL
		const redirectUri = `${vscode.env.uriScheme}://mirai.mirai-auth/github-callback`;
		const authUrl = `${serverUrl}/auth/github/vscode?redirect=${encodeURIComponent(redirectUri)}&state=${state}`;

		// Open browser for OAuth
		const opened = await vscode.env.openExternal(vscode.Uri.parse(authUrl));

		if (!opened) {
			throw new Error('Failed to open browser for GitHub authentication');
		}

		// Wait for callback
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error('GitHub authentication timed out'));
			}, 5 * 60 * 1000); // 5 minutes

			// Store the pending promise
			(this as any)._pendingAuth = { resolve, reject, timeout, state, scopes: [...scopes] };
		});
	}

	async removeSession(sessionId: string): Promise<void> {
		// Check if removing PAT session
		if (sessionId === 'pat') {
			const patSession = await this.getPATSession();
			await this.context.secrets.delete(MiraiGitHubAuthenticationProvider.PAT_STORAGE_KEY);
			await this.context.globalState.update(MiraiGitHubAuthenticationProvider.PAT_INFO_KEY, undefined);

			if (patSession) {
				this._onDidChangeSessions.fire({
					added: [],
					removed: [patSession],
					changed: []
				});
			}
			return;
		}

		// Remove OAuth session
		const sessions = this.context.globalState.get<GitHubSession[]>(MiraiGitHubAuthenticationProvider.STORAGE_KEY, []);
		const removedSession = sessions.find(s => s.id === sessionId);
		const filtered = sessions.filter(s => s.id !== sessionId);

		await this.context.globalState.update(MiraiGitHubAuthenticationProvider.STORAGE_KEY, filtered);

		if (removedSession) {
			this._onDidChangeSessions.fire({
				added: [],
				removed: [removedSession],
				changed: []
			});
		}
	}

	/**
	 * Handle OAuth callback from the server
	 */
	async handleCallback(uri: vscode.Uri): Promise<void> {
		const query = new URLSearchParams(uri.query);
		const token = query.get('token');
		const state = query.get('state');
		const username = query.get('username');
		const scope = query.get('scope');
		const error = query.get('error');

		const pendingAuth = (this as any)._pendingAuth;

		if (!pendingAuth) {
			console.warn('No pending GitHub authentication');
			return;
		}

		clearTimeout(pendingAuth.timeout);
		delete (this as any)._pendingAuth;

		if (error) {
			pendingAuth.reject(new Error(`GitHub authentication failed: ${error}`));
			return;
		}

		if (!token || !state || state !== pendingAuth.state) {
			pendingAuth.reject(new Error('Invalid GitHub authentication response'));
			return;
		}

		// Decode the token to get the GitHub access token
		let githubAccessToken: string;
		let githubId: string;

		try {
			// The token format is: mirai_github_{base64url_encoded_json}
			const tokenPart = token.replace('mirai_github_', '');
			const decoded = JSON.parse(Buffer.from(tokenPart, 'base64url').toString());
			githubAccessToken = decoded.githubAccessToken;
			githubId = decoded.githubId;
		} catch (e) {
			pendingAuth.reject(new Error('Failed to decode GitHub token'));
			return;
		}

		// Create session
		const session: GitHubSession = {
			id: githubId,
			accessToken: githubAccessToken,
			account: {
				label: username || 'GitHub User',
				id: githubId
			},
			scopes: scope ? scope.split(',') : pendingAuth.scopes
		};

		// Store session
		const sessions = this.context.globalState.get<GitHubSession[]>(MiraiGitHubAuthenticationProvider.STORAGE_KEY, []);

		// Remove existing session for this user
		const filtered = sessions.filter(s => s.id !== session.id);
		filtered.push(session);

		await this.context.globalState.update(MiraiGitHubAuthenticationProvider.STORAGE_KEY, filtered);

		this._onDidChangeSessions.fire({
			added: [session],
			removed: [],
			changed: []
		});

		pendingAuth.resolve(session);
	}

	private generateState(): string {
		return Math.random().toString(36).substring(2) + Date.now().toString(36);
	}

	/**
	 * Create a session using a Personal Access Token
	 */
	async createSessionFromPAT(token: string): Promise<vscode.AuthenticationSession> {
		// Validate token by fetching user info
		try {
			const response = await fetch('https://api.github.com/user', {
				headers: {
					'Authorization': `Bearer ${token}`,
					'Accept': 'application/vnd.github.v3+json',
					'User-Agent': 'Void-Editor'
				}
			});

			if (!response.ok) {
				throw new Error('Invalid GitHub Personal Access Token');
			}

			const user = await response.json() as { login: string; id: number };

			// Store PAT securely in secrets
			await this.context.secrets.store(MiraiGitHubAuthenticationProvider.PAT_STORAGE_KEY, token);

			// Store user info in globalState for faster retrieval
			await this.context.globalState.update(MiraiGitHubAuthenticationProvider.PAT_INFO_KEY, {
				username: user.login,
				id: user.id
			});

			const session: GitHubSession = {
				id: 'pat',
				accessToken: token,
				account: {
					label: `${user.login} (PAT)`,
					id: 'pat'
				},
				scopes: ['repo', 'read:user', 'user:email', 'read:org'] // PAT can have all scopes
			};

			this._onDidChangeSessions.fire({
				added: [session],
				removed: [],
				changed: []
			});

			return session;
		} catch (error) {
			throw new Error(`Failed to validate Personal Access Token: ${error instanceof Error ? error.message : error}`);
		}
	}

	/**
	 * Get the PAT session if it exists (without validation)
	 */
	private async getPATSession(): Promise<GitHubSession | undefined> {
		const token = await this.context.secrets.get(MiraiGitHubAuthenticationProvider.PAT_STORAGE_KEY);

		if (!token) {
			return undefined;
		}

		// Get stored user info (set during token creation)
		const userInfo = this.context.globalState.get<{ username: string; id: number }>(
			MiraiGitHubAuthenticationProvider.PAT_INFO_KEY
		);

		if (!userInfo) {
			// If we don't have user info, the token might be from an old version
			// Clean it up and return undefined
			await this.context.secrets.delete(MiraiGitHubAuthenticationProvider.PAT_STORAGE_KEY);
			return undefined;
		}

		return {
			id: 'pat',
			accessToken: token,
			account: {
				label: `${userInfo.username} (PAT)`,
				id: 'pat'
			},
			scopes: ['repo', 'read:user', 'user:email', 'read:org']
		};
	}
}

