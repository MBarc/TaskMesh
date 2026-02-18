# CRM Best Practices Guide

**Document Owner:** Sales Operations
**Last Updated:** February 2024
**Version:** 2.3

## Overview

Salesforce is our system of record for all sales activity. Accurate, timely data entry ensures effective forecasting, reporting, and commission calculations.

## Why CRM Hygiene Matters

- **Accurate Forecasting:** Leadership relies on data for planning
- **Commission Accuracy:** Your pay depends on proper attribution
- **Customer Experience:** Next rep needs context
- **Pipeline Visibility:** See what's really in play
- **Performance Tracking:** Measure what matters

## Account Management

### Required Account Fields

| Field | Description | When to Update |
|-------|-------------|----------------|
| Account Name | Legal company name | At creation |
| Industry | Primary business sector | At creation |
| Employee Count | Company size | At creation/annually |
| Annual Revenue | Published or estimated | At creation/annually |
| Website | Company URL | At creation |
| Account Owner | Assigned sales rep | Territory changes |
| Account Tier | Strategic classification | Quarterly |

### Account Best Practices

**Do:**
- Research before creating new accounts
- Check for duplicates first
- Keep information current
- Link related accounts (parent/child)
- Add relevant notes and attachments

**Don't:**
- Create duplicate accounts
- Leave required fields blank
- Use personal abbreviations
- Store sensitive data (SSN, credit cards)

## Contact Management

### Required Contact Fields

| Field | Description | When to Update |
|-------|-------------|----------------|
| First/Last Name | Full legal name | At creation |
| Title | Current job title | At creation/when it changes |
| Email | Business email | At creation |
| Phone | Direct line preferred | At creation |
| Role | Buyer role in deal | When engaged in opportunity |
| LinkedIn | Profile URL | At creation |

### Contact Roles

| Role | Definition | Use When |
|------|------------|----------|
| Decision Maker | Final approval authority | Can sign contract |
| Economic Buyer | Controls budget | Owns the money |
| Champion | Internal advocate | Actively supports us |
| Influencer | Shapes decision | Has opinion that matters |
| User | Will use product | End user perspective |
| Blocker | Opposes or slows deal | Creates obstacles |

## Opportunity Management

### Opportunity Stages

| Stage | Probability | Exit Criteria |
|-------|-------------|---------------|
| Prospecting | 5% | Initial outreach sent |
| Discovery | 15% | Pain/need identified |
| Demo | 30% | Solution presented |
| Proposal | 50% | Proposal delivered |
| Negotiation | 75% | Terms being finalized |
| Closed Won | 100% | Contract signed |
| Closed Lost | 0% | Deal did not close |

### Required Opportunity Fields

| Field | When Required | Notes |
|-------|---------------|-------|
| Opportunity Name | Creation | Format: Company - Product - Date |
| Amount | Discovery+ | Best estimate of deal value |
| Close Date | Discovery+ | Realistic expected close |
| Stage | Always | Update as deal progresses |
| Next Steps | Always | Specific, actionable |
| Primary Contact | Discovery+ | Main point of contact |
| Competitor | If known | Track competitive presence |
| Loss Reason | Closed Lost | Select from picklist |

### Opportunity Naming Convention

Format: `[Company Name] - [Product] - [Quarter/Year]`

Examples:
- Acme Corp - Enterprise - Q1 2024
- TechStart - Professional - Q2 2024

### Stage Movement Rules

**Forward Movement:**
- Move when exit criteria met
- Update amount if changed
- Update close date if changed
- Add relevant notes

**Backward Movement:**
- Allowed with justification
- Document reason in notes
- Manager visibility

**Push Rules:**
- No more than 2 pushes per quarter
- After 2 pushes, requires review
- Close date in past = immediate attention

## Activity Logging

### What to Log

| Activity | Log When | Required Fields |
|----------|----------|-----------------|
| Calls | Every meaningful call | Subject, notes, next steps |
| Emails | Key emails (auto-logged) | Via Outreach/Gmail sync |
| Meetings | All scheduled meetings | Subject, attendees, notes |
| Notes | Important updates | Detailed context |

### Activity Best Practices

**Log Same Day:**
- All meetings and calls
- Important customer communications
- Deal developments

**Quality Notes Include:**
- Who you spoke with
- What was discussed
- Key takeaways
- Agreed next steps
- Any concerns or risks

**Example Good Note:**
```
Met with Sarah (VP Ops) and Tom (IT Director).
Demoed core workflow automation features.
Strong interest in reporting capabilities.
Concerns: integration with legacy ERP.
Next: Send integration case study, schedule technical call.
Timeline: Decision by end of month, 90-day implementation.
```

## Forecasting

### Forecast Categories

| Category | Definition | Criteria |
|----------|------------|----------|
| Commit | Will close this period | 90%+ confident |
| Best Case | Likely to close | 60-89% confident |
| Pipeline | Possible to close | <60% confident |
| Omit | Won't close this period | Exclude from forecast |

### Forecast Updates
- Weekly (by Friday EOD)
- Commit = Promise to leadership
- Accuracy tracked and reported

## Data Quality

### Common Issues

| Issue | Impact | How to Avoid |
|-------|--------|--------------|
| Duplicate records | Confusion, split history | Search before creating |
| Missing fields | Incomplete reporting | Fill required fields |
| Stale data | Wrong decisions | Update regularly |
| Wrong stage | Bad forecast | Update when criteria met |
| Missing activities | No context | Log daily |

### Weekly Hygiene Checklist

- [ ] All opportunities have next steps
- [ ] Close dates are realistic (not past)
- [ ] Amounts are accurate
- [ ] Stages reflect reality
- [ ] Activities logged for active deals
- [ ] Forecast categories updated

## Reports & Dashboards

### Key Reports

| Report | Purpose | Frequency |
|--------|---------|-----------|
| My Open Pipeline | See your deals | Daily |
| Stage Duration | Identify stuck deals | Weekly |
| Activity Report | Track engagement | Weekly |
| Forecast Report | Commit vs. Actual | Weekly |
| Win/Loss Analysis | Learn from outcomes | Monthly |

### Dashboard Access
- Personal dashboards: My Dashboard
- Team dashboards: Sales Team Dashboard
- Leadership: Executive Dashboard

## Getting Help

- **Training:** LMS at learn.company.com
- **Documentation:** wiki.company.com/salesforce
- **Support:** #salesforce-help Slack channel
- **Sales Ops:** salesops@company.com
