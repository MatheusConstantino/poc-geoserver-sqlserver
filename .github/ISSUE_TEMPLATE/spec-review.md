---
name: Spec Review Request
about: A spec is written and ready for review before implementation starts
title: "spec: review — "
labels: ["spec-review", "needs-po-approval"]
assignees: []
---

## Spec to Review
- File: `specs/XX-name.md`
- Author: @<!-- your handle -->
- Sprint target: <!-- Sprint N -->

## Spec Summary
<!-- 2-3 sentences: what does this spec define? -->

## Review Checklist (for reviewers)
- [ ] Problem statement is clear and well-defined
- [ ] Goals and non-goals are explicit
- [ ] Acceptance criteria are testable (QA can verify them)
- [ ] Performance targets are defined with numbers, not vague terms ("fast")
- [ ] Security considerations are addressed
- [ ] Spatial considerations are addressed (SRID, bbox, geometry types)
- [ ] Out of scope section prevents scope creep
- [ ] API schema examples are realistic and complete
- [ ] No implementation details that should be in code, not spec

## PO Sign-off Required
- [ ] PO has reviewed and accepts the scope
- [ ] Implementation can start after this issue is closed

## Open Questions
<!-- List any unresolved questions that reviewers should help answer -->
1.
2.

## Implementation Branch
<!-- Will be filled after approval -->
Branch: `feat/sprint-N-description`
