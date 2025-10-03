import * as vscode from 'vscode';
import { JiraApiService, JiraIssue } from './jiraApiService';

export class JiraChatService {
	constructor(private jiraApi: JiraApiService) {
		console.log('💬 [JiraChat] Service initialized - uses system-wide Mirai auth');
	}

	/**
	 * Get Jira-specific context note for AI
	 * Note: General workspace context (folders, files, structure) is already provided by the system
	 * We only add a reminder to consider the workspace when analyzing Jira tickets
	 */
	private getJiraWorkspaceNote(): string {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return '';
		}

		// Just a brief note - the system message already has full workspace context
		return `\n\n<jira_context_note>
This Jira ticket should be analyzed in the context of the current workspace.
Please provide specific, actionable guidance relevant to the codebase structure you can see in the system context.
</jira_context_note>\n`;
	}

	/**
	 * Check if user is authenticated and has enough credits for a feature
	 */
	private async checkCreditsAndAuth(feature: string): Promise<boolean> {
		try {
			// Try to get Mirai session from the system-wide authentication provider
			let session = await vscode.authentication.getSession('mirai', [], { silent: true });

			if (!session) {
				// No session found, prompt user to sign in via the system auth
				const authenticate = await vscode.window.showInformationMessage(
					'You need to sign in to Mirai to use AI features',
					'Sign In',
					'Cancel'
				);

				if (authenticate === 'Sign In') {
					try {
						// This will use the system-wide Mirai auth provider
						session = await vscode.authentication.getSession('mirai', [], { createIfNone: true });
					} catch (error) {
						vscode.window.showErrorMessage(`Failed to sign in to Mirai: ${error}`);
						return false;
					}
				} else {
					return false;
				}
			}

			if (!session) {
				return false;
			}

			// TODO: Check credits via the system auth provider
			// For now, assume user has credits - the auth provider should handle this
			console.log(`✅ [JiraChat] User authenticated with Mirai, proceeding with ${feature}`);
			return true;
		} catch (error) {
			console.error('Failed to check Mirai authentication:', error);
			vscode.window.showErrorMessage(`Authentication error: ${error}`);
			return false;
		}
	}

	/**
	 * Deduct credits and handle errors
	 */
	private async deductCreditsForFeature(feature: string): Promise<boolean> {
		try {
			// TODO: Deduct credits via the system auth provider
			// For now, just log the action
			console.log(`[JiraChat] Would deduct credits for feature: ${feature} (via system auth)`);
			return true;
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to process credits: ${error}`);
			return false;
		}
	}

	public async sendIssueToChat(issueKey: string): Promise<void> {
		try {
			const issue = await this.jiraApi.getIssue(issueKey);
			const context = this.formatIssueForChat(issue);
			const workspaceNote = this.getJiraWorkspaceNote();
			const message = `I have a Jira issue that I'd like to discuss:\n\n${context}${workspaceNote}`;

			// Use the same pattern as Figma extension for Mirai chat integration
			try {
				await vscode.commands.executeCommand('void.openSidebar');
				await vscode.commands.executeCommand('void.sendChatMessage', message);
				vscode.window.showInformationMessage(`Issue ${issueKey} sent to Mirai chat! 💬`);
			} catch (commandError) {
				// Fallback: copy to clipboard and notify user
				await vscode.env.clipboard.writeText(message);
				vscode.window.showInformationMessage(
					`Issue ${issueKey} context copied to clipboard! Please paste it into Mirai's chat. 📋`,
					'Open Mirai Chat'
				).then(action => {
					if (action === 'Open Mirai Chat') {
						vscode.commands.executeCommand('void.openSidebar');
					}
				});
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to send issue to chat: ${error}`);
		}
	}

	public async analyzeIssueWithChat(issueKey: string): Promise<void> {
		try {
			const issue = await this.jiraApi.getIssue(issueKey);
			const context = this.formatIssueForChat(issue);
			const workspaceNote = this.getJiraWorkspaceNote();

			const analysisPrompt = `Please analyze this Jira issue and provide insights:\n\n${context}${workspaceNote}\n\nPlease analyze:
1. Requirements clarity and completeness
2. Potential technical challenges (considering the current workspace)
3. Estimated complexity
4. Suggested approach or implementation strategy (specific to this codebase)
5. Dependencies or blockers
6. Testing considerations
7. Which files/modules in the current workspace might need changes`;

			// Use the same pattern as Figma extension for Mirai chat integration
			try {
				await vscode.commands.executeCommand('void.openSidebar');
				await vscode.commands.executeCommand('void.sendChatMessage', analysisPrompt);
				vscode.window.showInformationMessage(`Issue ${issueKey} analysis sent to Mirai chat! 💬`);
			} catch (commandError) {
				// Fallback: copy to clipboard and notify user
				await vscode.env.clipboard.writeText(analysisPrompt);
				vscode.window.showInformationMessage(
					`Issue ${issueKey} analysis copied to clipboard! Please paste it into Mirai's chat. 📋`,
					'Open Mirai Chat'
				).then(action => {
					if (action === 'Open Mirai Chat') {
						vscode.commands.executeCommand('void.openSidebar');
					}
				});
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to analyze issue: ${error}`);
		}
	}

	public async generateCodeFromIssue(issueKey: string): Promise<void> {
		try {
			const issue = await this.jiraApi.getIssue(issueKey);
			const context = this.formatIssueForChat(issue);
			const workspaceNote = this.getJiraWorkspaceNote();

			const codePrompt = `Based on this Jira issue, please help me generate relevant code:\n\n${context}${workspaceNote}\n\nPlease consider:
1. The requirements described in the issue
2. Best practices for the technology stack IN THIS CODEBASE
3. Error handling and edge cases
4. Testing approach
5. Code structure and organization that matches the current workspace
6. Existing patterns and conventions in this codebase

Generate code that addresses the requirements while being maintainable and well-documented, following the patterns used in the current workspace.`;

			// Use the same pattern as Figma extension for Mirai chat integration
			try {
				await vscode.commands.executeCommand('void.openSidebar');
				await vscode.commands.executeCommand('void.sendChatMessage', codePrompt);
				vscode.window.showInformationMessage(`Code generation request for ${issueKey} sent to Mirai chat! 💬`);
			} catch (commandError) {
				// Fallback: copy to clipboard and notify user
				await vscode.env.clipboard.writeText(codePrompt);
				vscode.window.showInformationMessage(
					`Code generation request for ${issueKey} copied to clipboard! Please paste it into Mirai's chat. 📋`,
					'Open Mirai Chat'
				).then(action => {
					if (action === 'Open Mirai Chat') {
						vscode.commands.executeCommand('void.openSidebar');
					}
				});
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to generate code from issue: ${error}`);
		}
	}

	public async analyzeCurrentSprint(): Promise<void> {
		console.log('[Jira Debug] Starting sprint analysis...');
		try {
			// Get all issues assigned to current user (sprint analysis)
			console.log('[Jira Debug] Fetching issues...');
			const issuesResponse = await this.jiraApi.getIssues();
			const issues = issuesResponse.issues;

			if (issues.length === 0) {
				vscode.window.showInformationMessage('No issues found for sprint analysis');
				return;
			}

			// Group issues by status and sprint
			const sprintAnalysis = this.analyzeSprintData(issues);
			const sprintContext = this.formatSprintAnalysisForChat(sprintAnalysis, issues);

			const sprintPrompt = `Please analyze my current sprint based on the following data:\n\n${sprintContext}\n\nPlease provide insights on:
1. Sprint progress and completion likelihood
2. Potential blockers or risks
3. Workload distribution and balance
4. Issues that might need attention
5. Suggestions for sprint optimization
6. Story point/time estimation accuracy
7. Team velocity insights`;

			// Use the same pattern as Figma extension for Mirai chat integration
			try {
				await vscode.commands.executeCommand('void.openSidebar');
				await vscode.commands.executeCommand('void.sendChatMessage', sprintPrompt);
				vscode.window.showInformationMessage('Current sprint analysis sent to Mirai chat! 💬');
			} catch (commandError) {
				// Fallback: copy to clipboard and notify user
				await vscode.env.clipboard.writeText(sprintPrompt);
				vscode.window.showInformationMessage(
					'Sprint analysis copied to clipboard! Please paste it into Mirai\'s chat. 📋',
					'Open Mirai Chat'
				).then(action => {
					if (action === 'Open Mirai Chat') {
						vscode.commands.executeCommand('void.openSidebar');
					}
				});
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to analyze sprint: ${error}`);
		}
	}

	public async analyzeSpecificSprint(sprintId: string, sprintName: string): Promise<void> {
		console.log(`🏃 [JiraChat] Sprint analysis requested for: ${sprintName} (ID: ${sprintId})`);
		console.log(`💳 [JiraChat] Checking Mirai authentication and credits...`);

		// Check authentication and credits first
		if (!(await this.checkCreditsAndAuth('SPRINT_ANALYSIS'))) {
			console.log(`❌ [JiraChat] Sprint analysis blocked - insufficient credits or not authenticated`);
			return;
		}

		console.log(`✅ [JiraChat] Credit check passed, proceeding with sprint analysis...`);

		try {
			// Build JQL query to fetch ALL issues in the specific sprint (not just current user's)
			let sprintJQL: string;

			if (sprintId === 'no-sprint') {
				// For issues without sprint
				sprintJQL = `sprint is EMPTY ORDER BY updated DESC`;
			} else {
				// Query for issues in the specific sprint - try multiple sprint field variations
				const sprintQueries = [
					`sprint = ${sprintId}`,
					`"Sprint" = ${sprintId}`,
					`cf[10020] = ${sprintId}`, // Common sprint custom field
					`cf[10010] = ${sprintId}`, // Alternative sprint custom field
					`cf[10016] = ${sprintId}`  // Another sprint custom field
				];

				// Use OR to catch different sprint field configurations
				sprintJQL = `(${sprintQueries.join(' OR ')}) ORDER BY updated DESC`;
			}

			console.log(`[Jira Debug] Fetching ALL issues in sprint "${sprintName}" with JQL:`, sprintJQL);

			// Fetch ALL issues in the sprint (not filtered by current user)
			const issuesResponse = await this.jiraApi.getIssues(sprintJQL, 100); // Increase limit for sprint analysis
			const sprintIssues = issuesResponse.issues;

			console.log(`[Jira Debug] Found ${sprintIssues.length} total issues in sprint "${sprintName}"`);


			if (sprintIssues.length === 0) {
				vscode.window.showInformationMessage(`No issues found in sprint "${sprintName}"`);
				return;
			}

			// Analyze the specific sprint
			const sprintAnalysis = this.analyzeSprintData(sprintIssues);
			const sprintContext = this.formatSprintAnalysisForChat(sprintAnalysis, sprintIssues);

			const sprintPrompt = `Please analyze Sprint "${sprintName}" - COMPLETE TEAM ANALYSIS based on ALL ${sprintIssues.length} issues in the sprint:\n\n${sprintContext}\n\n📊 **Comprehensive Sprint Analysis Requested:**
1. **Sprint Progress & Completion Likelihood** - Based on all team members' work
2. **Team Workload Distribution** - How work is balanced across assignees
3. **Cross-Team Dependencies & Blockers** - Issues that might affect others
4. **Sprint Scope & Capacity** - Is the sprint realistic for the team?
5. **Issue Types & Complexity Balance** - Stories vs bugs vs tasks distribution
6. **Priority & Status Flow** - Are high-priority items being addressed?
7. **Team Velocity & Sprint Health** - Based on the entire sprint backlog
8. **Recommendations** - For sprint optimization and team coordination

Note: This analysis includes ALL issues in the sprint (${sprintIssues.length} total), not just individual assignments.`;

			// Deduct credits before processing
			if (!(await this.deductCreditsForFeature('SPRINT_ANALYSIS'))) {
				return;
			}

			// Use the same pattern as Figma extension for Mirai chat integration
			console.log('[Jira Debug] Attempting to send sprint analysis to Mirai chat...');

			try {
				// Open Mirai sidebar first
				console.log('[Jira Debug] Opening Mirai sidebar...');
				await vscode.commands.executeCommand('void.openSidebar');

				// Send the message to Mirai's chat interface
				console.log('[Jira Debug] Sending message to Mirai chat...');
				await vscode.commands.executeCommand('void.sendChatMessage', sprintPrompt);

				console.log('[Jira Debug] Successfully sent sprint analysis to Mirai chat');
				vscode.window.showInformationMessage(`Sprint "${sprintName}" analysis sent to Mirai chat! 💬`);
			} catch (commandError) {
				console.log('[Jira Debug] Mirai commands failed, falling back to clipboard:', commandError);
				// Fallback: copy to clipboard and notify user
				await vscode.env.clipboard.writeText(sprintPrompt);
				vscode.window.showInformationMessage(
					`Sprint "${sprintName}" analysis copied to clipboard! Please paste it into Mirai's chat. 📋`,
					'Open Mirai Chat'
				).then(action => {
					if (action === 'Open Mirai Chat') {
						vscode.commands.executeCommand('void.openSidebar');
					}
				});
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to analyze sprint "${sprintName}": ${error}`);
		}
	}

	public async createIssueFromChat(summary: string, description: string): Promise<void> {
		try {
			const defaultProject = vscode.workspace.getConfiguration('mirai-jira').get<string>('defaultProject');

			if (!defaultProject) {
				const projects = await this.jiraApi.getProjects();
				const projectItems = projects.map(p => ({
					label: `${p.key} - ${p.name}`,
					description: p.projectTypeKey,
					project: p
				}));

				const selectedProject = await vscode.window.showQuickPick(projectItems, {
					placeHolder: 'Select a project for the new issue'
				});

				if (!selectedProject) {
					return;
				}

				await this.createIssueInProject(selectedProject.project.key, summary, description);
			} else {
				await this.createIssueInProject(defaultProject, summary, description);
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create issue: ${error}`);
		}
	}

	private async createIssueInProject(projectKey: string, summary: string, description: string): Promise<void> {
		const issueTypes = [
			{ label: 'Story', value: 'Story' },
			{ label: 'Task', value: 'Task' },
			{ label: 'Bug', value: 'Bug' },
			{ label: 'Epic', value: 'Epic' }
		];

		const selectedType = await vscode.window.showQuickPick(issueTypes, {
			placeHolder: 'Select issue type'
		});

		if (!selectedType) {
			return;
		}

		try {
			const newIssue = await this.jiraApi.createIssue({
				fields: {
					project: { key: projectKey },
					summary,
					description,
					issuetype: { name: selectedType.value }
				}
			});

			const issueUrl = this.jiraApi.getIssueUrl(newIssue.key);
			const action = await vscode.window.showInformationMessage(
				`Issue ${newIssue.key} created successfully!`,
				'Open in Jira',
				'View Details'
			);

			if (action === 'Open in Jira') {
				vscode.env.openExternal(vscode.Uri.parse(issueUrl));
			} else if (action === 'View Details') {
				await vscode.commands.executeCommand('mirai-jira.viewIssueDetails', newIssue.key);
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create issue: ${error}`);
		}
	}

	public async estimateIssueComplexity(issueKey: string): Promise<void> {
		try {
			const issue = await this.jiraApi.getIssue(issueKey);
			const context = this.formatIssueForChat(issue);
			const workspaceNote = this.getJiraWorkspaceNote();

			const estimationPrompt = `Please help me estimate the complexity and effort for this Jira issue:\n\n${context}${workspaceNote}\n\nPlease provide:
1. Complexity rating (Low/Medium/High/Very High) BASED ON THE CURRENT CODEBASE
2. Estimated development time (considering the structure of this workspace)
3. Key factors affecting complexity
4. Risks and uncertainties
5. Dependencies that could impact timeline (within this codebase)
6. Breakdown of tasks if possible (specific to files/modules in this workspace)

Consider factors like:
- Technical difficulty relative to this codebase
- Scope and requirements clarity
- Integration complexity within the current architecture
- Testing requirements (based on current test setup)
- Documentation needs
- How well this fits with the current codebase structure`;

			// Use the same pattern as Figma extension for Mirai chat integration
			try {
				await vscode.commands.executeCommand('void.openSidebar');
				await vscode.commands.executeCommand('void.sendChatMessage', estimationPrompt);
				vscode.window.showInformationMessage(`Issue ${issueKey} complexity estimation sent to Mirai chat! 💬`);
			} catch (commandError) {
				// Fallback: copy to clipboard and notify user
				await vscode.env.clipboard.writeText(estimationPrompt);
				vscode.window.showInformationMessage(
					`Issue ${issueKey} complexity estimation copied to clipboard! Please paste it into Mirai's chat. 📋`,
					'Open Mirai Chat'
				).then(action => {
					if (action === 'Open Mirai Chat') {
						vscode.commands.executeCommand('void.openSidebar');
					}
				});
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to estimate issue complexity: ${error}`);
		}
	}

	public async generateTestCases(issueKey: string): Promise<void> {
		try {
			const issue = await this.jiraApi.getIssue(issueKey);
			const context = this.formatIssueForChat(issue);
			const workspaceNote = this.getJiraWorkspaceNote();

			const testPrompt = `Based on this Jira issue, please generate comprehensive test cases:\n\n${context}${workspaceNote}\n\nPlease provide:
1. Unit test scenarios (using the testing framework in this workspace)
2. Integration test cases
3. End-to-end test scenarios
4. Edge cases and boundary conditions
5. Error handling test cases
6. Performance considerations
7. Accessibility testing (if applicable)
8. Security testing considerations

Format the test cases clearly with:
- Test scenario description
- Prerequisites
- Test steps
- Expected results
- Priority level
- Suggested file locations (based on the current workspace structure)`;

			// Use the same pattern as Figma extension for Mirai chat integration
			try {
				await vscode.commands.executeCommand('void.openSidebar');
				await vscode.commands.executeCommand('void.sendChatMessage', testPrompt);
				vscode.window.showInformationMessage(`Test cases for ${issueKey} sent to Mirai chat! 💬`);
			} catch (commandError) {
				// Fallback: copy to clipboard and notify user
				await vscode.env.clipboard.writeText(testPrompt);
				vscode.window.showInformationMessage(
					`Test cases for ${issueKey} copied to clipboard! Please paste it into Mirai's chat. 📋`,
					'Open Mirai Chat'
				).then(action => {
					if (action === 'Open Mirai Chat') {
						vscode.commands.executeCommand('void.openSidebar');
					}
				});
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to generate test cases: ${error}`);
		}
	}

	private formatIssueForChat(issue: JiraIssue): string {
		const assignee = issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned';
		const priority = issue.fields.priority ? issue.fields.priority.name : 'None';
		const components = issue.fields.components.map(c => c.name).join(', ') || 'None';
		const labels = issue.fields.labels.join(', ') || 'None';

		return `**${issue.key}: ${issue.fields.summary}**

**Project:** ${issue.fields.project.name} (${issue.fields.project.key})
**Issue Type:** ${issue.fields.issuetype.name}
**Status:** ${issue.fields.status.name}
**Priority:** ${priority}
**Assignee:** ${assignee}
**Reporter:** ${issue.fields.reporter.displayName}
**Components:** ${components}
**Labels:** ${labels}
**Created:** ${new Date(issue.fields.created).toLocaleDateString()}
**Updated:** ${new Date(issue.fields.updated).toLocaleDateString()}

**Description:**
${this.extractTextFromDescription(issue.fields.description) || 'No description provided'}

**Jira Link:** ${this.jiraApi.getIssueUrl(issue.key)}`;
	}

	public async suggestImprovements(issueKey: string): Promise<void> {
		try {
			const issue = await this.jiraApi.getIssue(issueKey);
			const context = this.formatIssueForChat(issue);
			const workspaceNote = this.getJiraWorkspaceNote();

			const improvementPrompt = `Please review this Jira issue and suggest improvements:\n\n${context}${workspaceNote}\n\nPlease analyze and suggest improvements for:
1. Issue description clarity and completeness
2. Acceptance criteria (if missing or unclear)
3. Technical specifications (considering the current codebase architecture)
4. User story format and structure
5. Labels and components organization
6. Priority and severity alignment
7. Dependencies identification (within the current workspace)
8. Risk assessment (specific to this codebase)
9. Implementation feasibility given the current workspace structure

Provide specific, actionable recommendations to make this issue more effective for development in THIS specific codebase.`;

			// Use the same pattern as Figma extension for Mirai chat integration
			try {
				await vscode.commands.executeCommand('void.openSidebar');
				await vscode.commands.executeCommand('void.sendChatMessage', improvementPrompt);
				vscode.window.showInformationMessage(`Improvement suggestions for ${issueKey} sent to Mirai chat! 💬`);
			} catch (commandError) {
				// Fallback: copy to clipboard and notify user
				await vscode.env.clipboard.writeText(improvementPrompt);
				vscode.window.showInformationMessage(
					`Improvement suggestions for ${issueKey} copied to clipboard! Please paste it into Mirai's chat. 📋`,
					'Open Mirai Chat'
				).then(action => {
					if (action === 'Open Mirai Chat') {
						vscode.commands.executeCommand('void.openSidebar');
					}
				});
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to suggest improvements: ${error}`);
		}
	}

	private analyzeSprintData(issues: JiraIssue[]): {
		totalIssues: number;
		statusBreakdown: Record<string, number>;
		priorityBreakdown: Record<string, number>;
		typeBreakdown: Record<string, number>;
		sprintBreakdown: Record<string, JiraIssue[]>;
		assigneeBreakdown: Record<string, number>;
	} {
		const statusBreakdown: Record<string, number> = {};
		const priorityBreakdown: Record<string, number> = {};
		const typeBreakdown: Record<string, number> = {};
		const sprintBreakdown: Record<string, JiraIssue[]> = {};
		const assigneeBreakdown: Record<string, number> = {};

		issues.forEach(issue => {
			// Status breakdown
			const status = issue.fields.status.name;
			statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;

			// Priority breakdown
			const priority = issue.fields.priority?.name || 'None';
			priorityBreakdown[priority] = (priorityBreakdown[priority] || 0) + 1;

			// Type breakdown
			const type = issue.fields.issuetype.name;
			typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;

			// Assignee breakdown
			const assignee = issue.fields.assignee?.displayName || 'Unassigned';
			assigneeBreakdown[assignee] = (assigneeBreakdown[assignee] || 0) + 1;

			// Sprint breakdown (try multiple custom fields for sprint)
			let sprintName = 'No Sprint';
			const sprintFields = ['sprint', 'customfield_10020', 'customfield_10010', 'customfield_10016'];

			for (const fieldName of sprintFields) {
				const sprintData = (issue.fields as any)[fieldName];
				if (sprintData) {
					if (Array.isArray(sprintData) && sprintData.length > 0) {
						sprintName = sprintData[sprintData.length - 1].name || `Sprint ${sprintData[sprintData.length - 1].id}`;
					} else if (typeof sprintData === 'object' && sprintData.name) {
						sprintName = sprintData.name;
					}
					break;
				}
			}

			if (!sprintBreakdown[sprintName]) {
				sprintBreakdown[sprintName] = [];
			}
			sprintBreakdown[sprintName].push(issue);
		});

		return {
			totalIssues: issues.length,
			statusBreakdown,
			priorityBreakdown,
			typeBreakdown,
			sprintBreakdown,
			assigneeBreakdown
		};
	}

	private formatSprintAnalysisForChat(analysis: any, issues: JiraIssue[]): string {
		const { totalIssues, statusBreakdown, priorityBreakdown, typeBreakdown, sprintBreakdown, assigneeBreakdown } = analysis;

		let output = `**SPRINT ANALYSIS REPORT**\n\n`;

		output += `**📊 OVERVIEW**\n`;
		output += `Total Issues: ${totalIssues}\n\n`;

		output += `**📈 STATUS BREAKDOWN**\n`;
		Object.entries(statusBreakdown).forEach(([status, count]) => {
			output += `- ${status}: ${count} issues\n`;
		});
		output += '\n';

		output += `**🎯 PRIORITY BREAKDOWN**\n`;
		Object.entries(priorityBreakdown).forEach(([priority, count]) => {
			output += `- ${priority}: ${count} issues\n`;
		});
		output += '\n';

		output += `**📋 ISSUE TYPE BREAKDOWN**\n`;
		Object.entries(typeBreakdown).forEach(([type, count]) => {
			output += `- ${type}: ${count} issues\n`;
		});
		output += '\n';

		output += `**👥 ASSIGNEE BREAKDOWN**\n`;
		Object.entries(assigneeBreakdown).forEach(([assignee, count]) => {
			output += `- ${assignee}: ${count} issues\n`;
		});
		output += '\n';

		output += `**🏃‍♂️ SPRINT BREAKDOWN**\n`;
		(Object.entries(sprintBreakdown) as [string, JiraIssue[]][]).forEach(([sprint, sprintIssues]) => {
			output += `\n**${sprint}** (${sprintIssues.length} issues):\n`;
			sprintIssues.forEach((issue: JiraIssue) => {
				const priority = issue.fields.priority?.name || 'None';
				output += `  - ${issue.key}: ${issue.fields.summary} [${issue.fields.status.name}] [${priority}]\n`;
			});
		});

		output += '\n**🔗 DETAILED ISSUES**\n';
		issues.slice(0, 10).forEach(issue => { // Limit to first 10 for readability
			const assignee = issue.fields.assignee?.displayName || 'Unassigned';
			const priority = issue.fields.priority?.name || 'None';
			output += `\n**${issue.key}**: ${issue.fields.summary}\n`;
			output += `  Status: ${issue.fields.status.name} | Priority: ${priority} | Assignee: ${assignee}\n`;
			if (issue.fields.description) {
				const desc = typeof issue.fields.description === 'string'
					? issue.fields.description.substring(0, 100) + '...'
					: 'Complex description format';
				output += `  Description: ${desc}\n`;
			}
		});

		if (issues.length > 10) {
			output += `\n... and ${issues.length - 10} more issues`;
		}

		return output;
	}

	private extractTextFromDescription(description: any): string {
		if (typeof description === 'string') {
			return description;
		}

		if (typeof description === 'object' && description !== null) {
			// Handle Atlassian Document Format (ADF)
			if (description.content && Array.isArray(description.content)) {
				return this.extractTextFromADF(description);
			}

			// Handle other object formats
			if (description.text) {
				return description.text;
			}

			if (description.value) {
				return description.value;
			}

			// Fallback: try to extract any text content
			return JSON.stringify(description).replace(/[{}"\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
		}

		return 'No description available';
	}

	private extractTextFromADF(adf: any): string {
		if (!adf || !adf.content) {
			return '';
		}

		let text = '';

		const traverse = (node: any): void => {
			if (node.text) {
				text += node.text;
			}

			if (node.content && Array.isArray(node.content)) {
				node.content.forEach(traverse);
			}

			// Add spacing between different nodes for readability
			if (node.type === 'paragraph' || node.type === 'heading') {
				text += '\n';
			}
		};

		adf.content.forEach(traverse);

		return text.trim();
	}
}
