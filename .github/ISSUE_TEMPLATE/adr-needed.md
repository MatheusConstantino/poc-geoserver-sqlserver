---
name: ADR Needed
about: A significant architectural decision needs to be documented before implementation
title: "docs: ADR needed — "
labels: ["adr", "architecture"]
assignees: []
---

## What decision needs to be documented?
<!-- Describe the architectural question or choice that needs a formal decision record. -->

## Why is an ADR needed here?
<!-- This decision is significant enough to document if it: -->
<!-- - Affects multiple components or sprints -->
<!-- - Has non-obvious tradeoffs -->
<!-- - Will be hard to reverse later -->
<!-- - Involves performance, cost, or security tradeoffs at scale -->

## Context
<!-- What constraints, requirements, or events are driving this decision? -->

## Options Being Considered
1. Option A: ...
2. Option B: ...
3. Option C: ...

## Volumetry Dimension
<!-- How does this decision change at different scales? -->
- At 50k features (current POC): ...
- At 500k features: ...
- At 5M+ features: ...

## Target ADR File
`docs/adr/NNN-kebab-title.md`
(Run `/project:new-adr [title]` to scaffold it)

## Blocking?
- [ ] Yes — implementation of `[feature/sprint]` is blocked until this ADR is written and accepted
- [ ] No — can proceed but should document soon
