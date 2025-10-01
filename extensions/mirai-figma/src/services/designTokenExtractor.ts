import * as vscode from 'vscode';
import { FigmaApiService, FigmaNode } from './figmaApiService';

export interface DesignToken {
	name: string;
	value: string;
	type: 'color' | 'typography' | 'spacing' | 'shadow' | 'border-radius';
	description?: string;
}

export interface DesignTokens {
	colors: { [key: string]: DesignToken };
	typography: { [key: string]: DesignToken };
	spacing: { [key: string]: DesignToken };
	shadows: { [key: string]: DesignToken };
	borderRadius: { [key: string]: DesignToken };
}

export class DesignTokenExtractor {
	private figmaApi: FigmaApiService;

	constructor() {
		this.figmaApi = new FigmaApiService();
	}

	async extractTokens(fileKey: string): Promise<DesignTokens> {
		const file = await this.figmaApi.getFile(fileKey);

		const tokens: DesignTokens = {
			colors: {},
			typography: {},
			spacing: {},
			shadows: {},
			borderRadius: {}
		};

		// Extract from styles
		if (file.styles) {
			for (const [styleId, style] of Object.entries(file.styles)) {
				this.extractFromStyle(style, tokens);
			}
		}

		// Extract from document nodes
		this.extractFromNode(file.document, tokens);

		return tokens;
	}

	private extractFromStyle(style: any, tokens: DesignTokens) {
		const { name, styleType, description } = style;

		switch (styleType) {
			case 'FILL':
				// Extract color tokens
				if (style.fills && style.fills.length > 0) {
					const fill = style.fills[0];
					if (fill.type === 'SOLID') {
						const color = this.rgbToHex(fill.color);
						tokens.colors[this.sanitizeName(name)] = {
							name,
							value: color,
							type: 'color',
							description
						};
					}
				}
				break;

			case 'TEXT':
				// Extract typography tokens
				if (style.textStyles) {
					const textStyle = style.textStyles;
					tokens.typography[this.sanitizeName(name)] = {
						name,
						value: this.formatTextStyle(textStyle),
						type: 'typography',
						description
					};
				}
				break;

			case 'EFFECT':
				// Extract shadow tokens
				if (style.effects && style.effects.length > 0) {
					const effect = style.effects[0];
					if (effect.type === 'DROP_SHADOW') {
						tokens.shadows[this.sanitizeName(name)] = {
							name,
							value: this.formatShadow(effect),
							type: 'shadow',
							description
						};
					}
				}
				break;
		}
	}

	private extractFromNode(node: FigmaNode, tokens: DesignTokens) {
		// Extract spacing from layout grids and constraints
		if (node.type === 'FRAME' || node.type === 'GROUP') {
			this.extractSpacingFromLayout(node, tokens);
		}

		// Extract border radius
		if (node.type === 'RECTANGLE' || node.type === 'FRAME') {
			this.extractBorderRadius(node, tokens);
		}

		// Recursively process children
		if (node.children) {
			for (const child of node.children) {
				this.extractFromNode(child, tokens);
			}
		}
	}

	private extractSpacingFromLayout(node: any, tokens: DesignTokens) {
		// Extract padding and margins from auto-layout
		if (node.layoutMode && node.layoutMode !== 'NONE') {
			if (node.paddingLeft !== undefined) {
				tokens.spacing[`padding-${node.name?.toLowerCase().replace(/\s+/g, '-')}`] = {
					name: `Padding ${node.name}`,
					value: `${node.paddingLeft}px`,
					type: 'spacing'
				};
			}

			if (node.itemSpacing !== undefined) {
				tokens.spacing[`gap-${node.name?.toLowerCase().replace(/\s+/g, '-')}`] = {
					name: `Gap ${node.name}`,
					value: `${node.itemSpacing}px`,
					type: 'spacing'
				};
			}
		}
	}

	private extractBorderRadius(node: any, tokens: DesignTokens) {
		if (node.cornerRadius !== undefined && node.cornerRadius > 0) {
			const name = node.name?.toLowerCase().replace(/\s+/g, '-') || 'unnamed';
			tokens.borderRadius[`radius-${name}`] = {
				name: `Border Radius ${node.name || 'Unnamed'}`,
				value: `${node.cornerRadius}px`,
				type: 'border-radius'
			};
		}
	}

	private rgbToHex(rgb: { r: number; g: number; b: number }): string {
		const toHex = (n: number) => {
			const hex = Math.round(n * 255).toString(16);
			return hex.length === 1 ? '0' + hex : hex;
		};

		return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
	}

	private formatTextStyle(textStyle: any): string {
		const { fontFamily, fontWeight, fontSize, lineHeight } = textStyle;

		let css = '';
		if (fontFamily) css += `font-family: "${fontFamily}"; `;
		if (fontWeight) css += `font-weight: ${fontWeight}; `;
		if (fontSize) css += `font-size: ${fontSize}px; `;
		if (lineHeight) css += `line-height: ${lineHeight}px; `;

		return css.trim();
	}

	private formatShadow(effect: any): string {
		const { offset, radius, color } = effect;
		const shadowColor = color ? this.rgbToHex(color) : '#000000';

		return `${offset?.x || 0}px ${offset?.y || 0}px ${radius || 0}px ${shadowColor}`;
	}

	private sanitizeName(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, '')
			.replace(/\s+/g, '-')
			.replace(/^-+|-+$/g, '');
	}
}



