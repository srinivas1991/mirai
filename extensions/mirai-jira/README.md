# Mirai Jira Integration

Seamlessly integrate Jira issues into your Mirai workflow with AI-powered analysis and code generation.

## Features

🎯 **Issue Management**
- Browse and search your Jira issues directly in VS Code
- View detailed issue information
- Create new issues from VS Code
- Filter issues by assignee, status, project, and more

🤖 **AI-Powered Analysis**
- Analyze issues with AI for complexity estimation
- Generate code snippets from issue requirements
- Create comprehensive test cases
- Get implementation suggestions and best practices
- Sprint analysis and planning assistance

💬 **Chat Integration**
- Send issues directly to Mirai chat
- Analyze requirements and specifications
- Get development recommendations
- Estimate effort and complexity

🔍 **Smart Features**
- Real-time issue synchronization
- Keyboard shortcuts for quick access
- Customizable filters and views
- Issue status tracking and updates

## Setup

### Option 1: Login with Jira (Recommended)

1. Open the Mirai Jira panel in VS Code
2. Click "🔐 Login with Jira"
3. Authenticate in your browser when prompted
4. You're done! The extension will handle everything automatically.

**Note**: OAuth must be configured by the extension developer for this option to be available.

### Option 2: Setup Personal Token

1. Generate a Jira API Token:
   - Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
   - Click "Create API token"
   - Give it a descriptive name (e.g., "VS Code Mirai Extension")
   - Copy the generated token

2. Configure the Extension:
   - Open the Mirai Jira panel in VS Code
   - Click "🔑 Setup Personal Token"
   - Enter your information:
     - **Jira URL**: Your Jira instance URL (e.g., `https://yourcompany.atlassian.net`)
     - **Email**: Your Jira account email address
     - **API Token**: The token you generated in step 1

## Usage

### Browsing Issues

- Use the Jira sidebar to browse your issues
- Issues are organized by status or project
- Click on any issue to view detailed information
- Use the search bar to find specific issues

### AI Analysis

#### Analyze an Issue
1. Select an issue from the tree view
2. Right-click and choose "Analyze with AI"
3. The AI will provide insights on complexity, approach, and considerations

#### Generate Code
1. Select an issue with clear requirements
2. Choose "Generate Code from Issue"
3. The AI will create code snippets based on the issue description

#### Create Test Cases
1. Select an issue
2. Choose "Generate Test Cases"
3. Get comprehensive test scenarios including edge cases

### Quick Actions

- **My Issues**: Filter to show only issues assigned to you
- **Recent**: Show recently updated issues
- **In Progress**: Filter issues currently in progress
- **Create Issue**: Quickly create a new Jira issue

### Keyboard Shortcuts

- `Ctrl/Cmd + R`: Refresh issues
- `Ctrl/Cmd + N`: Create new issue
- `Ctrl/Cmd + F`: Focus search
- `Escape`: Close modals

## Configuration

The extension can be configured through VS Code settings:

```json
{
  "mirai-jira.baseUrl": "https://yourcompany.atlassian.net",
  "mirai-jira.email": "your.email@company.com",
  "mirai-jira.defaultProject": "PROJ",
  "mirai-jira.autoRefresh": true,
  "mirai-jira.maxIssues": 50
}
```

### Available Settings

- `mirai-jira.baseUrl`: Your Jira instance URL
- `mirai-jira.email`: Your Jira account email
- `mirai-jira.apiToken`: Your API token (stored securely)
- `mirai-jira.defaultProject`: Default project key for new issues
- `mirai-jira.autoRefresh`: Automatically refresh issues on startup
- `mirai-jira.maxIssues`: Maximum number of issues to fetch (default: 50)

## Commands

The extension provides the following commands:

- **Mirai Jira: Open Jira Panel** - Open the main Jira interface
- **Mirai Jira: Connect with API Token** - Authenticate with Jira
- **Mirai Jira: Refresh Issues** - Reload all issues
- **Mirai Jira: Create New Issue** - Create a new Jira issue
- **Mirai Jira: Send Issue to AI Chat** - Send issue to Mirai chat
- **Mirai Jira: Analyze Issue with AI** - Get AI analysis of an issue
- **Mirai Jira: Generate Code from Issue** - Generate code based on issue
- **Mirai Jira: Clear Saved Token** - Clear authentication

## Troubleshooting

### Common Issues

**"Failed to connect to Jira"**
- Verify your Jira URL is correct (include `https://`)
- Check that your email and API token are valid
- Ensure you have permission to access the Jira instance

**"No issues found"**
- Check your Jira permissions
- Try refreshing the issues list
- Verify you have access to projects with issues

**"API rate limit exceeded"**
- Jira has API rate limits - wait a few minutes and try again
- Consider reducing the `maxIssues` setting

### Getting Help

If you encounter issues:

1. Check the VS Code Developer Console for error messages
2. Verify your Jira permissions and API token
3. Try disconnecting and reconnecting your account
4. Restart VS Code if problems persist

## Security

- API tokens are stored securely using VS Code's built-in credential storage
- No sensitive information is logged or transmitted except to Jira's official API
- All communication with Jira uses HTTPS encryption

## Privacy

This extension:
- Only accesses Jira data you have permission to view
- Does not store or transmit your data to any third parties
- Uses Jira's official REST API following security best practices
- Integrates with Mirai's chat features following the same privacy standards

## Requirements

- VS Code 1.74.0 or higher
- Valid Jira account with API access
- Internet connection for Jira API calls
- Mirai VS Code extension for AI chat features

## Support

For support and feedback:
- Use the built-in VS Code issue reporting
- Check the [Jira REST API documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/) for API-related questions
- Refer to the Mirai documentation for chat integration help

