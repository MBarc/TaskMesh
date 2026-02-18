# Slack Huddle Transcript

**Channel:** #marketing-urgent
**Huddle Started By:** Lisa Chen
**Date:** April 15, 2024
**Time:** 4:22 PM - 4:47 PM EST
**Participants:** Lisa Chen, Sophie Martinez, Tom Bradley, Ryan Park

---

## Huddle Recording Transcript

*Automatically transcribed by Slack*

---

**Lisa Chen** [4:22 PM]
Hey everyone, thanks for jumping on so quickly. We have an issue with the spring campaign landing page. Sophie flagged it to me about an hour ago.

**Sophie Martinez** [4:22 PM]
Yeah, so I was looking at the real-time analytics and noticed the conversion rate tanked starting around 2 PM. It went from about 12% to under 2%.

**Tom Bradley** [4:23 PM]
That's a massive drop. What changed at 2?

**Lisa Chen** [4:23 PM]
That's what we're trying to figure out. I didn't push any changes. Sophie, was there a traffic source change?

**Sophie Martinez** [4:24 PM]
Traffic sources look normal. We're still getting the same mix of paid and organic. It's not a traffic quality issue - it's something on the page itself.

**Ryan Park** [4:24 PM]
Did someone update the copy? I know the product team was asking about some messaging changes.

**Lisa Chen** [4:25 PM]
Let me check the CMS history... oh. Oh no. Someone changed the CTA button.

**Tom Bradley** [4:25 PM]
Changed it how?

**Lisa Chen** [4:26 PM]
The button used to say "Start Free Trial" and now it says "Contact Sales." That completely changes the user expectation.

**Sophie Martinez** [4:26 PM]
That would explain it. People expecting a self-serve trial are going to bounce if they think they have to talk to sales.

**Ryan Park** [4:27 PM]
Who made the change?

**Lisa Chen** [4:27 PM]
Looking at the revision history... it was someone on the sales ops team. I think they were trying to route more leads to sales.

**Tom Bradley** [4:28 PM]
Without coordinating with marketing? That's a problem.

**Lisa Chen** [4:28 PM]
Yeah, we need better change management. But first let's fix the immediate issue.

**Sophie Martinez** [4:29 PM]
Can you just revert it?

**Lisa Chen** [4:29 PM]
Yes, doing that now. Okay, button is back to "Start Free Trial."

**Sophie Martinez** [4:30 PM]
I'm watching the dashboard... give it a few minutes for new sessions to come through.

**Ryan Park** [4:30 PM]
While we wait, we should figure out how to prevent this in the future. We can't have random people changing landing pages.

**Tom Bradley** [4:31 PM]
Agreed. Lisa, can we restrict edit access to the marketing team only?

**Lisa Chen** [4:31 PM]
I'll check with IT on the permissions. We might need to create a separate role that can view but not edit.

**Sophie Martinez** [4:32 PM]
Update: seeing conversions starting to come through again. Looking healthier already.

**Lisa Chen** [4:33 PM]
Good. Let's give it another 10 minutes to get a real read.

**Ryan Park** [4:34 PM]
Should we notify anyone about this? Amanda?

**Lisa Chen** [4:34 PM]
Yes, I'll send Amanda a message after this huddle. We should also loop in the sales ops person who made the change - not to blame them, but to explain the impact and set up a proper process for future requests.

**Tom Bradley** [4:35 PM]
Maybe this is a sign we need a formal landing page request process. If sales wants messaging changes, they should submit a request that gets reviewed.

**Ryan Park** [4:36 PM]
Like a creative brief but for page changes?

**Tom Bradley** [4:37 PM]
Exactly. With a reason, expected impact, and approval required before it goes live.

**Lisa Chen** [4:37 PM]
That's a good idea. I can draft something.

**Sophie Martinez** [4:38 PM]
Okay, it's been about 8 minutes since the fix. Conversion rate is back up to 11.5%. Crisis averted.

**Lisa Chen** [4:39 PM]
Thank goodness. How many leads do we think we lost during that window?

**Sophie Martinez** [4:39 PM]
Let me calculate... we had about 1,200 visitors in that 2.5 hour window. At normal 12% conversion, that would be 144 leads. At 2% conversion, we got about 24. So we lost roughly 120 leads.

**Tom Bradley** [4:40 PM]
That's painful. At our current cost per acquisition, that's like $6,000 in wasted ad spend.

**Lisa Chen** [4:41 PM]
I know. Not a good day. But it could have been worse if Sophie hadn't caught it.

**Sophie Martinez** [4:42 PM]
Good thing I was doing my afternoon dashboard check. I'm glad we set up those real-time conversion monitors.

**Ryan Park** [4:42 PM]
Should we add an alert for when conversion drops by more than, say, 50%?

**Sophie Martinez** [4:43 PM]
That's a great idea. I can set that up in our analytics tool. If conversion drops significantly within an hour, we get a Slack notification.

**Lisa Chen** [4:44 PM]
Please do that. That would catch this kind of thing faster next time.

**Tom Bradley** [4:45 PM]
Alright, sounds like we have a plan. Fix is in place, we're recovering, and we have action items to prevent this in the future.

**Lisa Chen** [4:46 PM]
Yes. I'll message Amanda, draft the change request process, and talk to IT about permissions. Sophie will set up the conversion drop alert. And I'll have a friendly conversation with sales ops about coordination.

**Ryan Park** [4:46 PM]
Glad we caught this. Good teamwork everyone.

**Lisa Chen** [4:47 PM]
Thanks for jumping on so quickly. Crisis mode deactivated.

---

## Huddle Summary

**Issue:** Spring campaign landing page conversion rate dropped from 12% to 2% after CTA button was changed from "Start Free Trial" to "Contact Sales" without coordination.

**Impact:** Approximately 120 lost leads over 2.5 hours (~$6,000 wasted ad spend)

**Resolution:**
- Reverted button text to original
- Conversion rate recovered to 11.5% within 10 minutes

**Follow-up Actions:**
- Lisa Chen: Notify Amanda of incident
- Lisa Chen: Draft landing page change request process
- Lisa Chen: Work with IT on CMS permissions
- Lisa Chen: Discuss coordination process with sales ops
- Sophie Martinez: Set up conversion rate drop alerts

**Prevention Measures:**
- Restrict CMS edit access to marketing team
- Implement formal change request process
- Add automated conversion monitoring alerts
