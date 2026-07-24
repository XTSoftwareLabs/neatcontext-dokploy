# Contributing

Contributions should improve the shared, public Dokploy investigation boundary.

## Rules

- Use only public, redistributable information in `profiles/`, `knowledge/`,
  `templates/`, and documentation.
- Never commit user incident evidence, credentials, tokens, private logs,
  customer data, or identifying infrastructure details.
- Keep private material under `private/`; Git must report it as ignored.
- Prefer official Dokploy documentation and immutable release/commit links.
- Add a last-verified date to time-sensitive public knowledge.
- Label issue-derived explanations as hypotheses unless a complete causal chain
  is established by primary evidence.
- Preserve security fixes and controls. Do not document disabling them as a
  solution.
- Keep extensions dependency-free, read-only, narrowly scoped, and inert until
  explicit installation. Add tests for accepted and rejected identifiers,
  network methods, framing, response bounds, and error handling.
- Increment an extension version when changing its installed package.
- Increment the profile’s `policy_version` when changing typed policy,
  authority, or safety rules.

Run:

```shell
npm test
```

The command uses only Node.js built-ins; no dependency install is required.

