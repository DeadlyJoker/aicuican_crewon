---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-13-subagent-local-tool-filter

English | [中文](2026-11-13-subagent-local-tool-filter.zh.md)

## Summary

Preserves the optional local-tool inclusion flag in persisted subagent descriptors.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-13-subagent-local-tool-filter
baseline: false
changes:
  - root: "event:subagent/descriptor"
    previous: "2026-09-11-initial"
    after: "233d9c8fb2b63c888b27d81060fe98a6abef00964fb9a03ddd9ae616b32b739c"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing descriptors omit includeLocal and retain inherited filtering. Current readers preserve explicit true and false and reject nonboolean values. Earlier readers reject the unknown includeLocal field rather than silently broadening permissions. The session version remains unchanged because older readers safely refuse these descriptors.

<a id="verification"></a>
## Verification

Focused subagent service and scoped tool tests: 85 passed, including descriptor roundtrip, invalid boolean rejection, and local-tool visibility.

<a id="dev-note"></a>
## Dev Note

None.
