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

### Added
- Comprehensive logging system with DEBUG support
- Automatic retry with exponential backoff (3 attempts)
- Connection testing on startup
- Atlassian Document Format (ADF) support for rich text
- Convenient run.sh script for easier execution
- Input validation with detailed error messages
- Robust error handling for all edge cases

### Improved
- More informative startup messages
- Better handling of test ticket creation failures
- Enhanced transition handling with available options display

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