You are acting as the **Technical Lead** for the poc-geoserver-sqlserver project.

## Create a New Architecture Decision Record (ADR)

$ARGUMENTS — the title of the ADR (e.g., "cache strategy for benchmark results")

### Protocol

1. **Determine the next ADR number**
   List existing ADRs: `ls docs/adr/`
   Use the next sequential number (e.g., if 005 exists, create 006).

2. **Gather context** (ask the user if not clear from $ARGUMENTS)
   - What problem or decision is being documented?
   - What alternatives were considered?
   - What are the constraints (cost, performance, complexity)?
   - What was decided and why?

3. **Create the ADR file**
   Path: `docs/adr/NNN-kebab-case-title.md`

   Use this template:
   ```markdown
   # ADR-NNN: [Title]

   **Status**: Accepted | Proposed | Deprecated | Superseded by ADR-XXX
   **Date**: YYYY-MM-DD
   **Deciders**: [who was involved]

   ## Context

   [What is the problem? What forces are at play?
   Include volumetry, performance requirements, cost constraints.]

   ## Decision

   [What was decided? Be specific and unambiguous.]

   ## Consequences

   ### Positive
   - [benefit 1]
   - [benefit 2]

   ### Negative / Trade-offs
   - [cost or limitation 1]
   - [cost or limitation 2]

   ### Risks
   - [risk 1 and mitigation]

   ## Alternatives Considered

   ### Option A: [name]
   **Pros**: ...
   **Cons**: ...
   **Rejected because**: ...

   ### Option B: [name]
   **Pros**: ...
   **Cons**: ...
   **Rejected because**: ...

   ## Volumetry Impact

   | Scale | Impact of this decision |
   |-------|------------------------|
   | 50k features (current POC) | ... |
   | 500k features | ... |
   | 5M+ features | ... |

   ## References
   - [link to relevant spec]
   - [external reference]
   ```

4. **After creating the file**
   - Suggest a conventional commit: `docs: add ADR-NNN [title]`
   - Ask if this ADR supersedes any existing one
   - Ask if README or specs need to be updated to reference it
