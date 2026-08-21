# Contributing

## Development workflow

1. Fork the repository and create a focused branch.
2. Run `npm run check` before opening a pull request.
3. Describe whether the change affects connection lifecycle, command results, Tool contracts, Client rendering, or all four.
4. Include tests for every new failure kind or state transition.
5. Keep pull requests scoped; avoid unrelated formatting or generated-file churn.

## Behavioral invariants

- A logical SSH session maps to exactly one dashboard card.
- The card status describes connection lifecycle only: `ready`, `healthy`, `running`, `closed`, or `error`.
- A command failure must not mark the session as `error` unless there is explicit SSH transport evidence.
- `exitCode` is the remote Bash exit code. It is `null` for timeout, cancellation, or signal termination.
- `processExitCode` is the local OpenSSH process exit code.
- Normal `ssh_session_close` produces `closed`, even when prior commands failed.
- The dashboard never reveals `identity_file`.

## Pull-request checklist

- [ ] `npm run check` passes.
- [ ] No credentials, keys, passwords, real host inventories, or cloud instance data are committed.
- [ ] Tool schema changes are documented in `docs/tool-api.md`.
- [ ] UI changes preserve one-card-per-session drill-down behavior on desktop and mobile.
- [ ] New side effects have a Cordis disposer.

## End-to-end tests

Black-box tests must use only the four SSH tools, not native SSH. Keep commands bounded and safe. Any remote files must live under `/tmp` and be deleted before finishing. Do not modify firewalls, users, packages, or system services during a routine plugin test.
