# Technical Onboarding Guide

**Document Owner:** IT Support
**Last Updated:** February 2024
**Version:** 1.8

## Welcome to the Team!

This guide will help you set up your development environment and get access to the systems you need.

## Day 1 Essentials

### Hardware
Your equipment should include:
- [ ] Laptop (MacBook Pro or Dell XPS)
- [ ] Monitor (optional, request if needed)
- [ ] Keyboard and mouse (optional)
- [ ] Headset for video calls

### Account Setup

| System | How to Access | Setup Time |
|--------|---------------|------------|
| Email (Google) | Check welcome email | Immediate |
| Slack | Accept invitation | Immediate |
| SSO (Okta) | Use email credentials | Immediate |
| GitHub | Accept org invitation | 1-2 hours |
| AWS | Request via IT ticket | 1 day |
| Jira | Auto-provisioned via SSO | Immediate |

## Development Environment

### Required Software

```bash
# macOS (via Homebrew)
brew install git node python3 docker postgresql redis

# Windows (via Chocolatey)
choco install git nodejs python docker-desktop postgresql redis
```

### Recommended Tools

| Tool | Purpose | Download |
|------|---------|----------|
| VS Code | Code editor | code.visualstudio.com |
| Postman | API testing | postman.com |
| TablePlus | Database GUI | tableplus.com |
| Slack | Communication | slack.com |
| Zoom | Video meetings | zoom.us |

### Repository Setup

```bash
# Clone main repositories
git clone git@github.com:company/main-app.git
git clone git@github.com:company/api-service.git
git clone git@github.com:company/infrastructure.git

# Install dependencies
cd main-app && npm install
cd ../api-service && npm install

# Copy environment files
cp .env.example .env

# Start development servers
npm run dev
```

## Access Requests

### Standard Access (Auto-provisioned)
- Email and calendar
- Slack (general channels)
- Jira and Confluence
- GitHub (read access)

### Request Required

| Access | How to Request | Approval |
|--------|----------------|----------|
| GitHub write access | IT ticket | Manager |
| AWS console | IT ticket | Tech lead |
| Production access | IT ticket | VP Engineering |
| VPN | IT ticket | Auto-approved |
| Customer data | IT ticket + training | Security team |

## VPN Setup

1. Download GlobalProtect client
2. Connect to: vpn.company.com
3. Use your SSO credentials
4. Enable MFA when prompted

## Security Requirements

### Before accessing any systems:
- [ ] Complete security awareness training
- [ ] Set up MFA on all accounts
- [ ] Install endpoint protection (auto-pushed)
- [ ] Review and sign security policy

### Password Manager
- Use 1Password (company license)
- Never store passwords elsewhere
- Enable biometric unlock

## Getting Help

### IT Support
- **Slack:** #it-help
- **Email:** it-support@company.com
- **Urgent:** PagerDuty (ask manager)

### Common Issues

| Issue | Solution |
|-------|----------|
| Can't access GitHub | Check org invitation email |
| SSO not working | Clear browser cache, try incognito |
| VPN won't connect | Restart GlobalProtect, check MFA |
| Docker issues | Restart Docker Desktop |

## First Week Checklist

### Day 1
- [ ] Laptop setup complete
- [ ] Email and Slack working
- [ ] Met with manager
- [ ] Security training scheduled

### Day 2-3
- [ ] Development environment setup
- [ ] Repository access confirmed
- [ ] VPN working
- [ ] Met with buddy/mentor

### Day 4-5
- [ ] First PR submitted
- [ ] Attended team standup
- [ ] Reviewed architecture docs
- [ ] Completed security training

## Questions?

Reach out to your onboarding buddy or post in #new-hires on Slack!
