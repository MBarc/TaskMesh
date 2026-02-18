---
name: ServiceNow Incident Report
namingConvention: "{ticket_number} - {task_name} - Incident Report"
variables:
  - name: ticket_number
    description: The ServiceNow incident ticket number (e.g., INC0012345)
  - name: severity
    description: The severity level of the incident (Critical, High, Medium, Low)
  - name: affected_service
    description: The IT service or system affected by the incident
  - name: reported_by
    description: Name of the person who reported the incident
  - name: assigned_group
    description: The support group assigned to resolve the incident
---

# Incident Report: {ticket_number}

**Task:** {task_name}
**Date Created:** {date_created}
**Board:** {board_name}
**Severity:** {severity}
**Reported By:** {reported_by}
**Assigned Group:** {assigned_group}

---

## Incident Summary

**Affected Service:** {affected_service}
**Impact:** Describe the business impact and number of affected users.

## Timeline of Events

| Time | Event |
| --- | --- |
| | Incident reported |
| | Initial triage completed |
| | Investigation started |
| | Root cause identified |
| | Resolution implemented |
| | Service restored |

## Symptoms

Describe the symptoms observed by users and monitoring systems.

-
-
-

## Root Cause

Describe the identified root cause of the incident.

## Resolution Steps

1.
2.
3.

## Workarounds Applied

Describe any temporary workarounds that were applied before the permanent fix.

## Affected Configuration Items

| CI Name | Type | Impact |
| --- | --- | --- |
| | | |

## Communication Log

| Time | Audience | Message Summary |
| --- | --- | --- |
| | | |

## Lessons Learned

- What went well:
- What could be improved:
- Action items for prevention:

## Attachments

List any relevant screenshots, logs, or supporting documents.
