---
name: Root Cause Analysis
namingConvention: "{task_name} - Root Cause Analysis"
variables:
  - name: rca_id
    description: Unique identifier for this RCA (e.g., RCA-2024-042)
  - name: related_tickets
    description: Comma-separated list of related incident or problem tickets
  - name: affected_system
    description: The system or component where the failure occurred
  - name: rca_lead
    description: Person leading the root cause analysis investigation
---

# Root Cause Analysis: {task_name}

**RCA ID:** {rca_id}
**Date Created:** {date_created}
**Board:** {board_name}
**RCA Lead:** {rca_lead}
**Related Tickets:** {related_tickets}
**Affected System:** {affected_system}

---

## Problem Statement

Clearly define the problem being investigated. Include what happened, when, and the observable impact.

## Data Collection

### Logs and Metrics

| Source | Time Range | Key Observations |
| --- | --- | --- |
| | | |

### Configuration Changes

Were any recent changes made to the affected system?

| Date | Change | Change Number |
| --- | --- | --- |
| | | |

## Analysis Methods

### Fishbone Diagram (Ishikawa)

Identify contributing causes across categories:

- **People:**
- **Process:**
- **Technology:**
- **Environment:**

### 5-Whys

1. **Why did the failure occur?**

2. **Why?**

3. **Why?**

4. **Why?**

5. **Why?** (Root cause)


### Fault Tree

Describe the logical chain of events leading to the failure.

```
Failure Event
├── Contributing Factor A
│   ├── Sub-cause A1
│   └── Sub-cause A2
└── Contributing Factor B
    └── Sub-cause B1
```

## Root Cause

State the confirmed root cause(s).

### Primary Root Cause

### Secondary Causes

## Corrective Actions

### Immediate Actions (Already Taken)

| Action | Date | Owner |
| --- | --- | --- |
| | | |

### Short-Term Corrective Actions

| Action | Owner | Target Date | Status |
| --- | --- | --- | --- |
| | | | |

### Long-Term Preventive Actions

| Action | Owner | Target Date | Status |
| --- | --- | --- | --- |
| | | | |

## Verification

How will we verify the corrective actions are effective?

- [ ] Monitoring in place
- [ ] Test scenarios defined
- [ ] Review scheduled for:

## Approval

| Name | Role | Date |
| --- | --- | --- |
| | RCA Lead | |
| | Service Owner | |
| | IT Manager | |
