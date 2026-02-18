# Helpdesk Ticket Triage Guide

## Purpose

This guide provides Tier 1 helpdesk analysts with a standardized framework for categorizing, prioritizing, and routing incoming support tickets.

## Ticket Priority Matrix

Tickets are prioritized based on **Impact** (how many users affected) and **Urgency** (how time-sensitive the issue is):

|  | **High Urgency** | **Medium Urgency** | **Low Urgency** |
|--|-------------------|--------------------|-----------------|
| **High Impact** (dept/org-wide) | P1 — Critical | P2 — High | P3 — Medium |
| **Medium Impact** (team/group) | P2 — High | P3 — Medium | P4 — Low |
| **Low Impact** (single user) | P3 — Medium | P4 — Low | P4 — Low |

### Response and Resolution SLAs

| Priority | First Response | Resolution Target |
|----------|---------------|-------------------|
| **P1** | 15 minutes | 4 hours |
| **P2** | 30 minutes | 8 hours |
| **P3** | 2 hours | 24 hours |
| **P4** | 4 hours | 72 hours |

## Ticket Categories

### Access & Accounts

- Password resets
- Account lockouts
- New account requests
- Permission changes
- MFA issues

**Common resolution:**

```
Password Reset Steps:
1. Verify user identity (employee ID + manager name)
2. Reset via Active Directory Users & Computers
3. Set "User must change password at next logon"
4. Communicate temporary password via secure channel
```

### Hardware

- Laptop/desktop issues
- Monitor or docking station problems
- Peripheral failures (keyboard, mouse, headset)
- Hardware replacement requests

*Route to: **Tier 2 — Desktop Support** if physical repair needed*

### Software

- Application installation requests
- Software crashes or errors
- License activation issues
- Browser compatibility problems

*Route to: **Tier 2 — Application Support** if not resolvable with reinstall*

### Network & Connectivity

- Wi-Fi connection issues
- VPN connectivity problems
- Slow network performance
- Printer connectivity

*Route to: **Tier 2 — Network Operations** if affecting multiple users*

### Email & Communication

- Outlook configuration
- Calendar sharing issues
- Teams problems
- Distribution list modifications

*Route to: **Tier 2 — Messaging Team** for mail flow issues*

## Triage Decision Tree

```
New Ticket Arrives
    │
    ├─ Is it a P1? ──────> YES ──> Immediately notify Tier 2 lead
    │                              and begin troubleshooting
    │
    ├─ Can Tier 1 resolve? ──> YES ──> Resolve and document
    │
    ├─ Known issue? ──────> YES ──> Link to known error article
    │                              and apply workaround
    │
    └─ None of the above ──> Categorize, set priority,
                              route to appropriate Tier 2 queue
```

## Escalation Paths

| Queue | Team | Lead |
|-------|------|------|
| `DESK-SUPPORT` | Desktop Support | Tom Rivera |
| `NET-OPS` | Network Operations | Sarah Kim |
| `APP-SUPPORT` | Application Support | David Okonkwo |
| `SEC-OPS` | Security Operations | Lisa Patel |
| `MSG-TEAM` | Messaging & Collaboration | Ryan Cho |

## Ticket Documentation Standards

Every ticket **must** include:

1. **Summary** — One-line description of the issue
2. **Affected User(s)** — Name, department, location
3. **Category** — From the list above
4. **Priority** — Using the impact/urgency matrix
5. **Steps Taken** — What troubleshooting was already performed
6. **Screenshots/Logs** — Attach error messages or relevant logs

### Good vs Bad Ticket Examples

**Bad:**
> "User can't log in"

**Good:**
> "User Jane Smith (Finance, 3rd floor) unable to log into Outlook Web Access. Error: 'Your account has been locked.' Verified account is locked in AD. Attempted unlock but issue persists after 3 attempts. Escalating to Tier 2 for investigation of possible account compromise."

## Shift Handoff

At the end of each shift, the outgoing analyst must:

- Update all open tickets with current status
- Flag any P1/P2 tickets that need immediate attention
- Post a summary in the `#helpdesk-handoff` Slack channel
- Brief the incoming analyst on any ongoing incidents

## Quick Reference — Common Tier 1 Fixes

| Issue | Fix |
|-------|-----|
| Account locked | Unlock in ADUC, check for bad cached credentials |
| Forgot password | Reset in ADUC, set forced change at next logon |
| Can't connect to Wi-Fi | Forget network, reconnect, check 802.1X cert |
| Outlook won't open | Run `outlook.exe /resetnavpane` |
| Teams call quality | Check bandwidth, switch to wired, clear Teams cache |
| Printer not found | Run `Add Printer` wizard, check VLAN assignment |
| VPN won't connect | Restart GlobalProtect, flush DNS, check MFA |
| Slow computer | Check Task Manager for high CPU/RAM, restart |
