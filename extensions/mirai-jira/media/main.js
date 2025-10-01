// Mirai Jira Extension Webview Script

(function () {
	'use strict';

	const vscode = acquireVsCodeApi();
	let currentIssueKey = null;

	// Initialize the webview
	function init() {
		setupEventListeners();
		updateViewState();
	}

	// Set up all event listeners
	function setupEventListeners() {
		// Authentication
		const authBtn = document.getElementById('auth-btn');
		if (authBtn) {
			authBtn.addEventListener('click', () => {
				vscode.postMessage({ type: 'authenticate' });
			});
		}

		// OAuth Authentication
		const oauthBtn = document.getElementById('oauth-btn');
		if (oauthBtn) {
			oauthBtn.addEventListener('click', () => {
				vscode.postMessage({ type: 'authenticateOAuth' });
			});
		}

		// Clear token
		const clearTokenBtn = document.getElementById('clear-token-btn');
		if (clearTokenBtn) {
			clearTokenBtn.addEventListener('click', () => {
				vscode.postMessage({ type: 'clearToken' });
			});
		}

		// Refresh
		const refreshBtn = document.getElementById('refresh-btn');
		if (refreshBtn) {
			refreshBtn.addEventListener('click', () => {
				showStatus('Refreshing...');
				vscode.postMessage({ type: 'refreshData' });
			});
		}

		// Search
		const searchBtn = document.getElementById('search-btn');
		const searchInput = document.getElementById('issue-search');
		if (searchBtn && searchInput) {
			const performSearch = () => {
				const query = searchInput.value.trim();
				if (query) {
					showStatus('Searching...');
					vscode.postMessage({
						type: 'searchIssues',
						query: query
					});
				}
			};

			searchBtn.addEventListener('click', performSearch);
			searchInput.addEventListener('keypress', (e) => {
				if (e.key === 'Enter') {
					performSearch();
				}
			});
		}

		// Create issue
		const createIssueBtn = document.getElementById('create-issue-btn');
		if (createIssueBtn) {
			createIssueBtn.addEventListener('click', () => {
				showCreateIssueDialog();
			});
		}


		// Generate Tests
		const generateTestsBtn = document.getElementById('generate-tests-btn');
		if (generateTestsBtn) {
			generateTestsBtn.addEventListener('click', () => {
				showSelectIssueDialog('generateTests');
			});
		}


		// Quick Actions
		const myIssuesBtn = document.getElementById('my-issues-btn');
		if (myIssuesBtn) {
			myIssuesBtn.addEventListener('click', () => {
				vscode.postMessage({ type: 'filterMyIssues' });
			});
		}

		const recentIssuesBtn = document.getElementById('recent-issues-btn');
		if (recentIssuesBtn) {
			recentIssuesBtn.addEventListener('click', () => {
				vscode.postMessage({ type: 'filterRecentIssues' });
			});
		}

		const inProgressBtn = document.getElementById('in-progress-btn');
		if (inProgressBtn) {
			inProgressBtn.addEventListener('click', () => {
				vscode.postMessage({ type: 'filterInProgress' });
			});
		}

		// Modal handlers
		setupModalHandlers();
	}

	// Set up modal event handlers
	function setupModalHandlers() {
		const modal = document.getElementById('issue-modal');
		const closeModal = document.getElementById('close-modal');

		if (closeModal) {
			closeModal.addEventListener('click', hideModal);
		}

		if (modal) {
			modal.addEventListener('click', (e) => {
				if (e.target === modal) {
					hideModal();
				}
			});
		}

		// Modal action buttons
		const sendToChatBtn = document.getElementById('send-to-chat-btn');
		if (sendToChatBtn) {
			sendToChatBtn.addEventListener('click', () => {
				if (currentIssueKey) {
					vscode.postMessage({
						type: 'sendToChat',
						issueKey: currentIssueKey
					});
					hideModal();
				}
			});
		}

		const analyzeIssueBtn = document.getElementById('analyze-issue-btn');
		if (analyzeIssueBtn) {
			analyzeIssueBtn.addEventListener('click', () => {
				if (currentIssueKey) {
					vscode.postMessage({
						type: 'analyzeIssue',
						issueKey: currentIssueKey
					});
					hideModal();
				}
			});
		}

		const generateCodeBtn = document.getElementById('generate-code-btn');
		if (generateCodeBtn) {
			generateCodeBtn.addEventListener('click', () => {
				if (currentIssueKey) {
					vscode.postMessage({
						type: 'generateCode',
						issueKey: currentIssueKey
					});
					hideModal();
				}
			});
		}

		const openJiraBtn = document.getElementById('open-jira-btn');
		if (openJiraBtn) {
			openJiraBtn.addEventListener('click', () => {
				if (currentIssueKey) {
					vscode.postMessage({
						type: 'openIssue',
						issueKey: currentIssueKey
					});
					hideModal();
				}
			});
		}
	}

	// Show status message
	function showStatus(message) {
		const statusIndicator = document.getElementById('status-indicator');
		const statusText = document.getElementById('status-text');

		if (statusIndicator && statusText) {
			statusText.textContent = message;
			statusIndicator.style.display = 'block';

			// Hide after 3 seconds if it's not a loading message
			if (!message.includes('...')) {
				setTimeout(() => {
					statusIndicator.style.display = 'none';
				}, 3000);
			}
		}
	}

	// Hide status message
	function hideStatus() {
		const statusIndicator = document.getElementById('status-indicator');
		if (statusIndicator) {
			statusIndicator.style.display = 'none';
		}
	}

	// Show create issue dialog
	function showCreateIssueDialog() {
		// This would typically show a more sophisticated dialog
		// For now, we'll use the command handler in the extension
		vscode.postMessage({ type: 'createIssue' });
	}

	// Show select issue dialog for various actions
	function showSelectIssueDialog(action) {
		// This would show a list of issues to select from
		// For now, we'll prompt for an issue key
		const issueKey = prompt('Enter the issue key (e.g., PROJ-123):');
		if (issueKey && issueKey.trim()) {
			vscode.postMessage({
				type: action,
				issueKey: issueKey.trim().toUpperCase()
			});
		}
	}

	// Show issue details modal
	function showIssueModal(issue) {
		currentIssueKey = issue.key;

		const modal = document.getElementById('issue-modal');
		const title = document.getElementById('issue-title');
		const details = document.getElementById('issue-details');

		if (modal && title && details) {
			title.textContent = `${issue.key}: ${issue.fields.summary}`;
			details.innerHTML = formatIssueDetails(issue);
			modal.style.display = 'block';
		}
	}

	// Hide modal
	function hideModal() {
		const modal = document.getElementById('issue-modal');
		if (modal) {
			modal.style.display = 'none';
		}
		currentIssueKey = null;
	}

	// Format issue details for display
	function formatIssueDetails(issue) {
		const assignee = issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned';
		const priority = issue.fields.priority ? issue.fields.priority.name : 'None';
		const components = issue.fields.components.map(c => c.name).join(', ') || 'None';
		const labels = issue.fields.labels.join(', ') || 'None';

		return `
            <div class="issue-details">
                <div class="field">
                    <span class="field-label">Project:</span>
                    <span class="field-value">${issue.fields.project.name} (${issue.fields.project.key})</span>
                </div>
                <div class="field">
                    <span class="field-label">Type:</span>
                    <span class="field-value">${issue.fields.issuetype.name}</span>
                </div>
                <div class="field">
                    <span class="field-label">Status:</span>
                    <span class="field-value">${issue.fields.status.name}</span>
                </div>
                <div class="field">
                    <span class="field-label">Priority:</span>
                    <span class="field-value">${priority}</span>
                </div>
                <div class="field">
                    <span class="field-label">Assignee:</span>
                    <span class="field-value">${assignee}</span>
                </div>
                <div class="field">
                    <span class="field-label">Reporter:</span>
                    <span class="field-value">${issue.fields.reporter.displayName}</span>
                </div>
                <div class="field">
                    <span class="field-label">Components:</span>
                    <span class="field-value">${components}</span>
                </div>
                <div class="field">
                    <span class="field-label">Labels:</span>
                    <span class="field-value">${labels}</span>
                </div>
                <div class="field">
                    <span class="field-label">Created:</span>
                    <span class="field-value">${new Date(issue.fields.created).toLocaleDateString()}</span>
                </div>
                <div class="field">
                    <span class="field-label">Updated:</span>
                    <span class="field-value">${new Date(issue.fields.updated).toLocaleDateString()}</span>
                </div>
                ${issue.fields.description ? `
                    <div class="description">
                        <div class="field-label">Description:</div>
                        <div class="field-value description-content">${issue.fields.description}</div>
                    </div>
                ` : ''}
            </div>
        `;
	}

	// Update view state based on configuration
	function updateViewState() {
		// This would be called when the view needs to update
		// The actual view switching is handled by the HTML generation
	}

	// Handle messages from the extension
	window.addEventListener('message', event => {
		const message = event.data;

		switch (message.type) {
			case 'updateStatus':
				showStatus(message.status);
				break;
			case 'hideStatus':
				hideStatus();
				break;
			case 'showIssue':
				showIssueModal(message.issue);
				break;
			case 'showError':
				showError(message.error);
				break;
			case 'showSuccess':
				showSuccess(message.message);
				break;
			case 'updateIssues':
				updateIssuesList(message.issues);
				break;
		}
	});

	// Show error message
	function showError(error) {
		showStatus(`Error: ${error}`);
	}

	// Show success message
	function showSuccess(message) {
		showStatus(`✓ ${message}`);
	}

	// Update issues list (if we have an issues section in the webview)
	function updateIssuesList(issues) {
		// This would update a list of issues if we had one in the webview
		// For now, just update the status
		showStatus(`Loaded ${issues.length} issues`);
	}

	// Keyboard shortcuts
	document.addEventListener('keydown', (e) => {
		// Escape key to close modal
		if (e.key === 'Escape') {
			hideModal();
		}

		// Ctrl/Cmd + R to refresh
		if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
			e.preventDefault();
			vscode.postMessage({ type: 'refreshData' });
		}

		// Ctrl/Cmd + N to create new issue
		if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
			e.preventDefault();
			showCreateIssueDialog();
		}

		// Ctrl/Cmd + F to focus search
		if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
			e.preventDefault();
			const searchInput = document.getElementById('issue-search');
			if (searchInput) {
				searchInput.focus();
			}
		}
	});

	// Utility functions
	function debounce(func, wait) {
		let timeout;
		return function executedFunction(...args) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}

	// Add search input debouncing for better UX
	const searchInput = document.getElementById('issue-search');
	if (searchInput) {
		const debouncedSearch = debounce((query) => {
			if (query.length > 2) {
				vscode.postMessage({
					type: 'searchIssues',
					query: query
				});
			}
		}, 500);

		searchInput.addEventListener('input', (e) => {
			debouncedSearch(e.target.value.trim());
		});
	}

	// Initialize when DOM is ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}

	// Save and restore state
	function saveState() {
		const state = {
			currentIssueKey: currentIssueKey,
			searchQuery: document.getElementById('issue-search')?.value || ''
		};
		vscode.setState(state);
	}

	function restoreState() {
		const state = vscode.getState();
		if (state) {
			currentIssueKey = state.currentIssueKey;
			const searchInput = document.getElementById('issue-search');
			if (searchInput && state.searchQuery) {
				searchInput.value = state.searchQuery;
			}
		}
	}

	// Restore state on load
	restoreState();

	// Save state on unload
	window.addEventListener('beforeunload', saveState);

	// Initialize the webview
	init();

})();
