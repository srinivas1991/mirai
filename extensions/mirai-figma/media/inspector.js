(function () {
	const vscode = acquireVsCodeApi();

	let currentFileKey = null;
	let currentNodeId = null;

	// Listen for messages from the extension
	window.addEventListener('message', event => {
		const message = event.data;

		switch (message.type) {
			case 'updateInspector':
				updateInspector(message.fileKey, message.nodeId);
				break;
		}
	});

	function updateInspector(fileKey, nodeId) {
		currentFileKey = fileKey;
		currentNodeId = nodeId;

		if (!nodeId) {
			showNoSelection();
			return;
		}

		// Fetch node data and update UI
		// This would be implemented to fetch actual Figma data
		showInspectorContent({
			name: 'Button Component',
			width: 120,
			height: 40,
			x: 100,
			y: 200,
			fills: [
				{ type: 'SOLID', color: { r: 0.2, g: 0.5, b: 0.9, a: 1 } }
			],
			textStyle: {
				fontSize: 14,
				fontFamily: 'Inter',
				fontWeight: 500
			}
		});
	}

	function showNoSelection() {
		document.getElementById('no-selection').style.display = 'block';
		document.getElementById('inspector-content').style.display = 'none';
	}

	function showInspectorContent(nodeData) {
		document.getElementById('no-selection').style.display = 'none';
		document.getElementById('inspector-content').style.display = 'block';

		// Update dimensions
		document.getElementById('width').textContent = nodeData.width + 'px';
		document.getElementById('height').textContent = nodeData.height + 'px';
		document.getElementById('x').textContent = nodeData.x + 'px';
		document.getElementById('y').textContent = nodeData.y + 'px';

		// Update fills
		const fillsContainer = document.getElementById('fills-container');
		fillsContainer.innerHTML = '';

		if (nodeData.fills && nodeData.fills.length > 0) {
			nodeData.fills.forEach(fill => {
				const fillElement = document.createElement('div');
				fillElement.className = 'property';

				const colorHex = rgbToHex(fill.color);
				fillElement.innerHTML = `
					<span class="property-name">Fill</span>
					<span class="property-value">
						<span class="color-preview" style="background-color: ${colorHex}"></span>
						${colorHex}
					</span>
				`;
				fillsContainer.appendChild(fillElement);
			});
		}

		// Update typography
		const typographyContainer = document.getElementById('typography-container');
		typographyContainer.innerHTML = '';

		if (nodeData.textStyle) {
			const textStyle = nodeData.textStyle;
			typographyContainer.innerHTML = `
				<div class="property">
					<span class="property-name">Font Family</span>
					<span class="property-value">${textStyle.fontFamily}</span>
				</div>
				<div class="property">
					<span class="property-name">Font Size</span>
					<span class="property-value">${textStyle.fontSize}px</span>
				</div>
				<div class="property">
					<span class="property-name">Font Weight</span>
					<span class="property-value">${textStyle.fontWeight}</span>
				</div>
			`;
		}
	}

	function rgbToHex(color) {
		const r = Math.round((color.r || 0) * 255);
		const g = Math.round((color.g || 0) * 255);
		const b = Math.round((color.b || 0) * 255);
		return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
	}

	// Global functions for button clicks
	window.openInFigma = function () {
		if (currentFileKey && currentNodeId) {
			const figmaUrl = `https://www.figma.com/file/${currentFileKey}?node-id=${currentNodeId}`;
			vscode.postMessage({
				type: 'openInFigma',
				url: figmaUrl
			});
		}
	};

	window.copyNodeId = function () {
		if (currentNodeId) {
			vscode.postMessage({
				type: 'copyNodeId',
				nodeId: currentNodeId
			});
		}
	};
})();

