---
name: ServiceNow Change Request
namingConvention: "{change_number} - {task_name} - Change Request"
variables:
  - name: change_number
    description: The ServiceNow change request number (e.g., CHG0005678)
  - name: change_type
    description: The type of change (Standard, Normal, Emergency)
  - name: risk_level
    description: The assessed risk level of the change (Low, Medium, High)
  - name: environment
    description: The target environment for the change (Production, Staging, Development)
  - name: change_owner
    description: The person responsible for implementing the change
---

# Change Request: {change_number}

**Task:** {task_name}
**Date Created:** {date_created}
**Board:** {board_name}
**Change Type:** {change_type}
**Risk Level:** {risk_level}
**Environment:** {environment}
**Change Owner:** {change_owner}

---

## Change Description

Provide a clear description of what is being changed and why.

## Business Justification

Explain the business need driving this change.

## Scope of Change

### In Scope

-
-

### Out of Scope

-
-

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| | | | |

## Implementation Plan

### Pre-Change Steps

1.
2.

### Change Steps

1.
2.
3.

### Post-Change Verification

1.
2.

## Rollback Plan

Describe the steps to revert the change if issues are encountered.

1.
2.
3.

## Affected Configuration Items

| CI Name | Type | Change Description |
| --- | --- | --- |
| | | |

## Schedule

| Milestone | Date/Time | Owner |
| --- | --- | --- |
| Change window start | | |
| Implementation begin | | |
| Verification complete | | |
| Change window end | | |

## Approvals

| Approver | Role | Status | Date |
| --- | --- | --- | --- |
| | CAB Chair | | |
| | Service Owner | | |
| | Technical Lead | | |

## Post-Implementation Review

- Change successful: Yes / No
- Issues encountered:
- Lessons learned:
