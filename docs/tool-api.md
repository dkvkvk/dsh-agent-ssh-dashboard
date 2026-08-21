# Tool API

## `ssh_session_open`

Creates or reopens a logical session. This records connection parameters but does not perform a network handshake; the first `ssh_bash` call validates reachability and authentication.

Required parameters:

- `session`: stable logical name, up to 64 characters.
- `host`: host, IP address, or OpenSSH Config alias.

Optional parameters:

- `user`
- `port`
- `identity_file`
- `host_key_policy`: `strict` or `accept-new`
- `connect_timeout_sec`: 3 through 60

The identity path is held in Host memory and omitted from dashboard/session summaries.

## `ssh_sessions`

Returns detached summaries. Important fields:

| Field | Meaning |
| --- | --- |
| `status` | Connection lifecycle only: `ready`, `healthy`, `running`, `closed`, `error` |
| `connectionFailure` | Current connection-scoped failure or `null` |
| `lastCommandStatus` | `valid`, `invalid`, or `null` |
| `latestCommandFailure` | Failure for the latest command when it failed |
| `validCount` | Successful command count |
| `invalidCount` | Failed command count |

## `ssh_bash`

Runs the supplied text through remote `bash -s --`. Its result includes:

```json
{
  "valid": false,
  "classification": "invalid",
  "failure": {
    "kind": "remote-exit",
    "scope": "command",
    "label": "远端命令失败",
    "message": "sanitized first stderr line"
  },
  "exitCode": 7,
  "processExitCode": 7,
  "signal": null,
  "timedOut": false,
  "aborted": false,
  "stdout": "",
  "stderr": "diagnostic\n"
}
```

`failure.scope` is authoritative:

- `command`: remote command failure, timeout, or caller cancellation; session connection remains healthy.
- `connection`: explicit SSH authentication, DNS, host-key, network, transport, signal, or spawn failure; session becomes `error`.

Known command failure kinds include `timeout`, `cancelled`, `command-not-found`, `not-executable`, and `remote-exit`.

Known connection failure kinds include `authentication`, `host-key`, `dns`, `connection-refused`, `connection-timeout`, `no-route`, `transport-disconnect`, `signal`, and `infrastructure`.

## `ssh_session_close`

Performs a logical normal close. It refuses while commands are active. On success:

- `status` becomes `closed`;
- `connectionFailure` becomes `null`;
- command records and counts remain available;
- reopening the same name keeps its history but updates connection parameters.
