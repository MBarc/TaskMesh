---
name: Email Escalation Report
namingConvention: "{task_name} - Escalation Report"
variables:
  - name: escalation_level
    description: The escalation tier (Tier 2, Tier 3, Management, Vendor)
  - name: original_ticket
    description: The original ticket or reference number for the issue being escalated
  - name: escalated_to
    description: Name or team the issue is being escalated to
  - name: escalation_reason
    description: Brief reason for the escalation (e.g., SLA breach, technical complexity, customer request)
---

# Escalation Report: {task_name}

**Date Created:** {date_created}
**Board:** {board_name}
**Original Ticket:** {original_ticket}
**Escalation Level:** {escalation_level}
**Escalated To:** {escalated_to}

---

## Escalation Summary

**Reason for Escalation:** {escalation_reason}

## Issue Background

### Original Issue Description

Summarize the original issue as reported.

### Actions Taken So Far

| Date | Action | Result |
| --- | --- | --- |
| | | |

### Current Status

Describe the current state of the issue.

## Impact Assessment

- **Users Affected:**
- **Business Impact:**
- **Duration So Far:**
- **SLA Status:** Within SLA / At Risk / Breached

## Escalation Details

### What Is Needed

Describe what is needed from the escalation team.

### Expected Outcome

What outcome is expected from this escalation?

### Deadline

When does this need to be resolved by?

## Communication Trail

| Date | From | To | Summary |
| --- | --- | --- | --- |
| | | | |

## Resolution

### Actions Taken by Escalation Team

1.
2.

### Final Resolution

Describe the final resolution.

### De-escalation Criteria Met

- [ ] Issue resolved
- [ ] Customer notified
- [ ] Original ticket updated
- [ ] Knowledge base updated (if applicable)
