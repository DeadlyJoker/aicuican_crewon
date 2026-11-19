# Upstream components

The schema fence parser and custom-element loading protocol derive from [lhuans/dsh-genui](https://github.com/lhuans/dsh-genui), commit `e97733f`, under the MIT license retained in LICENSE. The exact npm dependency `dsh-genui@0.3.1` supplies its published OpenTiny/Vue runtime. The host serves this artifact unchanged.

CrewON owns the native form renderer, persisted draft and submission state, message-body slot integration, office addressing and authoring instructions. The upstream full-message renderer and composer submission callback are not installed.

Chart theme traversal follows upstream `src/client/genui-theme.ts`; streaming repair uses `@opentiny/genui-sdk-core@1.4.0`, the same SDK version declared by upstream. CrewON validates repaired charts before rendering and does not repair editable form schemas.
