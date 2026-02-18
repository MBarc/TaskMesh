---
name: IT Runbook
namingConvention: "{task_name} - Runbook"
variables:
  - name: system_name
    description: Name of the system or service this runbook covers
  - name: runbook_owner
    description: Team or individual responsible for maintaining this runbook
  - name: criticality
    description: Criticality level of the system (Mission Critical, High, Medium, Low)
  - name: last_tested
    description: Date the runbook procedures were last tested or validated
---

# Runbook: {task_name}

**System:** {system_name}
**Date Created:** {date_created}
**Board:** {board_name}
**Owner:** {runbook_owner}
**Criticality:** {criticality}
**Last Tested:** {last_tested}

---

## Overview

Provide a brief overview of the system and the purpose of this runbook.

## Prerequisites

### Access Requirements

- [ ] Access to server/system
- [ ] Required credentials or service accounts
- [ ] VPN or network access

### Tools Required

-
-

## Architecture Reference

Describe or reference the system architecture relevant to these procedures.

| Component | Host/URL | Purpose |
| --- | --- | --- |
| | | |

## Standard Operating Procedures

### Procedure 1: Health Check

**When to use:** Routine monitoring or after a deployment.

1.
2.
3.

**Expected result:**

### Procedure 2: Service Restart

**When to use:** Service is unresponsive or degraded.

1.
2.
3.

**Expected result:**

### Procedure 3: Log Collection

**When to use:** Investigating errors or performance issues.

1.
2.
3.

**Log locations:**

| Log Type | Path/Location |
| --- | --- |
| | |

## Troubleshooting Guide

| Symptom | Possible Cause | Resolution |
| --- | --- | --- |
| | | |
| | | |

## Escalation Path

| Level | Contact | When to Escalate |
| --- | --- | --- |
| L1 | | |
| L2 | | |
| L3 / Vendor | | |

## Recovery Procedures

### Disaster Recovery Steps

1.
2.
3.

### Data Backup & Restore

- **Backup schedule:**
- **Backup location:**
- **Restore procedure:**

## Change History

| Date | Author | Description |
| --- | --- | --- |
| {date_created} | | Initial version |
