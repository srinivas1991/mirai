/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';

export interface MiraiUser {
	id: string;
	name: string;
	credits: number;
	email?: string;
}

export interface IGlobalAuthService {
	readonly _serviceBrand: undefined;

	// Auth state
	readonly isAuthenticated: boolean;
	readonly miraiToken: string | null;
	readonly miraiUser: MiraiUser | null;

	// Events
	readonly onDidAuthStateChange: Event<{ isAuthenticated: boolean; user: MiraiUser | null }>;

	// Methods
	getMiraiToken(): string | null;
	getMiraiUser(): MiraiUser | null;
	refreshAuthState(): Promise<void>;
	clearAuth(): void;
}

export const IGlobalAuthService = createDecorator<IGlobalAuthService>('globalAuthService');

export class GlobalAuthService extends Disposable implements IGlobalAuthService {
	readonly _serviceBrand: undefined;

	private _miraiToken: string | null = null;
	private _miraiUser: MiraiUser | null = null;
	private _isAuthenticated: boolean = false;

	private readonly _onDidAuthStateChange = this._register(new Emitter<{ isAuthenticated: boolean; user: MiraiUser | null }>());
	readonly onDidAuthStateChange = this._onDidAuthStateChange.event;

	constructor(
		@IAuthenticationService private readonly authenticationService: IAuthenticationService
	) {
		super();

		// Initialize auth state
		this.refreshAuthState();

		// Listen for auth changes
		this._register(this.authenticationService.onDidChangeSessions(e => {
			if (e.providerId === 'mirai') {
				console.log('🔄 Mirai auth sessions changed, refreshing global auth state');
				this.refreshAuthState();
			}
		}));
	}

	get isAuthenticated(): boolean {
		return this._isAuthenticated;
	}

	get miraiToken(): string | null {
		return this._miraiToken;
	}

	get miraiUser(): MiraiUser | null {
		return this._miraiUser;
	}

	getMiraiToken(): string | null {
		return this._miraiToken;
	}

	getMiraiUser(): MiraiUser | null {
		return this._miraiUser;
	}

	async refreshAuthState(): Promise<void> {
		try {
			console.log('🔄 Refreshing global auth state...');

			const sessions = await this.authenticationService.getSessions('mirai');

			if (sessions.length > 0) {
				const session = sessions[0];
				this._miraiToken = session.accessToken;
				this._miraiUser = {
					id: session.account.id,
					name: session.account.label.split(' (')[0], // Extract name from "Name (credits credits)"
					credits: this.extractCreditsFromLabel(session.account.label),
				};
				this._isAuthenticated = true;

			} else {
				this.clearAuth();
			}

			// Notify listeners
			this._onDidAuthStateChange.fire({
				isAuthenticated: this._isAuthenticated,
				user: this._miraiUser
			});

		} catch (error) {
			console.error('Failed to refresh auth state:', error?.message || 'Unknown error');
			this.clearAuth();
		}
	}

	clearAuth(): void {
		const wasAuthenticated = this._isAuthenticated;

		this._miraiToken = null;
		this._miraiUser = null;
		this._isAuthenticated = false;

		console.log('🗑️ Cleared global auth state');

		if (wasAuthenticated) {
			this._onDidAuthStateChange.fire({
				isAuthenticated: false,
				user: null
			});
		}
	}

	private extractCreditsFromLabel(label: string): number {
		// Extract credits from "Name (123 credits)" format
		const match = label.match(/\((\d+)\s+credits?\)/i);
		return match ? parseInt(match[1], 10) : 0;
	}
}

registerSingleton(IGlobalAuthService, GlobalAuthService, InstantiationType.Delayed);
