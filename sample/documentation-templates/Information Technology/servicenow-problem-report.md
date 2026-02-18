---
name: ServiceNow Problem Report
namingConvention: "{problem_number} - {task_name} - Problem Report"
variables:
  - name: problem_number
    description: The ServiceNow problem ticket number (e.g., PRB0003456)
  - name: priority
    description: The priority of the problem (Critical, High, Medium, Low)
  - name: affected_service
    description: The IT service or system affected by the recurring issue
  - name: problem_manager
    description: The person responsible for managing the problem investigation
---

# Problem Report: {problem_number}

**Task:** {task_name}
**Date Created:** {date_created}
**Board:** {board_name}
**Priority:** {priority}
**Affected Service:** {affected_service}
**Problem Manager:** {problem_manager}

---

## Problem Statement

Clearly describe the recurring issue or underlying fault.

## Related Incidents

| Incident Number | Date | Short Description |
| --- | --- | --- |
| | | |
| | | |

## Impact Analysis

- **Frequency:** How often does this problem occur?
- **Users Affected:** Number and type of affected users
- **Business Impact:** Financial, operational, or reputational impact

## Investigation

### Chronology

Document the investigation timeline and findings.

| Date | Activity | Findings |
| --- | --- | --- |
| | | |

### Root Cause Analysis

#### 5-Whys Analysis

1. **Why?**
2. **Why?**
3. **Why?**
4. **Why?**
5. **Why?**

#### Root Cause Summary

Describe the confirmed root cause.

## Known Error

- **Workaround Available:** Yes / No
- **Workaround Description:**

## Resolution

### Permanent Fix

Describe the permanent solution.

### Implementation Requirements

- [ ] Change request created
- [ ] Testing completed
- [ ] Stakeholder approval
- [ ] Deployment scheduled

## Prevention Measures

List actions to prevent recurrence.

1.
2.
3.

## Closure Criteria

- [ ] Root cause identified and documented
- [ ] Permanent fix implemented
- [ ] Related incidents linked
- [ ] Knowledge article created
