# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Fixed "Unexpected end of JSON input" error for transition-issue
- Fixed "Cannot read properties of undefined" error for create-issue
- Improved handling of empty API responses
- Better error messages with context
- Fixed link-issues with case-insensitive matching
- Better handling of fields not available for certain issue types
- Fixed subtask creation by properly using parent field
- Fixed Epic-Story linking with proper error handling and guidance
- Fixed linkTypes.map error by handling different API response structures
- Fixed issue type validation for localized Jira instances

### Added
- Comprehensive logging system with DEBUG support
- Automatic retry with exponential backoff (3 attempts)
- Connection testing on startup
- Atlassian Document Format (ADF) support for rich text
- Convenient run.sh script for easier execution
- Input validation with detailed error messages
- Robust error handling for all edge cases
- New `get-link-types` tool to list available issue link types
- New `get-fields` tool to show available fields for project/issue type
- New `create-epic-with-subtasks` tool for creating epics with multiple subtasks
- New `diagnose-fields` tool to find correct custom field IDs
- New `create-task-for-epic` tool optimized for Czech Jira
- Smart link type matching with fallback to available types
- Parent field support for creating subtasks
- Detection and guidance for Epic-Story system link attempts
- Full localization support for issue types and priorities
- Issue type mapping for multiple languages

### Improved
- More informative startup messages
- Better handling of test ticket creation failures
- Enhanced transition handling with available options display
- Enhanced debug logging for create-issue payloads
- Link-issues now shows available types on error
- Automatic fallback to tasks when subtasks under epics fail
- Better handling of Czech and localized error messages
- Issue type schema now accepts any string value for localized names
- Priority schema now accepts any string value for localized names

## [1.0.0] - 2024-12-19

### Added
- Initial release with full Jira integration
- 7 tools for issue management (create, update, search, transition, link, comment)
- 5 prompts for common workflows (standup, sprint planning, bug triage, release notes, epic status)
- 5 resources for read-only data access
- Support for custom fields (story points, acceptance criteria, epic links)
- Automatic test ticket creation for stories
- Comprehensive error handling and user-friendly messages
- TypeScript implementation with full type safety
- Environment-based configuration
- Setup script for easy installation
- Extensive documentation and examples

### Security
- API token authentication
- Environment variable configuration
- No hardcoded credentials