/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { EventLLMMessageOnTextParams, EventLLMMessageOnErrorParams, EventLLMMessageOnFinalMessageParams, ServiceSendLLMMessageParams, MainSendLLMMessageParams, MainLLMMessageAbortParams, ServiceModelListParams, EventModelListOnSuccessParams, EventModelListOnErrorParams, MainModelListParams, OllamaModelResponse, OpenaiCompatibleModelResponse, } from './sendLLMMessageTypes.js';

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IVoidSettingsService } from './voidSettingsService.js';
import { IMCPService } from './mcpService.js';
import { IGlobalAuthService } from './globalAuthService.js';

// calls channel to implement features
export const ILLMMessageService = createDecorator<ILLMMessageService>('llmMessageService');

export interface ILLMMessageService {
	readonly _serviceBrand: undefined;
	sendLLMMessage: (params: ServiceSendLLMMessageParams) => string | null;
	abort: (requestId: string) => void;
	ollamaList: (params: ServiceModelListParams<OllamaModelResponse>) => void;
	openAICompatibleList: (params: ServiceModelListParams<OpenaiCompatibleModelResponse>) => void;
}


// open this file side by side with llmMessageChannel
export class LLMMessageService extends Disposable implements ILLMMessageService {

	readonly _serviceBrand: undefined;
	private readonly channel: IChannel // LLMMessageChannel

	// sendLLMMessage
	private readonly llmMessageHooks = {
		onText: {} as { [eventId: string]: ((params: EventLLMMessageOnTextParams) => void) },
		onFinalMessage: {} as { [eventId: string]: ((params: EventLLMMessageOnFinalMessageParams) => void) },
		onError: {} as { [eventId: string]: ((params: EventLLMMessageOnErrorParams) => void) },
		onAbort: {} as { [eventId: string]: (() => void) }, // NOT sent over the channel, result is instant when we call .abort()
	}

	// list hooks
	private readonly listHooks = {
		ollama: {
			success: {} as { [eventId: string]: ((params: EventModelListOnSuccessParams<OllamaModelResponse>) => void) },
			error: {} as { [eventId: string]: ((params: EventModelListOnErrorParams<OllamaModelResponse>) => void) },
		},
		openAICompat: {
			success: {} as { [eventId: string]: ((params: EventModelListOnSuccessParams<OpenaiCompatibleModelResponse>) => void) },
			error: {} as { [eventId: string]: ((params: EventModelListOnErrorParams<OpenaiCompatibleModelResponse>) => void) },
		}
	} satisfies {
		[providerName in 'ollama' | 'openAICompat']: {
			success: { [eventId: string]: ((params: EventModelListOnSuccessParams<any>) => void) },
			error: { [eventId: string]: ((params: EventModelListOnErrorParams<any>) => void) },
		}
	}

	constructor(
		@IMainProcessService private readonly mainProcessService: IMainProcessService, // used as a renderer (only usable on client side)
		@IVoidSettingsService private readonly voidSettingsService: IVoidSettingsService,
		// @INotificationService private readonly notificationService: INotificationService,
		@IMCPService private readonly mcpService: IMCPService,
		@IGlobalAuthService private readonly globalAuthService: IGlobalAuthService,
	) {
		super()

		// const service = ProxyChannel.toService<LLMMessageChannel>(mainProcessService.getChannel('void-channel-sendLLMMessage')); // lets you call it like a service
		// see llmMessageChannel.ts
		this.channel = this.mainProcessService.getChannel('void-channel-llmMessage')

		// .listen sets up an IPC channel and takes a few ms, so we set up listeners immediately and add hooks to them instead
		// llm
		this._register((this.channel.listen('onText_sendLLMMessage') satisfies Event<EventLLMMessageOnTextParams>)(e => {
			this.llmMessageHooks.onText[e.requestId]?.(e)
		}))
		this._register((this.channel.listen('onFinalMessage_sendLLMMessage') satisfies Event<EventLLMMessageOnFinalMessageParams>)(e => {
			// Report token usage metrics
			if (e.tokenUsage) {
				this.reportTokenUsage(e.tokenUsage).catch(error => {
					console.error('Failed to report token usage:', error.message);
				});
			}

			this.llmMessageHooks.onFinalMessage[e.requestId]?.(e);
			this._clearChannelHooks(e.requestId)
		}))
		this._register((this.channel.listen('onError_sendLLMMessage') satisfies Event<EventLLMMessageOnErrorParams>)(e => {
			this.llmMessageHooks.onError[e.requestId]?.(e);
			this._clearChannelHooks(e.requestId);
			console.error('Error in LLMMessageService:', JSON.stringify(e))
		}))
		// .list()
		this._register((this.channel.listen('onSuccess_list_ollama') satisfies Event<EventModelListOnSuccessParams<OllamaModelResponse>>)(e => {
			this.listHooks.ollama.success[e.requestId]?.(e)
		}))
		this._register((this.channel.listen('onError_list_ollama') satisfies Event<EventModelListOnErrorParams<OllamaModelResponse>>)(e => {
			this.listHooks.ollama.error[e.requestId]?.(e)
		}))
		this._register((this.channel.listen('onSuccess_list_openAICompatible') satisfies Event<EventModelListOnSuccessParams<OpenaiCompatibleModelResponse>>)(e => {
			this.listHooks.openAICompat.success[e.requestId]?.(e)
		}))
		this._register((this.channel.listen('onError_list_openAICompatible') satisfies Event<EventModelListOnErrorParams<OpenaiCompatibleModelResponse>>)(e => {
			this.listHooks.openAICompat.error[e.requestId]?.(e)
		}))

	}

	sendLLMMessage(params: ServiceSendLLMMessageParams) {
		const { onText, onFinalMessage, onError, onAbort, modelSelection, ...proxyParams } = params;

		// 🔐 AUTH GUARD: Check if user is authenticated
		if (!this.globalAuthService.isAuthenticated) {
			const message = 'Please authenticate with Mirai to use LLM features. Click the Accounts section in the bottom-left to sign in.';
			onError({ message, fullError: new Error(message) });
			return null;
		}


		// throw an error if no model/provider selected (this should usually never be reached, the UI should check this first, but might happen in cases like Apply where we haven't built much UI/checks yet, good practice to have check logic on backend)
		if (modelSelection === null) {
			const message = `Please add a provider in Mirai's Settings.`
			onError({ message, fullError: null })
			return null
		}

		if (params.messagesType === 'chatMessages' && (params.messages?.length ?? 0) === 0) {
			const message = `No messages detected.`
			onError({ message, fullError: null })
			return null
		}

		const { settingsOfProvider, } = this.voidSettingsService.state

		const mcpTools = this.mcpService.getMCPTools()

		// 🔐 Get Mirai Auth token for debugging
		const miraiToken = this.globalAuthService.getMiraiToken();
		if (miraiToken) {
			const tokenPreview = miraiToken.substring(0, 20) + '...' + miraiToken.substring(miraiToken.length - 4);
			console.log(`🔐 [LLM Service] Mirai token retrieved: ${tokenPreview}`);
		} else {
			console.log(`⚠️ [LLM Service] No Mirai token available`);
		}

		// add state for request id
		const requestId = generateUuid();
		this.llmMessageHooks.onText[requestId] = onText
		this.llmMessageHooks.onFinalMessage[requestId] = onFinalMessage
		this.llmMessageHooks.onError[requestId] = onError
		this.llmMessageHooks.onAbort[requestId] = onAbort // used internally only

		// params will be stripped of all its functions over the IPC channel
		this.channel.call('sendLLMMessage', {
			...proxyParams,
			requestId,
			settingsOfProvider,
			modelSelection,
			mcpTools,
			miraiToken: miraiToken, // 🔐 Pass Mirai Auth token
		} satisfies MainSendLLMMessageParams);

		return requestId
	}

	abort(requestId: string) {
		this.llmMessageHooks.onAbort[requestId]?.() // calling the abort hook here is instant (doesn't go over a channel)
		this.channel.call('abort', { requestId } satisfies MainLLMMessageAbortParams);
		this._clearChannelHooks(requestId)
	}


	ollamaList = (params: ServiceModelListParams<OllamaModelResponse>) => {
		const { onSuccess, onError, ...proxyParams } = params

		const { settingsOfProvider } = this.voidSettingsService.state

		// add state for request id
		const requestId_ = generateUuid();
		this.listHooks.ollama.success[requestId_] = onSuccess
		this.listHooks.ollama.error[requestId_] = onError

		this.channel.call('ollamaList', {
			...proxyParams,
			settingsOfProvider,
			providerName: 'ollama',
			requestId: requestId_,
		} satisfies MainModelListParams<OllamaModelResponse>)
	}


	openAICompatibleList = (params: ServiceModelListParams<OpenaiCompatibleModelResponse>) => {
		const { onSuccess, onError, ...proxyParams } = params

		const { settingsOfProvider } = this.voidSettingsService.state

		// add state for request id
		const requestId_ = generateUuid();
		this.listHooks.openAICompat.success[requestId_] = onSuccess
		this.listHooks.openAICompat.error[requestId_] = onError

		this.channel.call('openAICompatibleList', {
			...proxyParams,
			settingsOfProvider,
			requestId: requestId_,
		} satisfies MainModelListParams<OpenaiCompatibleModelResponse>)
	}

	private _clearChannelHooks(requestId: string) {
		delete this.llmMessageHooks.onText[requestId]
		delete this.llmMessageHooks.onFinalMessage[requestId]
		delete this.llmMessageHooks.onError[requestId]

		delete this.listHooks.ollama.success[requestId]
		delete this.listHooks.ollama.error[requestId]

		delete this.listHooks.openAICompat.success[requestId]
		delete this.listHooks.openAICompat.error[requestId]
	}

	/**
	 * Simple, direct token usage reporting using global auth state
	 */
	private async reportTokenUsage(tokenUsage: any): Promise<void> {
		console.log('🔄 [reportTokenUsage] Starting token usage reporting...');

		// Declare URL at function level so it's accessible in catch block
		const requestUrl = 'http://localhost:5173/api/vscode/token-usage';

		try {
			// Check auth state
			const authToken = this.globalAuthService.getMiraiToken();

			if (!authToken) {
				return; // No auth token available
			}


			// Map VSCode provider names to server-expected format
			const providerNameMap: Record<string, string> = {
				'anthropic': 'Anthropic',
				'cohere': 'Cohere',
				'deepseek': 'Deepseek',
				'google': 'Google',
				'gemini': 'Google',  // VSCode uses 'gemini', server expects 'Google'
				'groq': 'Groq',
				'huggingface': 'HuggingFace',
				'hyperbolic': 'Hyperbolic',
				'mistral': 'Mistral',
				'ollama': 'Ollama',
				'openAI': 'OpenAI',
				'openai': 'OpenAI',
				'openrouter': 'OpenRouter',
				'openaiCompatible': 'OpenAILike',
				'perplexity': 'Perplexity',
				'xai': 'xAI',
				'together': 'Together',
				'lmstudio': 'LMStudio',
				'amazonbedrock': 'AmazonBedrock',
				'github': 'Github'
			};

			const normalizedProvider = providerNameMap[tokenUsage.providerId] || tokenUsage.providerId;

			// Transform data to match server's expected format
			const serverPayload = {
				model: tokenUsage.modelId,           // server expects "model"
				provider: normalizedProvider,        // server expects specific provider names
				promptTokens: tokenUsage.promptTokens,
				completionTokens: tokenUsage.completionTokens,
				totalTokens: tokenUsage.totalTokens,
				requestType: tokenUsage.requestType,
				timestamp: tokenUsage.timestamp,
				...(tokenUsage.metaData && { metaData: tokenUsage.metaData }),
				...(tokenUsage.rawUsage && { rawUsage: tokenUsage.rawUsage })
			};

			const requestPayload = JSON.stringify(serverPayload);

			// Prepare request headers
			const requestHeaders = {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${authToken}`,
				'User-Agent': 'VSCode-LLM-Integration'
			};


			const response = await fetch(requestUrl, {
				method: 'POST',
				mode: 'cors',
				credentials: 'omit',
				headers: requestHeaders,
				body: requestPayload
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => 'Unable to read error response');
				console.error('Token usage reporting failed:', {
					status: response.status,
					errorText: errorText.substring(0, 200)
				});
			}
		} catch (error) {
			console.error('Token usage reporting error:', error?.message || 'Unknown error');
		}
	}
}

registerSingleton(ILLMMessageService, LLMMessageService, InstantiationType.Eager);

