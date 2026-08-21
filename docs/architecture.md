# Architecture

## Product boundary

The Agent owns connection parameters and remote execution. The human-facing UI is a read-only projection. It never asks a person to enter host, user, password, key path, or command text.

## Runtime halves

### Host

`src/dynamic/host.js` returns a Dynamic Cordis Host Plugin. It:

- maintains an in-memory `Map` of logical sessions;
- registers four model Tools;
- resolves and launches local OpenSSH through the injected `subprocess` service;
- sends commands to `bash -s --` over stdin;
- captures bounded stdout and stderr;
- classifies command and connection failures;
- serves a package-private `dashboard.state` snapshot;
- terminates active processes when its Cordis Fiber is disposed.

### Client

`src/dynamic/client.js` returns a Dynamic Cordis Client Plugin. It:

- polls the package-private dashboard snapshot;
- registers additive UI in `shell.overlay`, `settings.section`, and `conversation.session.header.actions`;
- owns the `ssh_bash` Tool call view;
- shows one card per logical session;
- drills into ordered Agent-command and remote-response turns;
- inserts only Package-owned styles with a disposer.

## State model

Connection lifecycle and command outcome are deliberately independent.

```text
open -> ready
ready/running -> healthy  (SSH transport worked, regardless of remote exit code)
ready/running -> error    (explicit SSH connection or transport evidence)
ready/healthy/error -> closed  (normal close requested by Agent)
closed -> ready           (same logical session reopened)
```

Command outcomes are `valid` or `invalid`. A timeout, cancellation, missing command, permission problem, or other remote nonzero exit is a command failure. It does not make the connection unhealthy.

## Exit facts

- `exitCode`: remote Bash exit code when an ordinary SSH exchange completes.
- `processExitCode`: local OpenSSH process exit code.
- `signal`: local OpenSSH termination signal when available.
- `timedOut`: the plugin deadline elapsed and terminated OpenSSH.
- `aborted`: the calling Agent/tool execution cancelled the operation.

For timeout, cancellation, or signal termination, `exitCode` is `null`. Consumers must not infer a remote exit from `processExitCode`.

## Storage and lifecycle

All sessions and command records are in memory. Stopping, updating, undefining, or restarting the DSH process removes them. A normal `ssh_session_close` keeps records while the Plugin remains running.

The dashboard stores at most 30 recent commands per session and truncates each stored stdout/stderr stream to 12,000 characters. Tool results may contain up to the configured subprocess capture limit.
