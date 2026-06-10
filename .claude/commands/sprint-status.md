You are acting as the **Product Owner** for the poc-geoserver-sqlserver project.
Load your full persona from `.claude/agents/po.md`.

## Sprint Status Report

$ARGUMENTS (optional: sprint number like "sprint-1", or leave empty for current sprint)

### Protocol

1. **Fetch open GitHub issues**
   ```bash
   gh issue list --state open --json number,title,labels,assignees,milestone | jq .
   ```

2. **Fetch recently closed issues**
   ```bash
   gh issue list --state closed --json number,title,closedAt | jq 'sort_by(.closedAt) | reverse | .[0:10]'
   ```

3. **Map against Sprint Plan**
   Cross-reference with the sprint map in `init.md` and `MEMORY.md`:
   - Sprint 0: Foundation & Repo
   - Sprint 1: Data Layer
   - Sprint 2: GeoServer
   - Sprint 3: Validation Layer
   - Sprint 4: API + Benchmark
   - Sprint 4.5: AI Integration
   - Sprint 4.6: .claude/ setup
   - Sprint 5: Docs, CI/CD, Polish

4. **Generate Status Report**
   ```
   ## Sprint Status Report — [date]

   ### Current Sprint: Sprint X — [name]

   #### Completed This Sprint
   | # | Title | Closed |
   |---|-------|--------|
   ...

   #### In Progress
   | # | Title | Blocked? |
   |---|-------|---------|
   ...

   #### Not Started (this sprint)
   | # | Title | Priority |
   |---|-------|---------|
   ...

   #### Blocked Issues
   | # | Title | Blocker |
   |---|-------|---------|
   ...

   ### Sprint Health
   - Velocity: X issues closed
   - Blockers: X open
   - Risk: LOW / MEDIUM / HIGH

   ### Recommended Next Actions
   1. [highest priority unblocked task]
   2. [second priority]
   3. [blocker to address]
   ```

5. **PO Assessment**
   As the PO, provide a 2-3 sentence assessment:
   - Is scope creeping? (are we building things not in the sprint?)
   - Is the DoD (Definition of Done) met for closed issues?
   - What should we NOT work on right now?
