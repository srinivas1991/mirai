(function () {
	const vscode = acquireVsCodeApi();

	// DOM elements
	const notConfiguredSection = document.getElementById('not-configured');
	const configuredSection = document.getElementById('configured');
	const statusIndicator = document.getElementById('status-indicator');
	const statusText = document.getElementById('status-text');
	// Authentication elements
	const oauthBtn = document.getElementById('oauth-btn');

	// Main action elements
	const fileKeyInput = document.getElementById('file-key-input');
	const refreshFilesBtn = document.getElementById('refresh-files-btn');
	const clearTokenBtn = document.getElementById('clear-token-btn');

	// AI action cards
	const generateCodeChatBtn = document.getElementById('generate-code-chat-btn');
	const analyzeTokensChatBtn = document.getElementById('analyze-tokens-chat-btn');
	const reviewAccessibilityBtn = document.getElementById('review-accessibility-btn');
	const sendToChatBtn = document.getElementById('send-to-chat-btn');

	// Authentication event listeners

	oauthBtn?.addEventListener('click', () => {
		vscode.postMessage({ type: 'authenticateOAuth' });
	});

	// Main action event listeners
	refreshFilesBtn?.addEventListener('click', () => {
		vscode.postMessage({ type: 'refreshFiles' });
	});

	clearTokenBtn?.addEventListener('click', () => {
		vscode.postMessage({ type: 'clearToken' });
	});

	// AI action card event listeners
	generateCodeChatBtn?.addEventListener('click', () => {
		vscode.postMessage({ type: 'generateCodeWithChat' });
	});

	analyzeTokensChatBtn?.addEventListener('click', () => {
		vscode.postMessage({ type: 'analyzeTokensWithChat' });
	});

	reviewAccessibilityBtn?.addEventListener('click', () => {
		vscode.postMessage({ type: 'reviewAccessibility' });
	});

	sendToChatBtn?.addEventListener('click', () => {
		vscode.postMessage({ type: 'sendToChat' });
	});

	// Handle Enter key in file input for quick actions
	fileKeyInput?.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') {
			// Trigger the first AI action (Ask AI) when Enter is pressed
			sendToChatBtn?.click();
		}
	});

	// Listen for messages from the extension
	window.addEventListener('message', event => {
		const message = event.data;

		switch (message.type) {
			case 'update':
				updateUI(message.isConfigured);
				break;
		}
	});

	function updateUI(isConfigured, status) {
		if (isConfigured) {
			notConfiguredSection.style.display = 'none';
			configuredSection.style.display = 'block';
			showStatus('✅ Connected to Figma', 'connected');
		} else {
			notConfiguredSection.style.display = 'block';
			configuredSection.style.display = 'none';
			hideStatus();
		}

		// Handle error status
		if (status && status.error) {
			showStatus(`❌ ${status.error}`, 'error');
		}
	}

	function showStatus(message, type) {
		if (statusIndicator && statusText) {
			statusText.textContent = message;
			statusIndicator.className = `status-indicator ${type}`;
			statusIndicator.style.display = 'block';
		}
	}

	function hideStatus() {
		if (statusIndicator) {
			statusIndicator.style.display = 'none';
		}
	}

	function showError(message) {
		// Create a temporary error message
		const errorDiv = document.createElement('div');
		errorDiv.className = 'error-message';
		errorDiv.style.cssText = `
			background-color: var(--vscode-inputValidation-errorBackground);
			border: 1px solid var(--vscode-inputValidation-errorBorder);
			color: var(--vscode-inputValidation-errorForeground);
			padding: 8px 12px;
			border-radius: 4px;
			margin-top: 8px;
			font-size: 12px;
		`;
		errorDiv.textContent = message;

		// Insert after the input group
		const inputGroup = document.querySelector('.input-group');
		inputGroup.parentNode.insertBefore(errorDiv, inputGroup.nextSibling);

		// Remove after 3 seconds
		setTimeout(() => {
			errorDiv.remove();
		}, 3000);
	}

	// Initialize UI
	updateUI(false); // Will be updated by the extension
})();
