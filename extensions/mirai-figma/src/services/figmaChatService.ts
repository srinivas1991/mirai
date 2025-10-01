import * as vscode from 'vscode';
import { FigmaApiService, FigmaFile, FigmaNode } from './figmaApiService';

export interface FigmaDesignContext {
	fileKey: string;
	fileName: string;
	nodeId?: string;
	nodeName?: string;
	designData: any;
	imageUrl?: string;
}

export class FigmaChatService {
	constructor(private figmaApi: FigmaApiService) { }

	/**
	 * Send Figma design context to the chat LLM
	 */
	async sendDesignToChat(context: FigmaDesignContext, userPrompt?: string): Promise<void> {
		try {
			// Prepare the message for the chat
			const designInfo = this.formatDesignInfo(context);
			const prompt = userPrompt || 'Please analyze this Figma design and provide insights.';

			const fullMessage = `${prompt}\n\n**Figma Design Context:**\n${designInfo}`;

			// Open Mirai sidebar first
			await vscode.commands.executeCommand('void.openSidebar');

			// Send the message to Mirai's chat interface
			// Note: This command needs to be implemented in Mirai's codebase
			try {
				await vscode.commands.executeCommand('void.sendChatMessage', fullMessage);
			} catch (commandError) {
				// Fallback: copy to clipboard and notify user
				await vscode.env.clipboard.writeText(fullMessage);
				vscode.window.showInformationMessage(
					'Design context copied to clipboard! Please paste it into Mirai\'s chat. 📋',
					'Open Mirai Chat'
				).then(action => {
					if (action === 'Open Mirai Chat') {
						vscode.commands.executeCommand('void.openSidebar');
					}
				});
				return;
			}

			vscode.window.showInformationMessage('Design context sent to Mirai chat! 💬');
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to send design to chat: ${error}`);
		}
	}

	/**
	 * Generate code from Figma design using chat LLM
	 */
	async generateCodeWithChat(fileKey: string, nodeId?: string, framework: string = 'react'): Promise<void> {
		try {
			const file = await this.figmaApi.getFile(fileKey);
			let targetNode: FigmaNode | undefined;
			let nodeName = 'entire design';

			if (nodeId) {
				targetNode = this.findNodeById(file.document, nodeId);
				nodeName = targetNode?.name || 'selected component';
			}

			const designContext: FigmaDesignContext = {
				fileKey,
				fileName: file.name,
				nodeId,
				nodeName,
				designData: targetNode || file.document
			};

			// Get design image if possible
			if (nodeId) {
				try {
					const imageResponse = await this.figmaApi.getImages(fileKey, [nodeId]);
					designContext.imageUrl = imageResponse[nodeId];
				} catch (error) {
					console.warn('Could not get design image:', error);
				}
			}

			const prompt = `Please generate ${framework} code for this Figma design.

Focus on:
- Component structure and hierarchy
- Styling (CSS/styled-components)
- Responsive design
- Accessibility features
- Best practices for ${framework}

Make the code production-ready and well-commented.`;

			await this.sendDesignToChat(designContext, prompt);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to generate code with chat: ${error}`);
		}
	}

	/**
	 * Extract design tokens and send to chat for analysis
	 */
	async analyzeDesignTokensWithChat(fileKey: string): Promise<void> {
		try {
			const file = await this.figmaApi.getFile(fileKey);

			// Extract basic design information
			const colors = this.extractColors(file.document);
			const typography = this.extractTypography(file.document);
			const spacing = this.extractSpacing(file.document);

			const designContext: FigmaDesignContext = {
				fileKey,
				fileName: file.name,
				designData: {
					colors,
					typography,
					spacing,
					styles: file.styles
				}
			};

			const prompt = `Please analyze this Figma design system and help me create a comprehensive design token system.

Focus on:
- Color palette and semantic naming
- Typography scale and hierarchy
- Spacing system and grid
- Component patterns and variants
- CSS custom properties structure
- Design system documentation

Provide recommendations for organizing and implementing these tokens in code.`;

			await this.sendDesignToChat(designContext, prompt);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to analyze design tokens with chat: ${error}`);
		}
	}

	/**
	 * Ask chat to review Figma design for accessibility
	 */
	async reviewAccessibilityWithChat(fileKey: string, nodeId?: string): Promise<void> {
		try {
			const file = await this.figmaApi.getFile(fileKey);
			let targetNode: FigmaNode | undefined;

			if (nodeId) {
				targetNode = this.findNodeById(file.document, nodeId);
			}

			const designContext: FigmaDesignContext = {
				fileKey,
				fileName: file.name,
				nodeId,
				nodeName: targetNode?.name,
				designData: targetNode || file.document
			};

			const prompt = `Please review this Figma design for accessibility compliance and provide recommendations.

Focus on:
- Color contrast ratios (WCAG AA/AAA)
- Text readability and font sizes
- Interactive element sizing (44px minimum)
- Focus states and keyboard navigation
- Screen reader compatibility
- Alternative text for images
- Semantic structure and headings

Provide specific, actionable recommendations for improvement.`;

			await this.sendDesignToChat(designContext, prompt);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to review accessibility with chat: ${error}`);
		}
	}

	private formatDesignInfo(context: FigmaDesignContext): string {
		let info = `## Figma Design Analysis\n\n`;
		info += `**File:** ${context.fileName}\n`;
		info += `**File Key:** ${context.fileKey}\n`;

		if (context.nodeName) {
			info += `**Component/Node:** ${context.nodeName}\n`;
		}

		if (context.imageUrl) {
			info += `**Visual Preview:** ${context.imageUrl}\n`;
		}

		// Add comprehensive design data
		if (context.designData) {
			const designSummary = this.summarizeDesignData(context.designData);

			info += `\n### Design Structure & Properties\n\n`;

			// Add a more readable summary first
			info += this.createReadableDesignSummary(designSummary);

			// Then add the detailed JSON for technical analysis
			info += `\n### Detailed Technical Data\n\n`;
			info += '```json\n';
			info += JSON.stringify(designSummary, null, 2);
			info += '\n```\n';

			// Add extracted design tokens if available
			const designTokens = this.extractDesignTokens(context.designData);
			if (Object.keys(designTokens).length > 0) {
				info += `\n### Design Tokens Extracted\n\n`;
				info += '```json\n';
				info += JSON.stringify(designTokens, null, 2);
				info += '\n```\n';
			}
		}

		return info;
	}

	private createReadableDesignSummary(data: any): string {
		let summary = '';

		if (data.type) {
			summary += `**Type:** ${data.type}\n`;
		}

		if (data.width && data.height) {
			summary += `**Dimensions:** ${data.width} × ${data.height}px\n`;
		}

		if (data.text) {
			summary += `**Text Content:** "${data.text}"\n`;
		}

		if (data.fills && data.fills.length > 0) {
			const colors = data.fills.map((fill: any) => fill.color).filter(Boolean);
			if (colors.length > 0) {
				summary += `**Colors:** ${colors.join(', ')}\n`;
			}
		}

		if (data.textStyle) {
			summary += `**Typography:** ${data.textStyle.fontFamily} ${data.textStyle.fontWeight}, ${data.textStyle.fontSize}px\n`;
		}

		if (data.layout) {
			summary += `**Layout:** ${data.layout.mode} layout`;
			if (data.layout.itemSpacing) {
				summary += ` with ${data.layout.itemSpacing}px spacing`;
			}
			summary += '\n';
		}

		if (data.childrenCount) {
			summary += `**Child Elements:** ${data.childrenCount} components\n`;
		}

		return summary + '\n';
	}

	private extractDesignTokens(data: any, tokens: any = {}): any {
		if (!tokens.colors) tokens.colors = new Set();
		if (!tokens.typography) tokens.typography = new Set();
		if (!tokens.spacing) tokens.spacing = new Set();
		if (!tokens.borderRadius) tokens.borderRadius = new Set();
		if (!tokens.shadows) tokens.shadows = new Set();

		// Extract colors
		if (data.fills) {
			data.fills.forEach((fill: any) => {
				if (fill.color) {
					tokens.colors.add(this.formatColor(fill.color));
				}
			});
		}

		if (data.strokes) {
			data.strokes.forEach((stroke: any) => {
				if (stroke.color) {
					tokens.colors.add(this.formatColor(stroke.color));
				}
			});
		}

		// Extract typography
		if (data.textStyle) {
			const typoToken = {
				fontFamily: data.textStyle.fontFamily,
				fontSize: data.textStyle.fontSize,
				fontWeight: data.textStyle.fontWeight,
				lineHeight: data.textStyle.lineHeight
			};
			tokens.typography.add(JSON.stringify(typoToken));
		}

		// Extract spacing
		if (data.layout && data.layout.padding) {
			const padding = data.layout.padding;
			[padding.top, padding.right, padding.bottom, padding.left].forEach((value: number) => {
				if (value > 0) tokens.spacing.add(value);
			});
		}

		if (data.layout && data.layout.itemSpacing) {
			tokens.spacing.add(data.layout.itemSpacing);
		}

		// Extract border radius
		if (data.borderRadius !== undefined) {
			if (typeof data.borderRadius === 'number') {
				tokens.borderRadius.add(data.borderRadius);
			} else if (typeof data.borderRadius === 'object') {
				Object.values(data.borderRadius).forEach((radius: any) => {
					if (typeof radius === 'number') tokens.borderRadius.add(radius);
				});
			}
		}

		// Extract shadows
		if (data.effects) {
			data.effects.forEach((effect: any) => {
				if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
					const shadowToken = {
						type: effect.type,
						color: effect.color ? this.formatColor(effect.color) : undefined,
						offset: effect.offset,
						radius: effect.radius
					};
					tokens.shadows.add(JSON.stringify(shadowToken));
				}
			});
		}

		// Recursively process children
		if (data.children) {
			data.children.forEach((child: any) => {
				this.extractDesignTokens(child, tokens);
			});
		}

		// Convert Sets to Arrays for JSON serialization
		return {
			colors: Array.from(tokens.colors),
			typography: Array.from(tokens.typography).map((t: any) => JSON.parse(t)),
			spacing: Array.from(tokens.spacing).sort((a: any, b: any) => (a as number) - (b as number)),
			borderRadius: Array.from(tokens.borderRadius).sort((a: any, b: any) => (a as number) - (b as number)),
			shadows: Array.from(tokens.shadows).map((s: any) => JSON.parse(s))
		};
	}

	private summarizeDesignData(data: any, depth: number = 0, maxDepth: number = 5): any {
		// Prevent infinite recursion and limit depth for readability
		if (depth > maxDepth) {
			return { type: data.type, name: data.name, childrenCount: data.children?.length || 0 };
		}

		const summary: any = {};

		// Basic properties
		if (data.type) summary.type = data.type;
		if (data.name) summary.name = data.name;
		if (data.visible !== undefined) summary.visible = data.visible;

		// Dimensions and positioning
		if (data.width !== undefined) summary.width = Math.round(data.width);
		if (data.height !== undefined) summary.height = Math.round(data.height);
		if (data.x !== undefined) summary.x = Math.round(data.x);
		if (data.y !== undefined) summary.y = Math.round(data.y);

		// Fill and stroke information (simplified)
		if (data.fills && data.fills.length > 0) {
			summary.fills = data.fills.map((fill: any) => ({
				type: fill.type,
				color: fill.color ? this.formatColor(fill.color) : undefined,
				opacity: fill.opacity
			})).filter((fill: any) => fill.color || fill.type !== 'SOLID');
		}

		if (data.strokes && data.strokes.length > 0) {
			summary.strokes = data.strokes.map((stroke: any) => ({
				type: stroke.type,
				color: stroke.color ? this.formatColor(stroke.color) : undefined
			}));
		}

		// Typography for text nodes
		if (data.type === 'TEXT') {
			if (data.characters) summary.text = data.characters;
			if (data.style) {
				summary.textStyle = {
					fontSize: data.style.fontSize,
					fontFamily: data.style.fontFamily,
					fontWeight: data.style.fontWeight,
					textAlign: data.style.textAlignHorizontal,
					lineHeight: data.style.lineHeightPx
				};
			}
		}

		// Layout information for frames and groups
		if (data.layoutMode) {
			summary.layout = {
				mode: data.layoutMode, // AUTO_LAYOUT, etc.
				direction: data.primaryAxisSizingMode,
				alignItems: data.counterAxisAlignItems,
				justifyContent: data.primaryAxisAlignItems,
				padding: {
					top: data.paddingTop || 0,
					right: data.paddingRight || 0,
					bottom: data.paddingBottom || 0,
					left: data.paddingLeft || 0
				},
				itemSpacing: data.itemSpacing || 0,
				gap: data.itemSpacing || 0
			};
		}

		// Border radius for rounded elements
		if (data.cornerRadius !== undefined) {
			summary.borderRadius = data.cornerRadius;
		}
		if (data.rectangleCornerRadii) {
			summary.borderRadius = {
				topLeft: data.rectangleCornerRadii[0],
				topRight: data.rectangleCornerRadii[1],
				bottomRight: data.rectangleCornerRadii[2],
				bottomLeft: data.rectangleCornerRadii[3]
			};
		}

		// Effects (shadows, blur, etc.)
		if (data.effects && data.effects.length > 0) {
			summary.effects = data.effects.map((effect: any) => ({
				type: effect.type,
				radius: effect.radius,
				color: effect.color ? this.formatColor(effect.color) : undefined,
				offset: effect.offset ? { x: effect.offset.x, y: effect.offset.y } : undefined
			}));
		}

		// Component and instance information
		if (data.componentId) summary.componentId = data.componentId;
		if (data.mainComponent) summary.isMainComponent = true;

		// Recursively process children with more detail
		if (data.children && data.children.length > 0) {
			summary.childrenCount = data.children.length;

			// For shallow depth, include all children details
			if (depth < 3) {
				summary.children = data.children.map((child: any) =>
					this.summarizeDesignData(child, depth + 1, maxDepth)
				);
			} else {
				// For deeper levels, just include a summary
				summary.childrenSummary = data.children.map((child: any) => ({
					type: child.type,
					name: child.name,
					text: child.characters || undefined
				}));
			}
		}

		return summary;
	}

	private formatColor(color: any): string {
		if (!color) return '';

		const r = Math.round((color.r || 0) * 255);
		const g = Math.round((color.g || 0) * 255);
		const b = Math.round((color.b || 0) * 255);
		const a = color.a !== undefined ? Number(color.a.toFixed(2)) : 1;

		if (a === 1) {
			return `rgb(${r}, ${g}, ${b})`;
		} else {
			return `rgba(${r}, ${g}, ${b}, ${a})`;
		}
	}

	private findNodeById(node: FigmaNode, targetId: string): FigmaNode | undefined {
		if (node.id === targetId) {
			return node;
		}

		if (node.children) {
			for (const child of node.children) {
				const found = this.findNodeById(child, targetId);
				if (found) return found;
			}
		}

		return undefined;
	}

	private extractColors(node: FigmaNode): string[] {
		const colors: string[] = [];

		if (node.fills) {
			for (const fill of node.fills) {
				if (fill.type === 'SOLID' && fill.color) {
					const hex = this.rgbToHex(fill.color);
					if (!colors.includes(hex)) {
						colors.push(hex);
					}
				}
			}
		}

		if (node.children) {
			for (const child of node.children) {
				colors.push(...this.extractColors(child));
			}
		}

		return colors;
	}

	private extractTypography(node: FigmaNode): any[] {
		const typography: any[] = [];

		if (node.type === 'TEXT' && node.style) {
			typography.push({
				text: node.characters,
				fontFamily: node.style.fontFamily,
				fontSize: node.style.fontSize,
				fontWeight: node.style.fontWeight,
				lineHeight: node.style.lineHeightPx
			});
		}

		if (node.children) {
			for (const child of node.children) {
				typography.push(...this.extractTypography(child));
			}
		}

		return typography;
	}

	private extractSpacing(node: FigmaNode): any {
		const spacing: any = {};
		const nodeData = node as any; // Type assertion for layout properties

		if (nodeData.layoutMode && nodeData.layoutMode !== 'NONE') {
			spacing.padding = {
				top: nodeData.paddingTop,
				right: nodeData.paddingRight,
				bottom: nodeData.paddingBottom,
				left: nodeData.paddingLeft
			};
			spacing.itemSpacing = nodeData.itemSpacing;
		}

		return spacing;
	}

	private rgbToHex(rgb: { r: number; g: number; b: number }): string {
		const toHex = (n: number) => {
			const hex = Math.round(n * 255).toString(16);
			return hex.length === 1 ? '0' + hex : hex;
		};

		return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
	}
}
