# Office 365 Administration Guide

## Tenant Information

- **Tenant Name:** Example Corp
- **Primary Domain:** `example.com`
- **Tenant ID:** `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- **Admin Portal:** [admin.microsoft.com](https://admin.microsoft.com)

## License Allocation

| License Type | Total | Assigned | Available |
|-------------|-------|----------|-----------|
| Microsoft 365 E3 | 500 | 463 | 37 |
| Microsoft 365 E5 | 50 | 48 | 2 |
| Exchange Online Plan 1 | 100 | 87 | 13 |
| Power BI Pro | 75 | 61 | 14 |
| Visio Plan 2 | 25 | 19 | 6 |

## User Provisioning

### New user creation via PowerShell

```powershell
# Connect to Microsoft Graph
Connect-MgGraph -Scopes "User.ReadWrite.All", "Directory.ReadWrite.All"

# Create new user
$PasswordProfile = @{
    Password = "TempP@ss2025!"
    ForceChangePasswordNextSignIn = $true
}

New-MgUser -DisplayName "Jane Smith" `
    -MailNickname "jsmith" `
    -UserPrincipalName "jsmith@example.com" `
    -PasswordProfile $PasswordProfile `
    -AccountEnabled `
    -UsageLocation "US"

# Assign E3 license
$License = @{
    AddLicenses = @(@{SkuId = "05e9a617-0261-4cee-bb44-138d3ef5d965"})
    RemoveLicenses = @()
}
Set-MgUserLicense -UserId "jsmith@example.com" -BodyParameter $License
```

### Offboarding checklist

When an employee departs:

1. **Convert mailbox** to shared mailbox
2. **Assign delegate access** to the user's manager
3. **Set auto-reply** indicating the employee has left
4. **Remove licenses** after 30 days (shared mailboxes don't require a license)
5. **Disable the account** in Active Directory (syncs via Azure AD Connect)
6. **Transfer OneDrive files** to the manager
7. **Remove from all distribution lists** and Microsoft 365 groups

## Distribution Lists & Groups

| Type | Example | Use Case |
|------|---------|----------|
| Distribution List | `all-engineering@example.com` | Email-only distribution |
| Microsoft 365 Group | `project-alpha@example.com` | Shared mailbox, SharePoint, Teams |
| Security Group | `SG-Finance-App` | Access control, conditional access |
| Dynamic Group | `All-US-Employees` | Auto-populated based on attributes |

## Exchange Online Policies

### Retention Policies

- **Default:** 1 year retention, then archive
- **Legal Hold:** Indefinite retention for users under litigation hold
- **Executive:** 7 year retention for C-suite mailboxes

### Mail Flow Rules

- External emails tagged with `[EXTERNAL]` in subject line
- Emails with SSN patterns (`\d{3}-\d{2}-\d{4}`) are blocked and flagged to DLP team
- Auto-forward to external addresses is **disabled** org-wide

### Anti-Spam Settings

- **Bulk complaint level (BCL):** Threshold set to 6
- **Phishing threshold:** Aggressive
- **Safe attachments:** Enabled with dynamic delivery
- **Safe links:** Enabled for Email and Teams

## SharePoint Online

### Site Collections

- **Intranet:** `https://example.sharepoint.com/sites/intranet`
- **IT Knowledge Base:** `https://example.sharepoint.com/sites/it-kb`
- **HR Policies:** `https://example.sharepoint.com/sites/hr-policies`

### Storage Quotas

- Default site storage: **25 GB**
- Total tenant storage: **25 TB + 10 GB per licensed user**
- OneDrive per-user storage: **1 TB** (E3) / **5 TB** (E5)

## Monitoring & Reporting

- **Service Health:** Check `admin.microsoft.com > Health > Service health` daily
- **Usage Reports:** Review monthly in admin center under **Reports > Usage**
- **Audit Logs:** Unified audit log enabled; retained for **90 days** (E3) or **1 year** (E5)
- **Alerts:** Configured for unusual mail forwarding, mass file deletion, and impossible travel
