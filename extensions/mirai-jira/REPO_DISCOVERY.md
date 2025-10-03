# 🔍 AI-Powered Jira Ticket-Based Repository Discovery

## Overview

This feature helps developers automatically discover relevant GitHub repositories for their Jira tickets using AI analysis. When working on a Jira ticket, the AI analyzes the ticket context (summary, description, components, labels) and matches it against all your accessible GitHub repositories to suggest which repos you should work in.

## 🎯 Key Benefits

✅ **Save Time** - No more manually searching through hundreds of repositories  
✅ **Smart Context** - AI understands ticket semantics, not just keywords  
✅ **Always Updated** - Real-time repository information from GitHub  
✅ **Team Visibility** - Works with personal, organizational, and collaborative repos  
✅ **Comprehensive Analysis** - Considers multiple factors: description, language, components, labels, recency  

## 🚀 How to Use

### Method 1: From Jira Tree View (Recommended)

1. Open the **Jira** view in VS Code sidebar
2. Navigate to any Jira issue
3. **Right-click** on the issue
4. Select **"Discover Repositories with AI"**
5. The AI will analyze the ticket and your GitHub repos
6. Results appear in the AI chat with ranked recommendations

### Method 2: From Command Palette

1. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. Type: **"Mirai Jira: Discover Repositories with AI"**
3. Enter the Jira issue key (e.g., `PROJ-123`)
4. View AI analysis in the chat

## 🧠 How It Works

### Step-by-Step Process

```
1. Fetch Jira Ticket Details
   ↓
2. Fetch Your GitHub Repositories
   ↓
3. AI Analysis & Matching
   ↓
4. Present Ranked Results
```

### What the AI Analyzes

#### From Jira Ticket:
- **Summary**: Main issue description
- **Description**: Detailed requirements
- **Components**: Technical areas (Auth, API, Frontend, etc.)
- **Labels**: Tags and categories
- **Issue Type**: Bug, Feature, Task, Epic
- **Priority**: High, Medium, Low
- **Project**: Which Jira project

#### From GitHub Repositories:
- **Repository Name**: Does it match keywords?
- **Description**: What is the repo about?
- **Primary Language**: TypeScript, Python, Java, etc.
- **Recent Activity**: When was it last updated?
- **Topics/Tags**: GitHub repository topics
- **Organization**: Personal vs org repos

### AI Scoring System

The AI assigns relevance scores to each repository:

- **90-100%** 🏆 **Highly Relevant** - Primary repository, direct match
- **70-89%** 📌 **Relevant** - Likely needs changes
- **50-69%** 💡 **Possibly Relevant** - May need updates
- **30-49%** 🔍 **Check Dependencies** - Indirect relationship
- **0-29%** ❌ **Low Relevance** - Unlikely to need changes

## 📊 Example Output

When you run repository discovery on a ticket like:

**TEAM-456: Fix authentication timeout in mobile app**
- Components: Authentication, Mobile
- Labels: bug, security, iOS
- Priority: High

The AI might respond with:

```
🏆 HIGHLY RELEVANT (90-100%)

📂 mobile-auth-service (95%)
   Primary authentication service for mobile apps. Handles session 
   timeouts and token management. Contains iOS-specific SDK.
   
   Suggested Actions:
   • Check timeout configuration in AuthConfig.ts
   • Review session management logic
   • Update iOS SDK if needed

📂 ios-app (92%)
   Main iOS application repository. Implements authentication flow
   and handles timeout errors.
   
   Suggested Actions:
   • Update error handling for auth timeouts
   • Test timeout behavior in LoginViewController
   • Update timeout constants

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 RELEVANT (70-89%)

📂 api-gateway (78%)
   Routes authentication requests. May need timeout configuration
   updates to align with mobile requirements.
   
   Suggested Actions:
   • Review timeout settings in gateway config
   • Ensure mobile endpoints have appropriate timeouts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 POSSIBLY RELEVANT (50-69%)

📂 user-service (55%)
   Manages user sessions. Timeout changes might affect this service.
   
   Suggested Actions:
   • Check if session expiry logic needs updates
```

## 🔐 Authentication Requirements

### GitHub Authentication

The feature requires GitHub authentication to fetch your repositories:

1. When you first use the feature, you'll be prompted to authenticate
2. Click **"Authenticate with GitHub"**
3. Complete the OAuth flow in your browser
4. Grant permissions for: `repo`, `read:user`, `read:org`

> **Note**: Uses the same authentication as the GitHub integration extension

### Jira Authentication

You must be authenticated with Jira to fetch ticket details:

1. Use the Jira extension's authentication
2. Either OAuth or API token works

## 🎨 UI Integration

### Context Menu

The feature appears in the Jira issue context menu:

```
Right-click on any issue:
├── Discuss with AI
├── Estimate Work
└── Discover Repositories with AI  ← New Feature
```

### Command Palette

Available via Command Palette:

```
> Mirai Jira: Discover Repositories with AI
```

## 💡 Use Cases

### Use Case 1: New Team Member

**Scenario**: Just joined the team, assigned ticket TEAM-789 about payment processing.

**Action**: Right-click ticket → "Discover Repositories with AI"

**Result**: AI suggests `payment-gateway` (98%), `billing-service` (85%), helping the new developer find the right codebase immediately.

### Use Case 2: Bug Fix Across Multiple Repos

**Scenario**: Bug ticket mentions authentication affecting both mobile and web.

**Action**: Use repository discovery

**Result**: AI identifies multiple repos: `mobile-app` (95%), `web-app` (92%), `auth-service` (88%), `api-gateway` (45%).

### Use Case 3: Cross-Component Feature

**Scenario**: Feature ticket involves UI, API, and database changes.

**Action**: Discover repositories

**Result**: AI ranks repos by component: frontend repos first, then backend, then database migration repos.

### Use Case 4: Unclear Requirements

**Scenario**: Ticket description is vague about which system is affected.

**Action**: Let AI analyze the ticket

**Result**: AI uses natural language understanding to identify likely repos based on keywords and context.

## 🛠️ Technical Details

### Architecture

```
JiraRepoDiscoveryService
├── Fetch Jira ticket details (JiraApiService)
├── Fetch GitHub repos (GitHub API via mirai-github auth)
├── Build AI prompt with context
└── Send to Void AI for analysis
```

### Performance

- **Repository Limit**: Fetches up to ~300 repos (to avoid API rate limits)
- **AI Token Optimization**: Summarizes repo list to fit token limits
- **Caching**: GitHub session cached for subsequent requests
- **Progress Indication**: Shows progress during fetch operations

### Privacy & Security

- ✅ All data stays local or goes through your authenticated sessions
- ✅ No third-party services receive your Jira/GitHub data
- ✅ Uses VS Code's secure credential storage
- ✅ Respects repository access permissions

## 🔧 Configuration

No special configuration needed! The feature works out of the box once you have:

1. ✅ Jira authentication configured
2. ✅ GitHub authentication configured

## 🐛 Troubleshooting

### "No GitHub repositories found"

**Solution**: Authenticate with GitHub first via the GitHub extension or when prompted.

### "GitHub authentication required"

**Solution**: Click the "Authenticate with GitHub" button and complete the OAuth flow.

### "Failed to fetch Jira ticket"

**Solution**: 
- Ensure you're authenticated with Jira
- Verify the ticket key is correct (e.g., `PROJ-123`)
- Check if you have permission to view the ticket

### AI analysis seems off

**Possible Reasons**:
- Ticket description is too vague
- Repository names/descriptions don't contain relevant keywords
- Try updating the ticket with more details

### Feature not appearing in context menu

**Solution**:
- Reload VS Code window
- Ensure Jira extension is activated
- Check you're right-clicking on an issue (not a project or sprint)

## 📈 Future Enhancements

Planned improvements:

- 🔮 **Multi-ticket analysis**: Analyze entire sprint to find common repos
- 🧑‍🤝‍🧑 **Team collaboration**: See which repos teammates work on for similar tickets
- 📚 **Learning from history**: Remember past ticket→repo assignments
- 🚀 **Smart branch creation**: Auto-create branches in discovered repos
- 🔗 **Direct integration**: Clone/open repos directly from results

## 🤝 Contributing

Have ideas for improving repository discovery? 

- Suggest improvements to the AI prompting
- Report issues with false positives/negatives
- Share feedback on the scoring system

## 📝 Example Workflows

### Workflow 1: Quick Start on New Ticket

```bash
1. Receive new ticket assignment
2. Right-click ticket in Jira view
3. Click "Discover Repositories with AI"
4. Review AI recommendations
5. Clone top-ranked repo
6. Start coding!
```

### Workflow 2: Multi-Repo Bug Fix

```bash
1. Bug ticket mentions multiple systems
2. Use repository discovery
3. AI identifies 3 affected repos
4. Clone all 3 repos
5. Create branches in each
6. Fix bug across all repos
7. Create PRs linked to Jira ticket
```

### Workflow 3: Unknown Codebase Exploration

```bash
1. New project, unfamiliar codebase
2. Pick any ticket
3. Discover repositories
4. Learn which repos handle which functionality
5. Build mental map of the architecture
```

## 🎓 Tips for Best Results

1. **Write detailed ticket descriptions** - More context = better matching
2. **Use components and labels** - Helps AI understand technical areas
3. **Update repo descriptions** - Well-described repos get better matches
4. **Use GitHub topics** - Tag repos with relevant topics for better discovery
5. **Keep repos active** - Recently updated repos are weighted higher

---

## 📞 Support

For issues or questions:
- Check the troubleshooting section above
- Review Jira extension logs in VS Code Output panel
- Check console for detailed `[RepoDiscovery]` debug logs

---

**Built with ❤️ for the Mirai Jira Integration**

