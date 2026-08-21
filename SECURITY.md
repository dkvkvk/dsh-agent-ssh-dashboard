# Security Policy

## Reporting

Do not open a public issue containing credentials, private keys, passwords, host inventories, or production command output. Report sensitive findings privately to the repository owner through GitHub's security reporting channel.

## Credential handling

- Never commit private keys, passwords, access tokens, `.env` files, `known_hosts`, or real production connection details.
- Supply `identity_file` only at runtime. The dashboard and `ssh_sessions` deliberately omit its path.
- Prefer `host_key_policy: strict` for stable production hosts. `accept-new` is intended for controlled bootstrap workflows.
- Scope SSH keys to the minimum required hosts and privileges.

## Remote execution

`ssh_bash` executes arbitrary Bash supplied by the Agent. Treat installation of this plugin as granting the Agent the same remote authority as the configured SSH identity. Review the Agent preset, sandbox policy, model tool grants, and target account permissions together.

## Test resources

Use disposable hosts or isolated test accounts. Create temporary files only under `/tmp`, remove them after testing, and terminate billable cloud resources immediately after the test.
