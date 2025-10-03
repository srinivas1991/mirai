# GitHub Repositories Feature

This feature allows you to list and manage all your GitHub repositories directly from VS Code.

## Features

- 📋 **List all your GitHub repositories** - Fetches all repos from your GitHub account (including organizations)
- 🔍 **Search and filter** - Quickly find repositories by name or description
- 🌐 **Open in browser** - Open any repository in your default browser
- 📥 **Clone repositories** - Clone repositories to your local machine
- 📋 **Copy clone URLs** - Copy HTTPS or SSH URLs to clipboard
- ℹ️ **View details** - See repository details like stars, forks, language, etc.

## Usage

### Command Palette

1. Open Command Palette: `Ctrl/Cmd + Shift + P`
2. Type: `Mirai: List My GitHub Repositories`
3. Press Enter

### What You'll See

The command will:
1. Authenticate with GitHub (if not already authenticated)
2. Fetch all your repositories (this may take a moment if you have many repos)
3. Display a searchable list with:
   - 🔒 Private repositories
   - 🌐 Public repositories
   - Repository name and owner
   - Description, stars, language, and last update date

### Actions

When you select a repository, you can:

- **Open in Browser** - Opens the GitHub repository page
- **Clone Repository** - Clones to a local folder of your choice
- **Copy Clone URL (HTTPS)** - Copies the HTTPS clone URL
- **Copy Clone URL (SSH)** - Copies the SSH clone URL
- **Show Details** - Displays detailed information about the repository

## Authentication

This feature uses GitHub authentication built into VS Code. When you first run the command:

1. You'll be prompted to sign in to GitHub
2. Authorize VS Code to access your repositories
3. The authentication token is securely stored by VS Code

Required GitHub scopes:
- `repo` - Access to public and private repositories
- `read:user` - Read user profile information

## Examples

### Finding a Specific Repository

1. Run: `Mirai: List My GitHub Repositories`
2. Start typing the repository name in the search box
3. Select your repository from the filtered list

### Quick Clone

1. Run: `Mirai: List My GitHub Repositories`
2. Select the repository you want to clone
3. Choose "Clone Repository"
4. Select the destination folder
5. The repository will be cloned automatically

### Share a Repository URL

1. Run: `Mirai: List My GitHub Repositories`
2. Select the repository
3. Choose "Copy Clone URL (HTTPS)" or "Copy Clone URL (SSH)"
4. Paste the URL anywhere you need it

## API Details

The service fetches repositories using the GitHub REST API:
- Endpoint: `https://api.github.com/user/repos`
- Includes: Owned repos, collaborator repos, and organization repos
- Pagination: Automatically fetches all pages (100 repos per page)
- Sorting: By last updated date (most recent first)

## Troubleshooting

### Authentication Fails

If authentication fails:
1. Sign out of GitHub in VS Code: `Ctrl/Cmd + Shift + P` → "Sign out of GitHub"
2. Try the command again
3. Complete the GitHub authentication flow

### No Repositories Found

If no repositories are found:
- Make sure you're authenticated with the correct GitHub account
- Check that your GitHub account has repositories
- Try refreshing by running the command again

### Clone Fails

If cloning fails:
- Ensure Git is installed on your system
- Check that you have access to the repository
- For private repos, ensure you're authenticated
- For SSH URLs, ensure your SSH keys are configured

## Future Enhancements

Potential future features:
- Filter by organization
- Filter by language or visibility
- Star/unstar repositories
- Create new repositories
- View repository branches
- Open repository in VS Code remotely

