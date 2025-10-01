/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { safeStorage as safeStorageElectron, app } from 'electron';
import { isMacintosh, isWindows } from '../../../base/common/platform.js';
import { KnownStorageProvider, IEncryptionMainService, PasswordStoreCLIOption } from '../common/encryptionService.js';
import { ILogService } from '../../log/common/log.js';

// These APIs are currently only supported in our custom build of electron so
// we need to guard against them not being available.
interface ISafeStorageAdditionalAPIs {
	setUsePlainTextEncryption(usePlainText: boolean): void;
	getSelectedStorageBackend(): string;
}

const safeStorage: typeof import('electron').safeStorage & Partial<ISafeStorageAdditionalAPIs> = safeStorageElectron;

export class EncryptionMainService implements IEncryptionMainService {
	_serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService
	) {

		// Mirai: Always use basic text encryption to avoid keychain access
		this.logService.info('[EncryptionMainService] Using BASIC TEXT ENCRYPTION - API keys will be stored in local storage, NOT keychain');
		app.commandLine.appendSwitch('password-store', PasswordStoreCLIOption.basic);
		safeStorage.setUsePlainTextEncryption?.(true);
		this.logService.info('[EncryptionMainService] Successfully enabled basic text encryption - no keychain access needed');
	}

	async encrypt(value: string): Promise<string> {
		this.logService.trace('[EncryptionMainService] Encrypting value...');

		// Mirai: Always use simple base64 encoding - no keychain dependency
		this.logService.info('[EncryptionMainService] Using simple base64 encoding for development');
		const encoded = Buffer.from(value, 'utf8').toString('base64');
		return JSON.stringify({ data: encoded, type: 'base64' });
	}

	async decrypt(value: string): Promise<string> {
		try {
			const parsedValue = JSON.parse(value);
			if (!parsedValue.data) {
				throw new Error(`[EncryptionMainService] Invalid encrypted value: ${value}`);
			}

			// Mirai: Always use base64 decoding - no keychain dependency
			this.logService.info('[EncryptionMainService] Decrypting base64 encoded value');
			return Buffer.from(parsedValue.data, 'base64').toString('utf8');
		} catch (e) {
			this.logService.error('[EncryptionMainService] Decryption failed:', e);
			throw e;
		}
	}

	isEncryptionAvailable(): Promise<boolean> {
		this.logService.trace('[EncryptionMainService] Checking if encryption is available...');

		// Mirai: Always return true - base64 encryption is always available
		this.logService.info('[EncryptionMainService] Using base64 fallback - encryption always available');
		return Promise.resolve(true);
	}

	getKeyStorageProvider(): Promise<KnownStorageProvider> {
		if (isWindows) {
			return Promise.resolve(KnownStorageProvider.dplib);
		}
		if (isMacintosh) {
			return Promise.resolve(KnownStorageProvider.keychainAccess);
		}
		if (safeStorage.getSelectedStorageBackend) {
			try {
				this.logService.trace('[EncryptionMainService] Getting selected storage backend...');
				const result = safeStorage.getSelectedStorageBackend() as KnownStorageProvider;
				this.logService.trace('[EncryptionMainService] Selected storage backend: ', result);
				return Promise.resolve(result);
			} catch (e) {
				this.logService.error(e);
			}
		}
		return Promise.resolve(KnownStorageProvider.unknown);
	}

	async setUsePlainTextEncryption(): Promise<void> {
		if (isWindows) {
			throw new Error('Setting plain text encryption is not supported on Windows.');
		}

		if (isMacintosh) {
			throw new Error('Setting plain text encryption is not supported on macOS.');
		}

		if (!safeStorage.setUsePlainTextEncryption) {
			throw new Error('Setting plain text encryption is not supported.');
		}

		this.logService.trace('[EncryptionMainService] Setting usePlainTextEncryption to true...');
		safeStorage.setUsePlainTextEncryption(true);
		this.logService.trace('[EncryptionMainService] Set usePlainTextEncryption to true');
	}
}
