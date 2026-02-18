# Deployment Procedures

**Document Owner:** DevOps Team
**Last Updated:** February 2024
**Version:** 3.0

## Overview

This document outlines the standard procedures for deploying code changes to all environments.

## Deployment Pipeline

```
Code Commit → Build → Test → Security Scan → Deploy to Staging → Deploy to Production
```

### Pipeline Stages

| Stage | Duration | Automated |
|-------|----------|-----------|
| Build | 3-5 min | Yes |
| Unit Tests | 5-8 min | Yes |
| Integration Tests | 10-15 min | Yes |
| Security Scan | 5 min | Yes |
| Staging Deploy | 5 min | Yes |
| Smoke Tests | 3 min | Yes |
| Production Deploy | 10 min | Manual trigger |

## Pre-Deployment Checklist

- [ ] All tests passing in CI
- [ ] Code review approved (2 reviewers minimum)
- [ ] Security scan passed (no critical/high findings)
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Change ticket created and approved
- [ ] Stakeholders notified

## Deployment Windows

| Environment | Window | Approval Required |
|-------------|--------|-------------------|
| Development | Anytime | No |
| QA | Anytime | No |
| Staging | Business hours | No |
| Production | Tue-Thu, 10am-4pm | Yes |

### Emergency Deployments
- Require VP Engineering approval
- Must follow expedited review process
- Post-incident review required within 48 hours

## Deployment Commands

### Standard Deployment
```bash
# Deploy to staging
./deploy.sh staging

# Deploy to production (requires approval)
./deploy.sh production --ticket=CHG-12345
```

### Database Migrations
```bash
# Preview migrations
./migrate.sh preview --env=production

# Run migrations
./migrate.sh run --env=production --ticket=CHG-12345
```

## Rollback Procedures

### Automatic Rollback Triggers
- Error rate > 5% for 2 minutes
- Response time > 2000ms for 5 minutes
- Health check failures on > 25% of instances

### Manual Rollback
```bash
# Rollback to previous version
./rollback.sh production --to-version=v2.3.4

# Rollback database (if needed)
./migrate.sh rollback --env=production --steps=1
```

## Post-Deployment Verification

1. Check application health dashboard
2. Verify key user flows (login, core features)
3. Monitor error rates for 30 minutes
4. Confirm metrics are within normal ranges
5. Update deployment ticket with results

## Contacts

| Role | Name | Contact |
|------|------|---------|
| On-call Engineer | Rotating | #ops-oncall |
| DevOps Lead | Mike Torres | @mike.torres |
| Engineering Manager | Sarah Chen | @sarah.chen |

## Related Documents

- [System Architecture Overview](./system-architecture-overview.md)
- [Incident Response Plan](./incident-response-plan.md)
- [Change Management Policy](./change-management-policy.md)
