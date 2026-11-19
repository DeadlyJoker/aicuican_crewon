---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-05-team-context-attribution

English | [中文](2026-11-05-team-context-attribution.zh.md)

## Summary

Declares office, topic-initialization and workflow context source attribution in the bundled Teams plugin.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-05-team-context-attribution
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-27-subagent-settlement-attribution"
    after: "4c991086406d91fb3e674b440984a45f5cbe753eb7015fbeeb526b1d80ab570d"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-27-subagent-settlement-attribution"
    after: "969f439fbad0d9cd7763dd7b11d47eee6c90392881adc5ea7537c6ec2fbfadb8"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-27-subagent-settlement-attribution"
    after: "d76708ba819a5df9a90cf2417462835d866c5e5493686b14664afec2c8cc0328"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-27-subagent-settlement-attribution"
    after: "e651c2e677b63c61aacb1e882357318caa54d0ec1a136c3bc5cdb056ffcfefb7"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing source kinds and Session event fields retain their meaning. The added kinds carry producer-owned JSON metadata and existing message content. Older readers preserve unknown attribution without the producer, and new readers retain historical sources. The topic initializer uses its own source kind only to avoid a model request during opening.

<a id="verification"></a>
## Verification

32 native-source-admission tests pass, including external attribution without its producer. Office host tests cover restored topic bindings, source identities and initialization filtering.

<a id="dev-note"></a>
## Dev Note

None.
