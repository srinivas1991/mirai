import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';

interface MiraiTokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	user: {
		id: string;
		name: string;
		email: string;
		credits: number;
		plan: string;
	};
}

export class MiraiAuthenticationProvider implements vscode.AuthenticationProvider {
	private _sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	private _client: AxiosInstance;
	private _sessions: vscode.AuthenticationSession[] = [];
	private _pendingAuth: {
		resolve: (value: string) => void;
		reject: (reason?: any) => void;
		timeout: NodeJS.Timeout;
		expectedState: string;
	} | null = null;

	constructor(private context: vscode.ExtensionContext) {
		const serverUrl = vscode.workspace.getConfiguration('mirai-auth').get<string>('serverUrl') || 'http://localhost:5173';

		this._client = axios.create({
			baseURL: serverUrl,
			timeout: 10000,
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': 'VSCode-Mirai-Auth/1.0.0'
			}
		});

		// Load existing sessions
		this.loadSessions();
	}

	get onDidChangeSessions() {
		return this._sessionChangeEmitter.event;
	}

	async getSessions(scopes?: readonly string[]): Promise<vscode.AuthenticationSession[]> {
		console.log('🔍 [MiraiAuth] Getting sessions, count:', this._sessions.length);
		return this._sessions;
	}

	async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
		console.log('🔐 [MiraiAuth] Creating new session...');

		try {
			// Generate a unique state for this auth request
			const state = Math.random().toString(36).substring(7);
			const redirectUri = 'mirai://mirai.mirai-auth/auth-callback';

			// Create the auth URL - this opens the web authentication page
			const authUrl = `${this._client.defaults.baseURL}/auth/vscode?redirect=${encodeURIComponent(redirectUri)}&state=${state}`;

			console.log('🌐 [MiraiAuth] Opening auth URL:', authUrl);

			// Open browser for authentication
			const opened = await vscode.env.openExternal(vscode.Uri.parse(authUrl));
			if (!opened) {
				throw new Error('Failed to open browser for authentication');
			}

			// Show a user-friendly message about what to expect
			vscode.window.showInformationMessage(
				'🔐 Browser opened for Mirai authentication. Complete the sign-in process and return to VS Code.',
				'Cancel'
			).then(result => {
				if (result === 'Cancel' && this._pendingAuth) {
					console.log('🚫 [MiraiAuth] User cancelled authentication');
					// clearTimeout(this._pendingAuth.timeout); // No timeout to clear anymore
					this._pendingAuth.reject(new Error('Authentication cancelled by user'));
					this._pendingAuth = null;
				}
			});

			// Wait for the callback with the temporary token
			const callbackPromise = new Promise<string>((resolve, reject) => {
				// Removed timeout polling - authentication will wait indefinitely for callback
				// const timeout = setTimeout(() => {
				// 	this._pendingAuth = null;
				// 	reject(new Error('Authentication timeout - please try again'));
				// }, 5 * 60 * 1000); // 5 minutes timeout

				// Store the pending auth info in instance variable (not global state)
				this._pendingAuth = {
					resolve,
					reject,
					timeout: null as any, // No timeout polling
					expectedState: state
				};
			});

			console.log('⏳ [MiraiAuth] Waiting for callback...');

			// Wait for callback without fallback polling
			let tempToken: string;
			try {
				tempToken = await callbackPromise;
			} catch (error) {
				// Clean up if there's still a pending auth
				if (this._pendingAuth) {
					// clearTimeout(this._pendingAuth.timeout); // No timeout to clear anymore
					this._pendingAuth = null;
				}
				throw error;
			}

			// Exchange the temporary token for a long-lived access token
			console.log('🔄 [MiraiAuth] Exchanging temporary token for session...');
			const tokenResponse = await this._client.post('/api/vscode/auth', {
				token: tempToken
			});

			const { accessToken, user: userData } = tokenResponse.data;

			// Create the session
			const session: vscode.AuthenticationSession = {
				id: userData.id,
				accessToken: accessToken,
				account: {
					id: userData.id,
					label: `${userData.name} (${userData.credits} credits)`
				},
				scopes: scopes as string[]
			};

			// Store the session
			this._sessions.push(session);
			await this.storeSessions();

			// Notify that sessions changed
			this._sessionChangeEmitter.fire({
				added: [session],
				removed: [],
				changed: []
			});

			console.log('✅ [MiraiAuth] Session created for user:', userData.name);
			vscode.window.showInformationMessage(`Successfully signed in to Mirai as ${userData.name}! Credits: ${userData.credits}`);

			return session;

		} catch (error: any) {
			console.error('❌ [MiraiAuth] Failed to create session:', error);
			if (error.response?.status === 401) {
				throw new Error('Invalid access token');
			}
			throw new Error(`Authentication failed: ${error.message}`);
		}
	}

	async removeSession(sessionId: string): Promise<void> {
		console.log('🗑️ [MiraiAuth] Removing session:', sessionId);

		const sessionIndex = this._sessions.findIndex(s => s.id === sessionId);
		if (sessionIndex > -1) {
			const removedSession = this._sessions.splice(sessionIndex, 1)[0];
			await this.storeSessions();

			this._sessionChangeEmitter.fire({
				added: [],
				removed: [removedSession],
				changed: []
			});

			console.log('✅ [MiraiAuth] Session removed');
		}
	}

	/**
	 * Get the current user's credit balance
	 */
	async getCreditBalance(sessionId: string): Promise<number> {
		const session = this._sessions.find(s => s.id === sessionId);
		if (!session) {
			throw new Error('No active session found');
		}

		try {
			const response = await this._client.get('/api/vscode/credits', {
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				}
			});

			return response.data.balance || 0;
		} catch (error) {
			console.error('Failed to fetch credit balance:', error);
			throw new Error('Failed to fetch credit balance');
		}
	}

	/**
	 * Deduct credits for a feature usage
	 */
	async deductCredits(sessionId: string, feature: string, amount?: number): Promise<{ success: boolean; balance: number }> {
		const session = this._sessions.find(s => s.id === sessionId);
		if (!session) {
			throw new Error('No active session found');
		}

		try {
			const response = await this._client.post('/api/credits/use', {
				feature,
				amount
			}, {
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				}
			});

			// Update session account label with new balance (if mutable)
			if ('label' in session.account && typeof session.account.label === 'string') {
				(session.account as any).label = session.account.label.replace(/\(\d+ credits\)/, `(${response.data.balance} credits)`);
			}

			return {
				success: true,
				balance: response.data.balance
			};
		} catch (error: any) {
			if (error.response?.status === 402) {
				throw new Error('Insufficient credits for this action');
			}
			console.error('Failed to deduct credits:', error);
			throw new Error('Failed to process credit transaction');
		}
	}

	/**
	 * Refresh user data and update session
	 */
	async refreshSession(sessionId: string): Promise<void> {
		const session = this._sessions.find(s => s.id === sessionId);
		if (!session) {
			return;
		}

		try {
			const response = await this._client.get('/api/vscode/user', {
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				}
			});

			const userData = response.data;

			// Update session account label (if mutable)
			if ('label' in session.account) {
				(session.account as any).label = `${userData.name} (${userData.credits} credits)`;
			}

			await this.storeSessions();

			this._sessionChangeEmitter.fire({
				added: [],
				removed: [],
				changed: [session]
			});

		} catch (error) {
			console.error('Failed to refresh session:', error);
			// If token is invalid, remove the session
			if (error instanceof Error && error.message.includes('401')) {
				await this.removeSession(sessionId);
			}
		}
	}

	private async loadSessions(): Promise<void> {
		try {
			const stored = await this.context.globalState.get<vscode.AuthenticationSession[]>('mirai-sessions');
			if (stored) {
				this._sessions = stored;
				console.log('📂 [MiraiAuth] Loaded', this._sessions.length, 'stored sessions');
			}
		} catch (error) {
			console.error('Failed to load sessions:', error);
		}
	}

	private async storeSessions(): Promise<void> {
		try {
			await this.context.globalState.update('mirai-sessions', this._sessions);
			console.log('💾 [MiraiAuth] Stored', this._sessions.length, 'sessions');
		} catch (error) {
			console.error('Failed to store sessions:', error);
		}
	}

	// Handle URI callbacks from the web authentication
	async handleCallback(uri: vscode.Uri): Promise<void> {
		console.log('📥 [MiraiAuth] Received callback:', uri.toString());

		const query = new URLSearchParams(uri.query);
		const token = query.get('token');
		const state = query.get('state');

		if (!this._pendingAuth) {
			console.error('🚨 [MiraiAuth] No pending authentication request');
			return;
		}

		const { resolve, reject, timeout, expectedState } = this._pendingAuth;

		// Clean up pending auth
		if (timeout) {
			clearTimeout(timeout);
		}
		this._pendingAuth = null;

		if (!token) {
			console.error('🚨 [MiraiAuth] No token in callback');
			reject(new Error('No token received in callback'));
			return;
		}

		if (state !== expectedState) {
			console.error('🚨 [MiraiAuth] State mismatch in callback');
			reject(new Error('State mismatch in authentication callback'));
			return;
		}

		console.log('✅ [MiraiAuth] Callback validated, resolving with token');
		resolve(token);
	}
}
