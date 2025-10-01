import * as vscode from 'vscode';
import { FigmaApiService, FigmaNode } from './figmaApiService';

export interface CodeGenerationOptions {
	framework: 'react' | 'vue' | 'angular' | 'html';
	includeStyles: boolean;
	useDesignTokens: boolean;
}

export class CodeGenerator {
	private figmaApi: FigmaApiService;

	constructor() {
		this.figmaApi = new FigmaApiService();
	}

	async generateFromNode(fileKey: string, nodeId?: string): Promise<string> {
		const config = vscode.workspace.getConfiguration('mirai-figma');
		const framework = config.get('codeGeneration.framework') as string || 'react';

		const options: CodeGenerationOptions = {
			framework: framework as any,
			includeStyles: true,
			useDesignTokens: false
		};

		if (nodeId) {
			const nodes = await this.figmaApi.getFileNodes(fileKey, [nodeId]);
			const node = nodes[nodeId];
			if (!node) {
				throw new Error('Node not found');
			}
			return this.generateFromSingleNode(node, options);
		} else {
			const file = await this.figmaApi.getFile(fileKey);
			return this.generateFromSingleNode(file.document, options);
		}
	}

	private generateFromSingleNode(node: FigmaNode, options: CodeGenerationOptions): string {
		switch (options.framework) {
			case 'react':
				return this.generateReactComponent(node, options);
			case 'vue':
				return this.generateVueComponent(node, options);
			case 'angular':
				return this.generateAngularComponent(node, options);
			case 'html':
				return this.generateHtmlComponent(node, options);
			default:
				return this.generateReactComponent(node, options);
		}
	}

	private generateReactComponent(node: FigmaNode, options: CodeGenerationOptions): string {
		const componentName = this.sanitizeComponentName(node.name);
		const styles = options.includeStyles ? this.generateStyles(node) : '';
		const jsx = this.generateJSX(node, options);

		return `import React from 'react';
${options.includeStyles ? "import './styles.css';" : ''}

interface ${componentName}Props {
	className?: string;
	children?: React.ReactNode;
}

export const ${componentName}: React.FC<${componentName}Props> = ({
	className = '',
	children,
	...props
}) => {
	return (
		${jsx}
	);
};

export default ${componentName};

${options.includeStyles ? `
/* styles.css */
${styles}
` : ''}`;
	}

	private generateVueComponent(node: FigmaNode, options: CodeGenerationOptions): string {
		const componentName = this.sanitizeComponentName(node.name);
		const template = this.generateVueTemplate(node, options);
		const styles = options.includeStyles ? this.generateStyles(node) : '';

		return `<template>
	${template}
</template>

<script setup lang="ts">
interface Props {
	className?: string;
}

const props = withDefaults(defineProps<Props>(), {
	className: ''
});
</script>

${options.includeStyles ? `
<style scoped>
${styles}
</style>
` : ''}`;
	}

	private generateAngularComponent(node: FigmaNode, options: CodeGenerationOptions): string {
		const componentName = this.sanitizeComponentName(node.name);
		const template = this.generateAngularTemplate(node, options);
		const styles = options.includeStyles ? this.generateStyles(node) : '';

		return `import { Component, Input } from '@angular/core';

@Component({
	selector: 'app-${componentName.toLowerCase()}',
	template: \`
		${template}
	\`,
	${options.includeStyles ? `styleUrls: ['./${componentName.toLowerCase()}.component.css']` : 'styles: []'}
})
export class ${componentName}Component {
	@Input() className: string = '';
}

${options.includeStyles ? `
/* ${componentName.toLowerCase()}.component.css */
${styles}
` : ''}`;
	}

	private generateHtmlComponent(node: FigmaNode, options: CodeGenerationOptions): string {
		const html = this.generateHtml(node, options);
		const styles = options.includeStyles ? this.generateStyles(node) : '';

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${node.name}</title>
	${options.includeStyles ? '<style>\n' + styles + '\n</style>' : ''}
</head>
<body>
	${html}
</body>
</html>`;
	}

	private generateJSX(node: FigmaNode, options: CodeGenerationOptions): string {
		const className = this.generateClassName(node);
		const attributes = this.generateAttributes(node);
		const content = this.generateContent(node, options);

		const tag = this.getHtmlTag(node);

		return `<${tag}
			className={\`${className} \${className}\`}
			${attributes}
			{...props}
		>
			${content}
		</${tag}>`;
	}

	private generateVueTemplate(node: FigmaNode, options: CodeGenerationOptions): string {
		const className = this.generateClassName(node);
		const attributes = this.generateVueAttributes(node);
		const content = this.generateVueContent(node, options);

		const tag = this.getHtmlTag(node);

		return `<${tag}
			:class="['${className}', className]"
			${attributes}
		>
			${content}
		</${tag}>`;
	}

	private generateAngularTemplate(node: FigmaNode, options: CodeGenerationOptions): string {
		const className = this.generateClassName(node);
		const attributes = this.generateAngularAttributes(node);
		const content = this.generateAngularContent(node, options);

		const tag = this.getHtmlTag(node);

		return `<${tag}
			class="${className} {{className}}"
			${attributes}
		>
			${content}
		</${tag}>`;
	}

	private generateHtml(node: FigmaNode, options: CodeGenerationOptions): string {
		const className = this.generateClassName(node);
		const attributes = this.generateHtmlAttributes(node);
		const content = this.generateHtmlContent(node, options);

		const tag = this.getHtmlTag(node);

		return `<${tag} class="${className}" ${attributes}>
			${content}
		</${tag}>`;
	}

	private generateStyles(node: FigmaNode): string {
		const className = this.generateClassName(node);
		let styles = `.${className} {\n`;

		// Layout styles
		if (node.type === 'FRAME' || node.type === 'GROUP') {
			styles += this.generateLayoutStyles(node);
		}

		// Visual styles
		styles += this.generateVisualStyles(node);

		// Typography styles
		if (node.type === 'TEXT') {
			styles += this.generateTypographyStyles(node);
		}

		styles += '}\n\n';

		// Generate styles for children
		if (node.children) {
			for (const child of node.children) {
				styles += this.generateStyles(child);
			}
		}

		return styles;
	}

	private generateLayoutStyles(node: any): string {
		let styles = '';

		// Display and layout
		if (node.layoutMode) {
			styles += '  display: flex;\n';
			styles += `  flex-direction: ${node.layoutMode === 'HORIZONTAL' ? 'row' : 'column'};\n`;
		}

		// Dimensions
		if (node.absoluteBoundingBox) {
			styles += `  width: ${node.absoluteBoundingBox.width}px;\n`;
			styles += `  height: ${node.absoluteBoundingBox.height}px;\n`;
		}

		// Padding
		if (node.paddingLeft !== undefined) {
			styles += `  padding: ${node.paddingTop || 0}px ${node.paddingRight || 0}px ${node.paddingBottom || 0}px ${node.paddingLeft || 0}px;\n`;
		}

		// Gap
		if (node.itemSpacing !== undefined) {
			styles += `  gap: ${node.itemSpacing}px;\n`;
		}

		return styles;
	}

	private generateVisualStyles(node: any): string {
		let styles = '';

		// Background
		if (node.fills && node.fills.length > 0) {
			const fill = node.fills[0];
			if (fill.type === 'SOLID') {
				const color = this.rgbToHex(fill.color);
				styles += `  background-color: ${color};\n`;
			}
		}

		// Border
		if (node.strokes && node.strokes.length > 0) {
			const stroke = node.strokes[0];
			if (stroke.type === 'SOLID') {
				const color = this.rgbToHex(stroke.color);
				const width = node.strokeWeight || 1;
				styles += `  border: ${width}px solid ${color};\n`;
			}
		}

		// Border radius
		if (node.cornerRadius !== undefined) {
			styles += `  border-radius: ${node.cornerRadius}px;\n`;
		}

		// Shadow
		if (node.effects && node.effects.length > 0) {
			const effect = node.effects[0];
			if (effect.type === 'DROP_SHADOW') {
				const shadow = this.formatShadow(effect);
				styles += `  box-shadow: ${shadow};\n`;
			}
		}

		return styles;
	}

	private generateTypographyStyles(node: any): string {
		let styles = '';

		if (node.style) {
			const { fontFamily, fontWeight, fontSize, lineHeightPx, textAlignHorizontal } = node.style;

			if (fontFamily) styles += `  font-family: "${fontFamily}";\n`;
			if (fontWeight) styles += `  font-weight: ${fontWeight};\n`;
			if (fontSize) styles += `  font-size: ${fontSize}px;\n`;
			if (lineHeightPx) styles += `  line-height: ${lineHeightPx}px;\n`;
			if (textAlignHorizontal) styles += `  text-align: ${textAlignHorizontal.toLowerCase()};\n`;
		}

		return styles;
	}

	private generateContent(node: FigmaNode, options: CodeGenerationOptions): string {
		if (node.type === 'TEXT' && node.characters) {
			return node.characters;
		}

		if (node.children && node.children.length > 0) {
			return node.children
				.map(child => this.generateJSX(child, options))
				.join('\n\t\t\t');
		}

		return '{children}';
	}

	private generateVueContent(node: FigmaNode, options: CodeGenerationOptions): string {
		if (node.type === 'TEXT' && node.characters) {
			return node.characters;
		}

		if (node.children && node.children.length > 0) {
			return node.children
				.map(child => this.generateVueTemplate(child, options))
				.join('\n\t\t');
		}

		return '<slot />';
	}

	private generateAngularContent(node: FigmaNode, options: CodeGenerationOptions): string {
		if (node.type === 'TEXT' && node.characters) {
			return node.characters;
		}

		if (node.children && node.children.length > 0) {
			return node.children
				.map(child => this.generateAngularTemplate(child, options))
				.join('\n\t\t');
		}

		return '<ng-content></ng-content>';
	}

	private generateHtmlContent(node: FigmaNode, options: CodeGenerationOptions): string {
		if (node.type === 'TEXT' && node.characters) {
			return node.characters;
		}

		if (node.children && node.children.length > 0) {
			return node.children
				.map(child => this.generateHtml(child, options))
				.join('\n\t\t');
		}

		return '';
	}

	private generateClassName(node: FigmaNode): string {
		return this.sanitizeComponentName(node.name).toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase();
	}

	private generateAttributes(node: FigmaNode): string {
		// Generate React-specific attributes
		return '';
	}

	private generateVueAttributes(node: FigmaNode): string {
		// Generate Vue-specific attributes
		return '';
	}

	private generateAngularAttributes(node: FigmaNode): string {
		// Generate Angular-specific attributes
		return '';
	}

	private generateHtmlAttributes(node: FigmaNode): string {
		// Generate HTML attributes
		return '';
	}

	private getHtmlTag(node: FigmaNode): string {
		switch (node.type) {
			case 'TEXT':
				return 'span';
			case 'FRAME':
			case 'GROUP':
				return 'div';
			case 'RECTANGLE':
				return 'div';
			case 'ELLIPSE':
				return 'div';
			default:
				return 'div';
		}
	}

	private sanitizeComponentName(name: string): string {
		return name
			.replace(/[^a-zA-Z0-9\s]/g, '')
			.replace(/\s+/g, ' ')
			.split(' ')
			.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join('');
	}

	private rgbToHex(rgb: { r: number; g: number; b: number }): string {
		const toHex = (n: number) => {
			const hex = Math.round(n * 255).toString(16);
			return hex.length === 1 ? '0' + hex : hex;
		};

		return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
	}

	private formatShadow(effect: any): string {
		const { offset, radius, color } = effect;
		const shadowColor = color ? this.rgbToHex(color) : '#000000';

		return `${offset?.x || 0}px ${offset?.y || 0}px ${radius || 0}px ${shadowColor}`;
	}
}



