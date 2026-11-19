# Skill explorer source attribution

This directory contains selected source from [`zhu1090093659/dsh-web`](https://github.com/zhu1090093659/dsh-web), package `@linxin666/dsh-client-ui-skill-explorer` version `0.4.15`, at commit `4eaeac9b73072c9b729dcfed423e864b1dae2117`.

## Imported files

| Upstream path | Local path | Responsibility |
| --- | --- | --- |
| `packages/dsh-skill-explorer/src/collect.ts` | `collect.ts` | Skill root discovery, source grouping and file identities |
| `packages/dsh-skill-explorer/src/frontmatter.ts` | `frontmatter.ts` | Skill metadata parsing and rewriting |
| `packages/dsh-skill-explorer/src/import.ts` | `import.ts` | Directory and bounded ZIP import |
| `packages/dsh-skill-explorer/src/client/skill-filter.ts` | `../client/skill-filter.ts` | Name-prioritized search and source/status filtering |

## License

The imported package declares BSD-3-Clause in its `LICENSE`, package manifest and README license section. Copyright belongs to `zhu1090093659` as stated in the retained [license](LICENSE). Source and binary redistributions retain the copyright notice, conditions and disclaimer. The copyright holder's and contributors' names require permission for product endorsement.

The upstream repository root declares Apache-2.0, and the package README's license badge also shows Apache-2.0. This selection follows the explicit package-level BSD-3-Clause license. Its source inventory comprises the four files above. The repository's shared HTTP, pairing, mount guard, build scripts, telemetry and artwork are outside this selection.

The bundle icon reuses this repository's `packages/experimental/plugin-market-bundle/icon.svg`. Its DeepSeek MIT notice is retained in [LICENSE-MIT](../../LICENSE-MIT).

## Local adaptations

The Host uses the current Harness authenticated Remote services and workspace identities. Native Client slots, controls and locale dictionaries provide the Toolbox interface. The source-specific collection and filtering rules remain the basis of the skill catalog. MCP connections, command recipes, resource presentation and Agent permissions are local integrations with the current Harness services.

Skill edits preserve unrelated frontmatter and use atomic writes with revision checks. Creation and import protect existing files, validate destinations and bound archive processing. Deletion records a recoverable trash entry with an explicit restore action.

Plugin-owned skills remain under their provider's invocation policy. Their catalog rows are read-only. Filesystem-backed skills expose the real `disable-model-invocation` field through the edit operation.

The package root [README](../../README.md) owns user behavior and limitations. Keep this source inventory, retained license and local modification description with distributions containing these files.
