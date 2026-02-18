---
name: Post-Incident Review
namingConvention: "{incident_id} - {task_name} - PIR"
variables:
  - name: incident_id
    description: The incident ticket number being reviewed (e.g., INC0012345)
  - name: incident_commander
    description: Person who led the incident response
  - name: service_affected
    description: The primary service or system that was impacted
  - name: outage_duration
    description: Total duration of the service outage or degradation (e.g., 2h 15m)
  - name: severity_level
    description: The severity classification of the incident (SEV1, SEV2, SEV3, SEV4)
---

# Post-Incident Review: {incident_id}

**Task:** {task_name}
**Date Created:** {date_created}
**Board:** {board_name}
**Incident Commander:** {incident_commander}
**Severity:** {severity_level}
**Service Affected:** {service_affected}
**Outage Duration:** {outage_duration}

---

## Executive Summary

Provide a 2-3 sentence summary of the incident, its impact, and resolution.

## Incident Timeline

| Time (UTC) | Event | Actor |
| --- | --- | --- |
| | Issue first detected | Monitoring |
| | Incident declared | |
| | Investigation started | |
| | Root cause identified | |
| | Mitigation applied | |
| | Service fully restored | |
| | Incident closed | |

## Impact Summary

- **Users affected:**
- **Revenue impact:**
- **SLA impact:**
- **Data loss:** Yes / No
- **Customer notifications sent:** Yes / No

## Detection

- **How was the incident detected?** Monitoring alert / Customer report / Internal report
- **Time to detect:**
- **Detection gap analysis:** Were there monitoring gaps?

## Root Cause

Describe the root cause in detail.

## Contributing Factors

List the factors that contributed to the incident occurring or to its severity.

1.
2.
3.

## Resolution

Describe the steps taken to resolve the incident.

1.
2.
3.

## What Went Well

-
-
-

## What Could Be Improved

-
-
-

## Action Items

| Action | Owner | Priority | Due Date | Status |
| --- | --- | --- | --- | --- |
| | | | | |
| | | | | |
| | | | | |

## Attendees

| Name | Role |
| --- | --- |
| | Incident Commander |
| | Engineering Lead |
| | Service Owner |
