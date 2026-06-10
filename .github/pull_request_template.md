## Summary
<!-- What does this PR do? One clear sentence. -->

## Spec Reference
<!-- Every PR must reference its spec. No spec = spec-driven rule violation. -->
- Spec: `specs/XX-nome-da-spec.md` — Section: <!-- section name -->
- ADR (if applicable): `docs/adr/NNN-title.md`

## Type of Change
- [ ] `feat:` — new feature
- [ ] `fix:` — bug fix
- [ ] `perf:` — performance improvement
- [ ] `docs:` — documentation only
- [ ] `chore:` — infrastructure / config
- [ ] `test:` — tests only
- [ ] `refactor:` — code change, no behavior change

## Spatial Impact
<!-- Only fill if this PR touches spatial data, queries, or GeoServer config -->
- [ ] No spatial changes
- [ ] SRID confirmed as 4326 throughout
- [ ] Spatial index verified (explain plan reviewed)
- [ ] GeoServer bbox explicitly declared for LineString/Polygon layers
- [ ] Geometry validity checked before INSERT

## Implementation vs Spec
- [ ] Implementation is 100% aligned with the referenced spec
- [ ] Intentional divergence — reason: <!-- explain why -->

## Pre-merge Checklist
- [ ] `/project:review` executed — output pasted below or attached
- [ ] SQL scripts are idempotent (safe to run multiple times)
- [ ] No secrets or credentials in any tracked file
- [ ] `docker compose config` passes locally
- [ ] API contracts match `specs/02-api-spec.md` (no silent breaking changes)
- [ ] Conventional commit format in PR title

## AI Review Output
<!-- Paste the output of /project:review here, or write "N/A — docs-only change" -->
<details>
<summary>Review output</summary>

```
[paste /project:review output here]
```

</details>

## Screenshots / Evidence
<!-- For GeoServer, API responses, or benchmark results — paste relevant output -->
