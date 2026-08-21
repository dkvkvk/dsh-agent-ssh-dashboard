## Summary

Describe the behavior changed and why.

## Scope

- [ ] Host SSH execution
- [ ] Connection lifecycle
- [ ] Command result semantics
- [ ] Client dashboard
- [ ] Tool contract
- [ ] Documentation only

## Verification

- [ ] `npm run check`
- [ ] No secrets, private keys, passwords, or real host inventory committed
- [ ] New state transitions or failure kinds have tests
- [ ] Normal command failures do not mark the session connection as `error`
- [ ] Normal close still produces `closed`

## Compatibility

List any Tool fields, state labels, or installation behavior that changed.
