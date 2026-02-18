# Zoom Meeting Transcript

**Meeting ID:** 847 2956 3821
**Topic:** API Architecture Review
**Date:** January 18, 2024
**Duration:** 47 minutes
**Host:** Sarah Chen
**Participants:** Mike Torres, Jennifer Walsh, David Kim, Alex Patel

---

## Transcript

**00:00:05 Sarah Chen:** Alright, I think everyone's here. Let me just start the recording. Okay, we're recording now. Thanks everyone for joining. Today we're going to review the proposed API architecture changes for the v3 release.

**00:00:23 Sarah Chen:** Mike, do you want to share your screen and walk us through the design doc?

**00:00:28 Mike Torres:** Yeah, sure. Let me just... okay, can everyone see my screen?

**00:00:35 Jennifer Walsh:** Yep, looks good.

**00:00:37 David Kim:** I can see it.

**00:00:40 Mike Torres:** Great. So as you can see, the main change we're proposing is moving from a monolithic API gateway to a microservices mesh architecture. The primary driver here is scalability. We're hitting limits on the current system.

**00:01:02 Sarah Chen:** Can you quantify those limits for us? What are we seeing in production?

**00:01:08 Mike Torres:** Sure. So currently at peak load we're seeing about 15,000 requests per second, and we're maxing out at around 18,000 before we start seeing degradation. The new architecture should give us headroom up to about 100,000 requests per second.

**00:01:28 Alex Patel:** That's a significant improvement. What's the migration path look like? I'm worried about downtime.

**00:01:35 Mike Torres:** Good question. We've designed this to be a zero-downtime migration. We'll run both systems in parallel for about two weeks. Traffic will be gradually shifted using feature flags.

**00:01:50 David Kim:** From a security perspective, I want to make sure we're not introducing any new attack vectors. With microservices, we have more surface area.

**00:02:02 Mike Torres:** Absolutely. So if you look at slide seven here, we've implemented mutual TLS between all services. Every service-to-service call is authenticated and encrypted.

**00:02:18 David Kim:** What about rate limiting at the service level?

**00:02:22 Mike Torres:** Yes, each service has its own rate limiting, and we have a global rate limiter at the ingress point. So we have defense in depth.

**00:02:35 Jennifer Walsh:** I have a question about observability. How are we going to trace requests across all these services?

**00:02:43 Mike Torres:** Great question, Jen. We're implementing distributed tracing using OpenTelemetry. Every request gets a trace ID at ingress, and that propagates through all service calls.

**00:03:00 Jennifer Walsh:** And that integrates with our existing monitoring stack?

**00:03:04 Mike Torres:** Yes, it feeds directly into Datadog. We'll have end-to-end visibility.

**00:03:12 Sarah Chen:** What about the database layer? Are we making any changes there?

**00:03:18 Mike Torres:** For this phase, we're keeping the database architecture the same. That's a separate initiative. But the new API layer is designed to work with either the current shared database or a future database-per-service model.

**00:03:38 Alex Patel:** What's the timeline you're thinking for this rollout?

**00:03:43 Mike Torres:** We're looking at starting the parallel run in mid-February, with full cutover by end of March. That gives us buffer before our busy season in Q2.

**00:04:00 Sarah Chen:** That seems aggressive. Do we have contingency if things go wrong?

**00:04:06 Mike Torres:** Yes. The old system stays fully operational during the parallel run. If we see any issues, we can flip back to 100% old system within minutes. It's literally a config change.

**00:04:22 David Kim:** I'd like to do a security review before we go to production. Can we schedule that?

**00:04:28 Sarah Chen:** Definitely. David, can you work with Mike to find time next week?

**00:04:33 David Kim:** Yeah, I'll send over some times.

**00:04:37 Jennifer Walsh:** One more thing - do we need to update our API documentation? Our external developers will need to know about any changes.

**00:04:47 Mike Torres:** For the most part, the external API contract stays the same. There might be some minor response time improvements, but no breaking changes. We will want to update the docs to reflect new rate limits though.

**00:05:05 Sarah Chen:** Good catch. Jennifer, can you own the docs update?

**00:05:09 Jennifer Walsh:** Sure, I'll coordinate with Mike on that.

**00:05:14 Sarah Chen:** Alright. Any other questions or concerns?

**00:05:20 Alex Patel:** I think we should do a load test in staging before the parallel run. Make sure the new system actually handles the load we think it will.

**00:05:30 Mike Torres:** Agreed. We have load tests scheduled for the first week of February.

**00:05:37 Sarah Chen:** Perfect. Okay, let's wrap up. Action items: David will schedule security review with Mike, Jennifer will handle docs updates, and Mike will proceed with the staging load tests. I'll send out a summary after this call.

**00:05:55 Sarah Chen:** Thanks everyone. I'll stop the recording now.

---

**Zoom Auto-Generated Summary:**
- API architecture moving to microservices mesh
- Zero-downtime migration planned with parallel run
- Security review scheduled before production
- Load testing in February, full cutover by end of March
- Documentation updates needed for new rate limits

**Action Items Detected:**
1. David Kim - Schedule security review with Mike
2. Jennifer Walsh - Update API documentation
3. Mike Torres - Conduct staging load tests
