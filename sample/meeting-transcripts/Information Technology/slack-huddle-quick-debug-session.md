# Slack Huddle Transcript

**Channel:** #backend-engineering
**Huddle Started By:** Mike Torres
**Date:** February 12, 2024
**Time:** 3:42 PM - 4:08 PM EST
**Participants:** Mike Torres, Alex Patel, David Kim

---

## Huddle Recording Transcript

*Automatically transcribed by Slack*

---

**Mike Torres** [3:42 PM]
Hey, thanks for jumping on. I'm seeing something weird in production and wanted to get your eyes on it before I escalate.

**Alex Patel** [3:42 PM]
Sure, what's going on?

**Mike Torres** [3:43 PM]
So we're getting intermittent 503 errors on the user service. It's not consistent though - maybe 0.5% of requests. But it's been happening for about an hour now.

**David Kim** [3:43 PM]
Are you seeing anything in the logs?

**Mike Torres** [3:44 PM]
That's the weird part. The application logs look normal. No errors, no exceptions. It's like the requests just... don't make it to the service.

**Alex Patel** [3:44 PM]
Could be the load balancer. Have you checked the ALB metrics?

**Mike Torres** [3:45 PM]
Let me pull that up... okay, I'm looking at the target group health. Hmm, one of the three instances is showing as unhealthy intermittently.

**Alex Patel** [3:45 PM]
Which instance?

**Mike Torres** [3:45 PM]
It's i-0abc123... the one in us-east-1c.

**David Kim** [3:46 PM]
Can you SSH into it?

**Mike Torres** [3:46 PM]
Trying now... yeah I'm in. Let me check the application process. Okay, the service is running. Memory looks okay. CPU is at like 15%.

**Alex Patel** [3:47 PM]
What about disk space? I've seen weird issues when the disk fills up.

**Mike Torres** [3:47 PM]
Good thought. Running df... oh wow, /var/log is at 98%.

**David Kim** [3:48 PM]
There's your problem. The health check probably can't write its response.

**Mike Torres** [3:48 PM]
Let me check what's filling it up. It's... the debug logs. They're huge. One file is 47 gigs.

**Alex Patel** [3:49 PM]
47 gigs? That's insane. What's logging that much?

**Mike Torres** [3:49 PM]
Looks like the tracing library. It's set to debug level in production. That's definitely wrong.

**David Kim** [3:50 PM]
That shouldn't be debug in prod. Was there a recent deploy?

**Mike Torres** [3:50 PM]
Let me check... yeah, there was a deploy this morning. Someone must have left the debug flag on.

**Alex Patel** [3:51 PM]
Can you roll back or just fix the config?

**Mike Torres** [3:51 PM]
I'll fix the config and rotate the logs. That's faster. Give me a sec.

**David Kim** [3:52 PM]
While you do that, we should check the other instances too. If the deploy went to all of them, they might fill up soon.

**Mike Torres** [3:52 PM]
Good call. Alex, can you check the other two instances?

**Alex Patel** [3:53 PM]
On it. Checking i-0def456... disk is at 72%. And i-0ghi789 is at 68%. They're filling up but not critical yet.

**Mike Torres** [3:54 PM]
Okay I've updated the config to set logging to INFO. Restarting the service now.

**David Kim** [3:55 PM]
Make sure to clean up those log files too or the disk will still be full.

**Mike Torres** [3:55 PM]
Yeah, running logrotate now. Okay, disk is down to 23%.

**Alex Patel** [3:56 PM]
Health check passing now?

**Mike Torres** [3:56 PM]
Let me refresh the target group... yes! All three targets are healthy now.

**David Kim** [3:57 PM]
Nice. We should push that config fix to the other instances too before they fill up.

**Mike Torres** [3:57 PM]
Already doing it. And I'm going to add a disk space alert so we catch this earlier next time.

**Alex Patel** [3:58 PM]
Good idea. We should probably also add a pre-deploy check that validates log levels aren't set to debug.

**David Kim** [3:58 PM]
That's a good CI/CD enhancement. Can you create a ticket for that Mike?

**Mike Torres** [3:59 PM]
Yeah, I'll create it after I finish cleaning this up.

**Alex Patel** [4:00 PM]
Should we do a mini postmortem on this?

**Mike Torres** [4:00 PM]
Probably good to document it at least. I'll write up a quick incident report. Root cause was debug logging in production due to deploy config error.

**David Kim** [4:01 PM]
And the person who made the deploy should know about this - not to blame them, but so they understand what happened.

**Mike Torres** [4:01 PM]
It was Jason. I'll loop him in on the incident report. He's pretty new so this is a good learning opportunity.

**Alex Patel** [4:02 PM]
Alright, 503s should be gone now. I'll keep an eye on the dashboard.

**Mike Torres** [4:02 PM]
Thanks for the quick help guys. Would have taken me way longer to figure this out alone.

**David Kim** [4:03 PM]
No problem. That's what huddles are for.

**Alex Patel** [4:03 PM]
Yeah, good catch on the disk space. Glad it was something simple.

**Mike Torres** [4:04 PM]
Alright, I'm going to finish the cleanup and write that incident report. Thanks again!

---

## Huddle Summary

**Issue:** Intermittent 503 errors on user service (0.5% of requests)

**Root Cause:** Debug logging enabled in production causing disk space exhaustion on one instance, which caused health check failures.

**Resolution:**
- Disabled debug logging
- Rotated logs to free disk space
- Applied fix to all instances

**Follow-up Actions:**
- Add disk space monitoring alerts
- Add CI/CD check to prevent debug logging in production deploys
- Write incident report and share with team

**Duration:** 26 minutes to identify and resolve
