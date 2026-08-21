# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-08-21

### Added

- Agent-owned logical SSH sessions backed by local OpenSSH.
- Model tools: `ssh_session_open`, `ssh_sessions`, `ssh_bash`, and `ssh_session_close`.
- Read-only dashboard with one card per logical session and command drill-down.
- Separate connection lifecycle and per-command result semantics.
- Structured SSH, command, timeout, cancellation, and signal failures.
- Distinct remote `exitCode` and local SSH `processExitCode` fields.
- Tests for command failures, connection failures, timeouts, closure, and Client Slot registration.
