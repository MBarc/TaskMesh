# System Architecture Overview

**Document Owner:** IT Architecture Team
**Last Updated:** February 2024
**Version:** 2.1

## Executive Summary

This document provides a high-level overview of our technology infrastructure, including cloud services, on-premise systems, and integration patterns.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CDN Layer                            │
│                    (CloudFront/Akamai)                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                    Load Balancers                           │
│                  (AWS ALB - Multi-AZ)                       │
└─────────────────────────┬───────────────────────────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   Web Tier  │   │   API Tier  │   │  Worker Tier │
│  (ECS/EC2)  │   │  (ECS/EC2)  │   │   (ECS)      │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       └────────────────┬┴─────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │PostgreSQL│  │  Redis   │  │   S3     │  │Elasticsearch│ │
│  │  (RDS)   │  │(Cluster) │  │ Storage  │  │  (OpenSearch)│ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Component Details

### Web Tier
- **Technology:** React SPA, served via CloudFront
- **Instances:** 4 (min) - 12 (max) via auto-scaling
- **Health Checks:** Every 30 seconds

### API Tier
- **Technology:** Node.js with Express
- **Instances:** 6 (min) - 20 (max) via auto-scaling
- **Rate Limiting:** 1000 requests/minute per client

### Database Layer
- **Primary:** PostgreSQL 14 on RDS (Multi-AZ)
- **Read Replicas:** 2 in separate AZs
- **Backup:** Daily snapshots, 30-day retention

### Caching Layer
- **Technology:** Redis Cluster (ElastiCache)
- **Nodes:** 3-node cluster
- **Eviction Policy:** LRU

## Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Production | Live customer traffic | app.company.com |
| Staging | Pre-production testing | staging.company.com |
| Development | Active development | dev.company.com |
| QA | Quality assurance | qa.company.com |

## Security Considerations

- All data encrypted at rest (AES-256)
- TLS 1.3 for data in transit
- VPC isolation with private subnets
- WAF protection on all public endpoints
- Regular penetration testing (quarterly)

## Disaster Recovery

- **RTO:** 4 hours
- **RPO:** 1 hour
- **DR Region:** us-west-2 (primary: us-east-1)
- **Failover:** Automated via Route 53 health checks

## Related Documents

- [Deployment Procedures](./deployment-procedures.md)
- [Security Policies](./security-policies.md)
- [Incident Response Plan](./incident-response-plan.md)
