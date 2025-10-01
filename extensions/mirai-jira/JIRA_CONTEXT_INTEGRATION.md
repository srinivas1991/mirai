# Jira Context Integration for Void Chat

This document explains how to easily send Jira issue context to Void chat for AI-powered discussions and analysis.

## How It Works

You can send Jira issue context to Void chat in two simple ways:

1. **Right-click on any issue** in the Jira tree view and select "Discuss with AI"
2. **Use the command palette** and search for "Discuss with AI" to manually enter an issue key

## What Information Is Provided

When a Jira ticket is referenced, the LLM receives:

- **Issue Summary** and **Description**
- **Project**, **Issue Type**, and **Status**
- **Priority** and **Story Points** (if available)
- **Assignee** and **Reporter**
- **Components**, **Labels**, and **Versions**
- **Epic** and **Sprint** information (if available)
- **Time estimates** (if available)
- **Creation and update dates**
- **Direct link** to the issue in Jira

## Usage Examples

### Using the Context Menu
1. **Navigate to the Jira tree view** in the sidebar
2. **Find the issue** you want to discuss (e.g., AQAAS-7198)
3. **Right-click** on the issue
4. **Select "Discuss with AI"** from the context menu
5. **Void chat opens** with the full issue context automatically provided to the AI

### Using the Command Palette
1. **Open Command Palette** (Cmd+Shift+P / Ctrl+Shift+P)
2. **Type "Discuss with AI"** and select the Mirai Jira command
3. **Enter the issue key** when prompted (e.g., AQAAS-7198)
4. **Void chat opens** with the issue context ready for discussion

### Example Conversation
```
[After using "Discuss with AI" on AQAAS-7198]

AI: I have the context for AQAAS-7198: "Fix authentication timeout issue".

This is a Bug with High priority assigned to John Doe. The issue describes users getting logged out unexpectedly after 5 minutes of inactivity, when the timeout should be 30 minutes.

Key details:
- Status: In Progress
- Components: Authentication, Session Management
- Reporter: Jane Smith
- Created: 2 days ago

How can I help you with this issue? Would you like me to:
1. Analyze the potential root causes
2. Suggest implementation approaches
3. Help write test cases
4. Review the acceptance criteria
```

## Requirements

1. **Authentication**: You must be authenticated with Jira using the Mirai Jira extension
2. **Permissions**: You need read access to the Jira issues you want to discuss
3. **Void Extension**: The Void/Mirai chat extension must be installed and active

## Benefits

- **Easy Access**: Right-click any issue to start discussing it with AI
- **Rich Context**: All issue details are automatically provided to the AI
- **Always Current**: Information is fetched in real-time from Jira
- **Secure**: Respects your Jira authentication and permissions
- **Comprehensive**: Includes all relevant issue metadata for better AI assistance

## Troubleshooting

If the "Discuss with AI" option isn't working:

1. **Check Authentication**: Ensure you're logged into Jira via the Mirai Jira extension
2. **Verify Permissions**: Confirm you can access the issue in Jira
3. **Extension Status**: Make sure both Mirai Jira and Void extensions are active
4. **Check Issue Access**: Try refreshing the issue list if the issue doesn't appear

## What's Different from the Manual Approach

Instead of manually mentioning ticket keys in chat and hoping the AI understands the context, this approach:

- ✅ **Automatically fetches** complete issue details
- ✅ **Formats context** in an AI-friendly way
- ✅ **Works with one click** from the issue tree
- ✅ **Always up-to-date** with current issue status
- ✅ **Includes rich metadata** like components, sprint info, etc.
