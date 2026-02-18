# Active Directory & Group Policy Reference

## Overview

This document outlines the Active Directory (AD) structure and key Group Policy Objects (GPOs) enforced across the organization.

## Domain Structure

```
example.com (Forest Root)
├── corp.example.com
│   ├── OU=Employees
│   │   ├── OU=Engineering
│   │   ├── OU=Marketing
│   │   ├── OU=Finance
│   │   └── OU=HR
│   ├── OU=Service Accounts
│   ├── OU=Servers
│   │   ├── OU=Production
│   │   └── OU=Development
│   └── OU=Workstations
│       ├── OU=Desktops
│       └── OU=Laptops
└── dmz.example.com (Child Domain)
```

## Domain Controllers

| Hostname | Role | Location | OS |
|----------|------|----------|-----|
| `DC01` | PDC Emulator, DNS | HQ Data Center | Windows Server 2022 |
| `DC02` | Backup DC, DNS | HQ Data Center | Windows Server 2022 |
| `DC03` | RODC | Branch Office | Windows Server 2022 |

## Key Group Policy Objects

### Password Policy (Default Domain Policy)

- Minimum length: **14 characters**
- Complexity: Enabled (uppercase, lowercase, number, special)
- Maximum age: **90 days**
- History: Last **12 passwords** remembered
- Lockout threshold: **5 failed attempts**
- Lockout duration: **30 minutes**

### Workstation Security GPO

Applied to `OU=Workstations`:

- BitLocker encryption enforced on all drives
- Windows Firewall enabled (domain profile)
- USB storage devices: **read-only** (write blocked)
- Screen lock timeout: **5 minutes** of inactivity
- Local admin account: **disabled**

### Software Restriction GPO

Applied to `OU=Employees`:

- AppLocker rules enforce allow-listing for executables
- Only signed applications from trusted publishers can run
- PowerShell: Constrained Language Mode for non-admin users
- Script execution policy: `AllSigned`

### Server Hardening GPO

Applied to `OU=Servers`:

- Audit policy: Log all logon events, privilege use, and object access
- Remote Desktop: Restricted to `Server-Admins` security group
- Windows Update: WSUS-managed, auto-install during maintenance windows
- SMBv1: **Disabled**

## Security Groups

| Group Name | Purpose | Members |
|------------|---------|---------|
| `SG-VPN-Users` | VPN access | All remote-eligible employees |
| `SG-Server-Admins` | RDP and admin access to servers | Infrastructure team |
| `SG-Developers` | Access to dev environments and repos | Engineering OU members |
| `SG-Finance-App` | Access to financial applications | Finance OU members |
| `SG-DLP-Exempt` | Exempted from DLP USB restrictions | Approved by CISO only |

## Common Tasks

### Unlock a user account

```powershell
Unlock-ADAccount -Identity jsmith
```

### Reset a user password

```powershell
Set-ADAccountPassword -Identity jsmith -Reset -NewPassword (ConvertTo-SecureString "TempP@ss2025!" -AsPlainText -Force)
Set-ADUser -Identity jsmith -ChangePasswordAtLogon $true
```

### Add a user to a security group

```powershell
Add-ADGroupMember -Identity "SG-VPN-Users" -Members jsmith
```

### Find disabled accounts older than 90 days

```powershell
Search-ADAccount -AccountDisabled -UsersOnly |
  Where-Object { $_.LastLogonDate -lt (Get-Date).AddDays(-90) } |
  Select-Object Name, LastLogonDate
```
