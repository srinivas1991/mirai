/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { IProductService } from '../../../../platform/product/common/productService.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';

export interface IProductionFeatures {
	allowLLMKeyConfiguration: boolean;
	allowTestCommands: boolean;
	allowProviderConfiguration: boolean;
	allowAdvancedSettings: boolean;
	allowLocalProviders: boolean;
	allowModelConfiguration: boolean;
	allowSettingsModification: boolean;
}

export const IProductionConfigService = createDecorator<IProductionConfigService>('productionConfigService');

export interface IProductionConfigService {
	readonly _serviceBrand: undefined;
	readonly isProduction: boolean;
	readonly features: IProductionFeatures;
	canAccess(feature: keyof IProductionFeatures): boolean;
}

export class ProductionConfigService implements IProductionConfigService {
	declare readonly _serviceBrand: undefined;

	private _isProduction: boolean;
	private _features: IProductionFeatures;

	constructor(
		@IProductService private readonly productService: IProductService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {
		// Determine if this is a production build
		this._isProduction = this.checkIsProduction();

		this._features = {
			allowLLMKeyConfiguration: !this._isProduction,
			allowTestCommands: !this._isProduction,
			allowProviderConfiguration: !this._isProduction,
			allowAdvancedSettings: !this._isProduction,
			allowLocalProviders: !this._isProduction,
			allowModelConfiguration: !this._isProduction,
			allowSettingsModification: !this._isProduction,
		};
	}

	private checkIsProduction(): boolean {
		// Check environment variables (safely, as process may not be available in renderer)
		const isProcessAvailable = typeof process !== 'undefined' && process.env;
		if (isProcessAvailable && process.env.MIRAI_PRODUCTION === 'true') {
			return true;
		}

		// Check if built and not in development
		const isBuilt = this.environmentService.isBuilt;
		const isDev = this.environmentService.isExtensionDevelopment ||
			(isProcessAvailable && (process.env.VSCODE_DEV || process.env.NODE_ENV === 'development'));

		// Production if built and quality is stable/insider and not in dev mode
		const isProductionQuality = this.productService.quality === 'stable' || this.productService.quality === 'insider';

		return isBuilt && !isDev && isProductionQuality;
	}

	get isProduction(): boolean {
		return this._isProduction;
	}

	get features(): IProductionFeatures {
		return this._features;
	}

	canAccess(feature: keyof IProductionFeatures): boolean {
		return this._features[feature];
	}
}

registerSingleton(IProductionConfigService, ProductionConfigService, InstantiationType.Eager);
