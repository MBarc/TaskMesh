# Email Marketing Guide

**Document Owner:** Email Marketing Team
**Last Updated:** February 2024
**Version:** 2.3

## Overview

This guide covers email marketing best practices, from list management to campaign execution.

## Email Types

### Newsletter
- **Frequency:** Weekly (Tuesday 10am ET)
- **Purpose:** Thought leadership, company updates, content promotion
- **Length:** 3-5 sections, 500-700 words total
- **CTA:** Multiple (one per section)

### Product Updates
- **Frequency:** Monthly or as needed
- **Purpose:** Feature announcements, release notes
- **Length:** Concise, 200-400 words
- **CTA:** Single, clear action

### Nurture Campaigns
- **Frequency:** Automated based on triggers
- **Purpose:** Lead education, conversion
- **Length:** Varies by stage (shorter as urgency increases)
- **CTA:** Single, progressive

### Transactional
- **Frequency:** Triggered by user actions
- **Purpose:** Confirmations, receipts, notifications
- **Length:** As short as possible
- **CTA:** Relevant next step

## List Management

### Segmentation

| Segment | Criteria | Use Case |
|---------|----------|----------|
| Prospects | No product engagement | Awareness content |
| Active trials | In trial period | Conversion campaigns |
| Customers | Paying accounts | Retention, upsell |
| Champions | High NPS, engaged | Referral, advocacy |
| At-risk | Low engagement | Re-engagement |

### Hygiene Practices
- Remove hard bounces immediately
- Soft bounces: Remove after 3 consecutive
- Unengaged (>6 months): Move to re-engagement campaign
- Invalid emails: Clean monthly via verification service
- Unsubscribes: Process within 24 hours

### Permission Standards
- Double opt-in for new subscribers
- Clear unsubscribe in every email
- Preference center for frequency control
- No purchased lists

## Design Standards

### Layout
- Single column preferred (mobile-first)
- Maximum width: 600px
- Minimum font: 14px body, 22px headlines
- Clear visual hierarchy

### Header
- Logo (linked to website)
- Preview text visible
- Navigation optional (max 4 links)

### Body
- Short paragraphs (2-3 sentences)
- Scannable with headers
- Images with alt text
- Buttons: minimum 44x44px tap target

### Footer (Required)
- Physical mailing address
- Unsubscribe link
- Update preferences link
- Social media links
- Copyright notice

## Writing Guidelines

### Subject Lines
- Length: 30-50 characters
- Personalization when relevant
- Action-oriented or curiosity-driven
- Avoid spam triggers (ALL CAPS, excessive punctuation)

**Examples:**
| Good | Why |
|------|-----|
| "Your weekly product tips" | Clear, expected |
| "[Name], your trial ends Friday" | Personalized, urgent |
| "3 features you're not using" | Specific, curious |

| Bad | Why |
|-----|-----|
| "Newsletter #45" | No value proposition |
| "DON'T MISS THIS!!!" | Spammy |
| "Check this out" | Vague |

### Preview Text
- 40-90 characters
- Extends subject, doesn't repeat
- Provides additional context

### Body Copy
- Lead with value, not company
- Use "you" more than "we"
- One idea per paragraph
- Clear, action-oriented CTA

## A/B Testing

### What to Test
| Element | Priority | Sample Size Needed |
|---------|----------|-------------------|
| Subject line | High | 1,000+ per variant |
| Send time | High | 2,000+ per variant |
| CTA button | Medium | 1,000+ per variant |
| Content length | Medium | 2,000+ per variant |
| Design layout | Low | 5,000+ per variant |

### Testing Protocol
1. Test one variable at a time
2. Use statistically significant sample
3. Run test for sufficient duration
4. Document and apply learnings

## Metrics & Benchmarks

### Target Metrics

| Metric | Newsletter | Product | Nurture |
|--------|------------|---------|---------|
| Open rate | >25% | >30% | >35% |
| Click rate | >3% | >5% | >8% |
| Unsubscribe | <0.3% | <0.2% | <0.5% |
| Bounce rate | <2% | <2% | <2% |

### Deliverability
- Monitor sender reputation weekly
- Authenticate with SPF, DKIM, DMARC
- Warm up new sending domains
- Maintain complaint rate <0.1%

## Compliance

### CAN-SPAM Requirements
- Clear sender identification
- Accurate subject lines
- Physical address included
- Working unsubscribe (processed within 10 days)

### GDPR Requirements
- Explicit consent for EU recipients
- Clear privacy policy link
- Data access/deletion capability
- Consent records maintained

## Tools & Access

- **ESP:** HubSpot
- **Design:** Stripo, Figma
- **Testing:** Litmus
- **Analytics:** HubSpot + Google Analytics

## Approval Process

1. Draft created in HubSpot
2. Copy review by content lead
3. Design review by creative
4. Final approval by email manager
5. Test send to team
6. Schedule/send
