# Google Meet Transcript

**Meeting Title:** Incident Postmortem - Database Outage
**Date:** February 2, 2024
**Time:** 2:00 PM - 2:45 PM EST
**Organizer:** Sarah Chen
**Attendees:** Mike Torres, David Kim, Jennifer Walsh, Operations Team

---

## Auto-generated transcript

*Transcript by Google Meet. Some errors may occur.*

**Sarah Chen** (0:00)
Okay everyone, thanks for joining. This is the postmortem for the database incident we had on Tuesday. The goal here is not to assign blame but to understand what happened and prevent it from happening again. Mike, you were on call. Can you walk us through the timeline?

**Mike Torres** (0:18)
Sure. So at 2:47 AM Eastern, we got the first alert. It was a database connection pool exhaustion warning. At that point, the system was still operational but degraded.

**Sarah Chen** (0:32)
Was this the PostgreSQL cluster?

**Mike Torres** (0:35)
Yes, the primary write cluster. So I acknowledged the alert and started investigating. By 2:52, we started seeing actual failures - about 5% of API requests were timing out.

**David Kim** (0:48)
Were you able to identify the cause at that point?

**Mike Torres** (0:52)
Not immediately. My first thought was a traffic spike, but looking at the metrics, traffic was actually normal. It took me about 15 minutes to identify the root cause.

**Sarah Chen** (1:05)
Which was?

**Mike Torres** (1:07)
A long-running query. One of the batch jobs that runs overnight had a query that wasn't using an index. Normally this job processes maybe 10,000 records. But on Tuesday, because of the month-end data load, it was processing 2 million records.

**Jennifer Walsh** (1:28)
That's a big difference. Was this a new job?

**Mike Torres** (1:32)
No, it's been running for about six months. But the data volume was unprecedented. The query was doing a full table scan and holding locks, which caused connection pool exhaustion.

**David Kim** (1:47)
So the index was missing from the beginning?

**Mike Torres** (1:51)
Yeah. It worked fine with small data volumes, so nobody noticed.

**Sarah Chen** (1:57)
Okay, so what was the resolution?

**Mike Torres** (2:00)
At 3:15 AM I killed the long-running query. That immediately freed up connections and the system recovered. Full recovery was at 3:18.

**Sarah Chen** (2:12)
Total customer impact time was about 26 minutes then?

**Mike Torres** (2:16)
Correct. And about 3% of requests failed during that window.

**Jennifer Walsh** (2:23)
Have we added the missing index?

**Mike Torres** (2:26)
Yes, that was done Wednesday morning. I also added a query timeout to that job so even if we hit unexpected data volumes, it won't be able to lock the database like that again.

**Sarah Chen** (2:40)
Good. David, anything from the security side?

**David Kim** (2:44)
Nothing security related to this incident. But I do want to flag that our alerting could be improved. We got the warning alert at 2:47 but by 2:52 we were already seeing failures. That's a pretty short window.

**Sarah Chen** (3:02)
That's a good point. What would you suggest?

**David Kim** (3:06)
We should add earlier warning thresholds. Alert when connection pool is at 70% instead of 90%. That would give us more time to react.

**Mike Torres** (3:18)
I agree with that. I can update the alert thresholds today.

**Sarah Chen** (3:23)
Perfect. Jennifer, any impact on customers we need to communicate?

**Jennifer Walsh** (3:28)
We already sent the incident notification. One enterprise customer reached out, and I've already followed up with them. They're satisfied with our response.

**Sarah Chen** (3:42)
Great. Okay, let me summarize the action items. Mike is going to update alert thresholds to trigger earlier. We also need to do an audit of other batch jobs to make sure we don't have similar issues lurking. Who can own that?

**Jennifer Walsh** (4:00)
I can take that. I'll create a list of all batch jobs and their query patterns.

**Sarah Chen** (4:07)
Thanks Jennifer. And I think we should add a runbook entry for connection pool exhaustion. Mike, can you document the troubleshooting steps?

**Mike Torres** (4:18)
Yeah, I'll have that done by end of day.

**Sarah Chen** (4:22)
Last thing - do we need to change anything about how that batch job handles large data volumes?

**Mike Torres** (4:30)
I was thinking about that. We could chunk it to process in batches of 100,000 records instead of all at once. That would prevent any single query from running too long.

**David Kim** (4:43)
That seems like a good preventive measure.

**Sarah Chen** (4:47)
Agreed. Mike, add that to your list. Okay, I think we have a good plan. Any other questions or concerns?

**Jennifer Walsh** (4:56)
Should we schedule a follow-up to confirm all actions are completed?

**Sarah Chen** (5:01)
Good idea. Let's reconvene next Friday to close this out. I'll send the invite. Thanks everyone.

---

## Google Meet - Meeting Notes (Auto-generated)

**Key Topics Discussed:**
- Database outage on February 1st, 2:47 AM - 3:18 AM
- Root cause: Long-running query without proper indexing
- Customer impact: 3% request failures over 26 minutes

**Action Items:**
- Mike Torres: Update alert thresholds for earlier warning
- Jennifer Walsh: Audit all batch jobs for similar issues
- Mike Torres: Create runbook for connection pool exhaustion
- Mike Torres: Implement chunked processing for batch job

**Follow-up Meeting:** February 9, 2024
