# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed

- Sidebar footer entry now collapses correctly: the slot registrant is the component itself — the previous `function() { return h(FooterAction) }` wrapper swallowed the shell's props, so `wide` never arrived and the collapsed rail kept rendering the full text row "SSH 会话" instead of the icon-only button.

### Changed

- Dashboard entry moved from the conversation session header (`conversation.session.header.actions`) to the sidebar footer (`sidebar.footer.action`, order 90): a shell-native row labeled "SSH 会话" when the sidebar is wide, collapsing to a 36px round icon button in the rail. The hardcoded GitHub-light header button was removed along with its slot registration.
- The footer entry glyph is now an inline SVG terminal icon (currentColor, 18px, shared by the wide and rail forms) instead of the monospace `>_` text, matching the shell's native icon style.
- The dashboard overlay no longer opens automatically on GUI load: the initial overlay state is now closed (`overlayOpen = false`); it opens only from the sidebar footer entry or the settings section.

## [0.1.0] - 2026-08-21

### Added

- Agent-owned logical SSH sessions backed by local OpenSSH.
- Model tools: `ssh_session_open`, `ssh_sessions`, `ssh_bash`, and `ssh_session_close`.
- Read-only dashboard with one card per logical session and command drill-down.
- Separate connection lifecycle and per-command result semantics.
- Structured SSH, command, timeout, cancellation, and signal failures.
- Distinct remote `exitCode` and local SSH `processExitCode` fields.
- Tests for command failures, connection failures, timeouts, closure, and Client Slot registration.
