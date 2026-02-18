---
name: Access Request Documentation
namingConvention: "{task_name} - Access Request"
variables:
  - name: requester_name
    description: Full name of the person requesting access
  - name: requester_department
    description: Department or team the requester belongs to
  - name: target_system
    description: The system, application, or resource access is being requested for
  - name: access_type
    description: Type of access being requested (Read-Only, Read-Write, Admin, Custom)
  - name: approver_name
    description: Name of the manager or system owner who approves this request
---

# Access Request: {task_name}

**Date Created:** {date_created}
**Board:** {board_name}
**Requester:** {requester_name}
**Department:** {requester_department}
**Target System:** {target_system}
**Access Type:** {access_type}

---

## Request Details

### Business Justification

Explain why this access is needed and how it supports the requester's role.

### Specific Permissions Requested

| Permission / Role | System / Resource | Duration |
| --- | --- | --- |
| {access_type} | {target_system} | |

### Access Duration

- **Permanent** / **Temporary**
- If temporary, end date:

## Compliance & Security

### Least Privilege Verification

- [ ] Requested access is the minimum necessary for the role
- [ ] No conflicting access / separation of duties issues
- [ ] Sensitive data access justified

### Regulatory Considerations

- [ ] SOX compliance reviewed (if applicable)
- [ ] HIPAA compliance reviewed (if applicable)
- [ ] PCI-DSS compliance reviewed (if applicable)
- [ ] GDPR/data privacy reviewed (if applicable)

### Existing Access

Does the requester already have access to related systems?

| System | Current Access Level | Granted Date |
| --- | --- | --- |
| | | |

## Approval Chain

| Approver | Role | Status | Date |
| --- | --- | --- | --- |
| {approver_name} | Manager | | |
| | System Owner | | |
| | IT Security | | |

## Provisioning

### Steps to Grant Access

1.
2.
3.

### Verification

- [ ] Access granted successfully
- [ ] Requester confirmed access works
- [ ] Access logged in identity management system

## Revocation Plan

- **Trigger for revocation:** Role change / Departure / Project completion / Expiry
- **Revocation process:**

## Audit Trail

| Date | Action | Performed By |
| --- | --- | --- |
| {date_created} | Request submitted | {requester_name} |
| | | |
