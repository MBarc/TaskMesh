# VPN Setup Guide

## Overview

This guide covers the steps required to configure and connect to the corporate VPN for remote access to internal resources.

## Prerequisites

- Company-issued laptop with Windows 10/11 or macOS 12+
- Active Directory credentials
- Multi-factor authentication (MFA) enrolled on your mobile device

## Installation

1. Download the **GlobalProtect** client from the IT self-service portal at `https://itportal.internal/vpn`
2. Run the installer and follow the on-screen prompts
3. Restart your machine after installation completes

## Configuration

| Setting | Value |
|---------|-------|
| Portal Address | `vpn.corp.example.com` |
| Authentication | SAML / SSO |
| Protocol | IPSec preferred, SSL fallback |
| DNS Suffix | `corp.example.com` |

## Connecting

1. Open the GlobalProtect client from your system tray
2. Enter the portal address listed above
3. Click **Connect** and authenticate with your AD credentials
4. Approve the MFA push notification on your phone
5. Wait for the status to show **Connected**

## Split Tunnel vs Full Tunnel

- **Split Tunnel** — Only traffic destined for corporate subnets (`10.0.0.0/8`, `172.16.0.0/12`) routes through the VPN. Internet traffic goes direct.
- **Full Tunnel** — All traffic routes through the corporate network. Required when accessing restricted compliance environments.

> **Note:** Split tunnel is the default profile. Contact the Network team if you need full tunnel access.

## Troubleshooting

### Cannot connect to portal

- Verify your internet connection is active
- Flush DNS cache: `ipconfig /flushdns` (Windows) or `sudo dscacheutil -flushcache` (macOS)
- Ensure the portal address has no typos

### Frequent disconnections

- Check if your ISP is throttling VPN traffic
- Switch from Wi-Fi to a wired connection
- Try toggling the protocol from IPSec to SSL in the client settings

### MFA prompt not received

- Ensure your authenticator app is up to date
- Verify your device is registered at `https://mfa.corp.example.com`
- Contact the Helpdesk if your MFA token needs to be reset

## Contact

For issues not covered above, open a ticket with the **Network & Infrastructure** team via ServiceNow or email `network-support@example.com`.
