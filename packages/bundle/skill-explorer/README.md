---
description: "Manage skills, MCP connectors, local tools and expert permissions in the native Toolbox."
kind: "package-bundle"
---

# @deepseek-ai/dsh-skill-explorer-bundle

English | [中文](README.zh.md)

## Summary

This optional builtin bundle provides Toolbox for the Harness Web and Desktop clients. It separates skills, MCP connectors and local commands into resource tabs, with purpose filters, native configuration, resource-specific status and per-Agent-preset capability permissions.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

Enable **Toolbox** in the plugin manager, then open it from the sidebar using the toolbox-shaped icon. Cards show a readable name, purpose and resource-specific status. Skill status indicates permission for model invocation, MCP status describes the connection and discovered tools, and local-tool status indicates whether the configured program was found. Purpose filters cover writing, research, data, development, media and general tasks. Resource settings retain their native identifiers, while display names and purposes are stored separately. Technical connection and command fields appear under advanced settings. Management operations require the Host-owner identity.

### Skills

The Skills tab starts with global skills, including builtin, personal, custom-directory and runtime-provider sources. Select a workspace explicitly to include its project skills. Cards identify each source and allow instruction previews and display-name or purpose changes. Create or import personal skills without selecting a workspace; selecting a workspace also permits project destinations. Editable personal and project skill files expose model-invocation switches. Bundled files remain read-only.

### Service connections

Add an MCP connection using its service address or local launch configuration. The connection editor writes through native Settings with revision checks. The native MCP manager owns connection startup, availability, reconnection, probing and restart. The toolbox displays its live status and respects ownership of inherited and plugin-registered entries. The access-token field writes to the native credentials store and saves a reference in the connection configuration. Existing private values remain masked during editing.

### Local tools

Add a named command recipe or start from the **Text length** and **Video details** templates. They configure `node` and `ffprobe` commands respectively. Program detection resolves the executable in the subprocess provider's execution environment. An explicit test runs the configured version arguments. The local-tool editor identifies the serving Host, and a manual run chooses its execution workspace in the run dialog, defaulting to the Host working directory. Browsing and configuring tools does not select a workspace.

A recipe stores an executable, fixed arguments, optional `{input}` substitutions and version-check arguments. Each enabled recipe registers `toolbox_cli_<id>` with one `input` parameter. Execution passes an argv array through the native subprocess and sandbox services. Deadlines, bounded output, cancellation and cleanup apply to both manual and Agent runs. A changed recipe invalidates a previously admitted execution before process startup.

### Agent permissions

The permissions editor selects a native Agent preset and either retains inherited behavior or limits it to selected skills, service connections, command recipes and other native tools. A missing or disabled policy retains the preset's normal capability set. An enabled policy restricts advertised capabilities and actual dispatch through the native scoped registries and tool guard. Expert teams, workflows and offices use the policy when they use that preset. Changes are persisted through the toolbox Settings namespace. When Teams is enabled, its expert form hosts the same choices through the optional `toolbox.expert-capabilities` slot. Saving validates discovery readiness, saves the expert revision, then copies the staged policy to the new preset. A failed policy write retains the form and retries without creating another expert revision unless its fields changed. The expert revision remains saved if the form is closed after that failure. Choices restrict invocation; they do not preload skill instructions or install dependencies.

Runtime roles can supply required protocol tools through `toolbox/required-tools`. The AgentTeams provider validates the exact child session against its trusted spawn setup and current team record before supplying the four member coordination tools. These tools supplement the preset policy only while that Agent is an active team member; ordinary expert conversations and workflow steps retain their configured capabilities. Removal, stopping, reassignment and provider disposal revoke the role defaults. Other scoped restrictions, sandbox checks, approvals and the tool executor’s own authorization remain authoritative.

### Configuration

The existing package name and `skill-explorer` profile entry identify this bundle. `dshHome`, `agentsHome`, `customSkillDirs` and `bundledSkillDirs` select skill roots. `maxSkillBytes`, `maxImportBytes`, `maxImportEntries` and `maxImportTotalBytes` bound skill imports. `mcpSettingsNamespace` selects the native MCP manager's Settings entry. `cliTools` stores command recipes, and `cliTimeoutMs`, `cliProbeTimeoutMs`, `cliOutputBytes` and `cliGraceMs` bound execution. `agentPermissions` and `catalog` hold preset permissions and resource presentation. The [configuration declaration](src/index.ts) owns defaults and validation.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bundle reuses the [upstream skill collection, metadata, import and filter logic](src/upstream/UPSTREAM.md). Its MCP, command, presentation and permission adapters integrate the current native services. Configuration writes retain Settings revisions, execution uses the native tool pipeline, and the Client reuses existing page layouts, controls and locale services.

The Toolbox reuses the Host skill-management operations and native skill editor for personal and project creation and import. The original `SkillsPage` remains available to existing callers.

The [bundle patch](cordis.patch.yml) inserts the stable `skill-explorer` profile entry. The existing `crewon-skills` Client panel identifier remains available while its label is Toolbox. Resource presentation uses `skill:<name>`, `mcp:<name>` and `cli:<id>` keys independently of the native resource configuration.

</details>

<a id="further-exploration"></a>
## Further Exploration

[Source attribution](src/upstream/UPSTREAM.md) · [Skill registry](../../skill/skill/README.md) · [MCP manager](../../mcp/mcp-manager/README.md) · [Subprocess execution](../../subprocess/subprocess/README.md) · [Agent presets](../../preset/agent-preset-registry/README.md)

<a id="model-experience"></a>
## Model Experience

### Toolbox capabilities

#### What the model sees

The filesystem provider reads `SKILL.md` metadata, including `name`, `description` and `disable-model-invocation`. Connected MCP servers contribute their native tool descriptions and schemas. Each configured command contributes a named `toolbox_cli_<id>` tool whose description contains the recipe's readable name and description, with an `input` field. Enabled Agent permissions restrict which capabilities that preset can discover and call.

#### Token effect

The management page has no direct model token cost. Skill descriptions, loaded instructions and the admitted MCP or command schemas contribute through their existing providers.

#### KV Cache effect

Changes to skill metadata, connected tools, enabled recipes or preset permissions can change later model requests when the native registries refresh the admitted capability set.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- A skill's invocation permission does not establish that it can complete a particular task.
- Retained Host skill imports copy instruction files. Supporting scripts and other resources require separate placement. Directory import reads one level. ZIP import accepts nested `SKILL.md` entries within its limits. Restoring a trashed instruction file requires its original destination to be free.
- Interactive MCP OAuth sign-in is unavailable in the current native manager. Connections use configured credentials or credential references.
- Command templates configure existing executables. Installing `node`, `ffprobe` or another binary is a separate device setup step. A program-found status confirms executable resolution. Successful execution also depends on its arguments, input, permissions and execution environment.
- MCP connection and tool-discovery results describe the current connection. Individual tool calls can still require authorization or report execution errors.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Source licensing — click to expand</summary>

The selected upstream files retain [BSD-3-Clause](LICENSE), including their copyright notice and redistribution conditions. The [source attribution](src/upstream/UPSTREAM.md) records the exact source pin and local adaptations. The upstream repository root and package badge use Apache-2.0, while the selected package's license file, manifest and README license section specify BSD-3-Clause.

</details>
