# Testing

## Local checks

```bash
npm run check
```

This command cleans and rebuilds the distribution, executes Node's built-in test suite, and scans repository text for common credential patterns.

The Host tests load the exact Dynamic Cordis function body with mocked `harness`, `subprocess`, `shell`, and timer faces. They do not test a copied classifier implementation.

## Black-box remote test policy

Use a disposable Ubuntu host or isolated test account. Test through the four plugin Tools only. Do not use native SSH as a fallback because that bypasses the behavior under test.

Recommended independent coverage:

- successful multiline Bash with separate stdout/stderr;
- explicit remote nonzero exit;
- bounded timeout with partial output;
- command-not-found or permission failure;
- normal session close and retained counts;
- one safe connection failure against a reserved invalid hostname.

Do not prescribe exact commands to an independent evaluator when objectivity matters. Give it only the public Tool contracts, disposable connection data, safety limits, and reporting requirements.

## Required cleanup

- Create remote artifacts only under `/tmp`.
- Remove all test artifacts before closing the session.
- Terminate billable instances immediately.
- Remove temporary `known_hosts` entries.
- Never commit test passwords, keys, IP addresses, or raw production output.
