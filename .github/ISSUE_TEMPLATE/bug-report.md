---
name: Bug Report
about: Something is broken or behaving incorrectly
title: "fix: "
labels: ["bug"]
assignees: []
---

## What happened?
<!-- Clear description of the unexpected behavior. -->

## What was expected?
<!-- What should have happened instead? -->

## Steps to Reproduce
```bash
# 1.
# 2.
# 3.
```

## Environment
- OS: <!-- e.g., Ubuntu 22.04, macOS 14, Windows 11 -->
- Docker version: <!-- docker --version -->
- Docker Compose version: <!-- docker compose version -->
- Branch/commit: <!-- git rev-parse --short HEAD -->

## Spatial Context (if applicable)
<!-- Fill this section only for spatial/GeoServer/SQL bugs -->
- SRID involved: <!-- e.g., 4326 -->
- Geometry type: <!-- POINT / LINESTRING / POLYGON -->
- Bbox used: <!-- minX, minY, maxX, maxY -->
- SQL Server or PostGIS: <!-- which database -->
- GeoServer layer: <!-- layer name if applicable -->

## Error Output
<details>
<summary>Logs / stack trace</summary>

```
[paste error output here]
```

</details>

## Possible Root Cause
<!-- Optional: your hypothesis about what's causing this -->

## Related
- Spec: `specs/XX-...`
- Possibly related to the GeoServer bbox bug? <!-- Yes / No / Unknown -->
