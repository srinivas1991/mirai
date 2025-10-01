(function () {
	const vscode = acquireVsCodeApi();
	let connections = [];

	// Event listeners
	document.addEventListener('DOMContentLoaded', function () {
		const refreshBtn = document.getElementById('refresh-btn');
		if (refreshBtn) {
			refreshBtn.addEventListener('click', () => {
				vscode.postMessage({ type: 'refresh' });
			});
		}
	});

	// Handle messages from the extension
	window.addEventListener('message', event => {
		const message = event.data;

		switch (message.type) {
			case 'refreshConnections':
				connections = message.connections;
				renderConnections();
				break;
		}
	});

	function renderConnections() {
		const container = document.getElementById('connections-list');
		if (!container) return;

		container.innerHTML = connections.map(connection => `
            <div class="connection-item ${connection.status}" data-connection-id="${connection.id}">
                <div class="connection-left">
                    <span class="icon-${connection.icon} connection-icon"></span>
                    <div class="connection-info">
                        <span class="connection-name">${connection.name}</span>
                        <span class="connection-status-text">${getStatusText(connection.status)}</span>
                    </div>
                </div>
                <div class="connection-right">
                    <div class="toggle-switch ${connection.status === 'connected' ? 'on' : 'off'}"
                         data-connection-id="${connection.id}"
                         data-status="${connection.status}">
                        <div class="toggle-handle"></div>
                    </div>
                    <button class="btn-settings" data-connection-id="${connection.id}" title="Settings">
                        <span class="icon-settings"></span>
                    </button>
                </div>
            </div>
        `).join('');

		// Add event listeners after rendering
		addEventListeners();
	}

	function addEventListeners() {
		// Toggle switches
		document.querySelectorAll('.toggle-switch').forEach(toggle => {
			toggle.addEventListener('click', (e) => {
				const connectionId = e.currentTarget.dataset.connectionId;
				const status = e.currentTarget.dataset.status;

				if (status === 'connected') {
					// Disconnect
					vscode.postMessage({
						type: 'disconnect',
						connectionId
					});
				} else {
					// Connect
					const connection = connections.find(c => c.id === connectionId);
					if (connection && connection.actions.length > 0) {
						const primaryAction = connection.actions.find(a => a.primary) || connection.actions[0];

						if (connectionId === 'github' && primaryAction.command === 'vscode.open') {
							// Special case for GitHub token generation
							vscode.postMessage({
								type: 'openUrl',
								url: 'https://github.com/settings/tokens/new?description=Mirai%20VS%20Code&scopes=repo,read:user'
							});
						} else {
							vscode.postMessage({
								type: 'executeCommand',
								command: primaryAction.command
							});
						}
					}
				}
			});
		});

		// Settings buttons
		document.querySelectorAll('.btn-settings').forEach(btn => {
			btn.addEventListener('click', (e) => {
				const connectionId = e.currentTarget.dataset.connectionId;
				console.log('Settings clicked for:', connectionId);
				showQuickSettings(connectionId);
			});
		});
	}

	function showQuickSettings(connectionId) {
		const connection = connections.find(c => c.id === connectionId);
		if (!connection) return;

		// For now, just execute the configure action
		const configAction = connection.actions.find(a => a.id === 'configure');
		if (configAction) {
			vscode.postMessage({
				type: 'executeCommand',
				command: configAction.command
			});
		} else {
			// Show a quick settings modal inline (future enhancement)
			vscode.postMessage({
				type: 'showQuickSettings',
				connectionId
			});
		}
	}

	function getStatusText(status) {
		switch (status) {
			case 'connected': return 'Connected';
			case 'error': return 'Error';
			case 'disconnected':
			default: return 'Disconnected';
		}
	}
})();
