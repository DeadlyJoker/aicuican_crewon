# Contexera collaboration domain

These files are copied from `Contexera/dsh-agent-team` version 0.2.6, commit `08c3e4b6ec41382941236e461cde4ffede234ffd`, under the accompanying MIT license. They retain the upstream ledger, operation validators, project and topic rules, unread projections, mentions, and associated types.

The Teams bundle owns the adapter in `office-projects.ts`. It uses the current DSH storage-domain provider and the existing native office member sessions. The upstream Host, permission overrides, member runtime, and Web application are outside this source subset.

Local formatting and JSDoc follow the repository lint rules. Indexed entries use explicit invariant checks; attention normalization still accepts stored rows predating their source field. Zod calls use the current nondeprecated equivalents.

Local adjustments address the repository's stricter unused-code checks and explicit Host/Client type entry points. Two unused parameters have leading underscores and four unused private helpers carry narrow `@ts-expect-error` annotations. Shared Session and workspace identifiers import their `/types` entry points to keep Host service declarations out of the Client program. When updating, compare these files against the pinned upstream commit and repeat the domain replay, compatibility, and local Web checks.
