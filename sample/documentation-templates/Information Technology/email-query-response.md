---
name: Email Query Response
namingConvention: "{task_name} - Email Query Response"
variables:
  - name: requester_name
    description: Name of the person who sent the email query
  - name: requester_email
    description: Email address of the requester
  - name: query_category
    description: Category of the IT query (Account Access, Software, Hardware, Network, Other)
  - name: response_sla
    description: Target response time SLA (e.g., 4 hours, 1 business day)
---

# Email Query Response: {task_name}

**Date Created:** {date_created}
**Board:** {board_name}
**Requester:** {requester_name} ({requester_email})
**Category:** {query_category}
**Response SLA:** {response_sla}

---

## Original Query Summary

Summarize the email query received from the requester.

## Query Classification

- **Type:** Request / Question / Issue / Feedback
- **Category:** {query_category}
- **Urgency:** Low / Medium / High

## Research & Findings

Document any research performed to address the query.

### Resources Consulted

-
-

### Key Findings

-
-

## Response

### Response Draft

Write the response to be sent back to the requester.

---

Dear {requester_name},

Thank you for reaching out.



Best regards,
IT Support

---

### Response Checklist

- [ ] Query fully addressed
- [ ] Tone is professional and helpful
- [ ] Any attachments or links included
- [ ] Follow-up actions noted (if any)

## Follow-Up Actions

| Action | Owner | Due Date | Status |
| --- | --- | --- | --- |
| | | | |

## Notes

Additional context or internal notes about this query.
