# Usage Examples

## Creating Issues

### Basic Bug Report
```
Create a bug in project PROJ with high priority about "Login button not working on mobile devices"
```

### Story with Details
```
Create a story in PROJ titled "Add user profile page" with description "As a user, I want to view and edit my profile" and assign it to john@example.com with 5 story points
```

### Task with Labels
```
Create a task "Update documentation" in project DOCS with labels ["documentation", "Q1-2024"]
```

## Searching Issues

### Find My Tasks
```
Find all open tasks assigned to me
```

### Complex Search
```
Search for bugs in project PROJ with high priority that are not assigned
```

### JQL Search
```
Search issues with JQL: project = PROJ AND status = "In Progress" AND assignee = currentUser()
```

## Updating Issues

### Add Story Points
```
Update PROJ-123 to add 8 story points
```

### Change Priority
```
Update PROJ-456 priority to Highest
```

### Reassign
```
Update PROJ-789 and assign it to sarah@example.com
```

## Workflow Management

### Move to In Progress
```
Transition PROJ-123 to "In Progress"
```

### Complete Issue
```
Transition PROJ-456 to "Done"
```

## Linking Issues

### Block Relationship
```
Link PROJ-123 blocks PROJ-456
```

### Related Issues
```
Link PROJ-789 to PROJ-790 as "Relates to"
```

## Comments

### Simple Comment
```
Add comment to PROJ-123: "Started working on this, expecting to complete by EOD"
```

### Update Comment
```
Add comment to PROJ-456: "Blocked by external API changes, waiting for vendor response"
```

## Using Prompts

### Daily Standup
```
Generate a standup report for john@example.com for the last 2 days
```

### Sprint Planning
```
Help with sprint planning for project PROJ
```

### Bug Triage
```
Help triage bugs for project PROJ with high priority
```

### Release Notes
```
Generate release notes for project PROJ version 2.1.0 since 2024-01-01
```

### Epic Progress
```
Get status report for epic PROJ-100
```

## Resource Access

### View Projects
```
Show me all available Jira projects
```

### Project Details
```
Get details for project PROJ
```

### Issue Details
```
Show me the details of PROJ-123
```

## Troubleshooting Tools

### Check Available Fields
```
Show me available fields for project PROJ
```

```
What fields can I use for Epic issue type in project PROJ?
```

### Check Link Types
```
Show me available link types
```

### Debug Create Issue
If create-issue fails, first check available fields:
```
get-fields for project PROJ and issue type Epic
```

## Advanced Examples

### Bulk Operations
```
Find all bugs in PROJ assigned to me and update them to include label "reviewed"
```

### Complex Workflows
```
Create a story "New feature" in PROJ, then create a test ticket for it and link them together
```

### Reporting
```
Search for all issues completed in PROJ this week and summarize them for the weekly report
```

### Smart Linking
The link-issues tool now automatically matches link types:
```
# These all work:
Link PROJ-1 blocks PROJ-2
Link PROJ-1 Blocks PROJ-2  
Link PROJ-1 BLOCKS PROJ-2
```