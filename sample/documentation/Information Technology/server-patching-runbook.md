# Server Patching Runbook

## Scope

This runbook covers the monthly patching process for all Windows and Linux servers in production and development environments.

## Patch Schedule

Patching follows **Microsoft Patch Tuesday** (second Tuesday of each month):

- **Dev/Test servers:** Wednesday after Patch Tuesday (T+1)
- **Non-critical production:** Saturday after Patch Tuesday (T+4)
- **Critical production:** Following Saturday (T+11)

```
Week 1:  [Tue] Patches released → [Wed] Dev/Test patched
Week 1:  [Sat] Non-critical production patched
Week 2:  [Sat] Critical production patched
```

## Pre-Patch Checklist

- [ ] Review Microsoft Security Bulletin and CVE summaries
- [ ] Check vendor advisories for known issues with the patches
- [ ] Verify WSUS/SCCM has downloaded and approved the updates
- [ ] Confirm Veeam backups completed successfully for all target servers
- [ ] Notify application owners via the `#patching` Slack channel
- [ ] Create a ServiceNow change request with the server list and maintenance window

## Patching Process — Windows Servers

### Step 1: Snapshot

```powershell
# Take a VMware snapshot before patching
Get-VM -Name "SERVER01" | New-Snapshot -Name "Pre-Patch $(Get-Date -Format yyyy-MM-dd)" -Description "Monthly patching"
```

### Step 2: Install Updates

```powershell
# Via SCCM Software Center (preferred)
# Or manually via PowerShell:
Install-WindowsUpdate -AcceptAll -AutoReboot
```

### Step 3: Verify

```powershell
# Check for pending reboots
Get-PendingReboot -ComputerName SERVER01

# Verify installed updates
Get-HotFix | Sort-Object InstalledOn -Descending | Select-Object -First 10
```

## Patching Process — Linux Servers

### Step 1: Snapshot

```bash
# Via VMware PowerCLI or vCenter UI
```

### Step 2: Install Updates

**RHEL/CentOS:**
```bash
sudo dnf update --security -y
sudo reboot
```

**Ubuntu:**
```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

### Step 3: Verify

```bash
# Check kernel version
uname -r

# Verify no failed services
systemctl --failed
```

## Post-Patch Validation

After each server is patched, verify the following within **2 hours**:

1. Server is reachable via ping and RDP/SSH
2. Key services are running (check monitoring dashboards in PRTG)
3. Application health checks pass (coordinate with app owners)
4. No new critical errors in Event Viewer or `/var/log/syslog`

## Rollback Procedure

If a patch causes issues:

1. **Revert to snapshot** if within the snapshot retention window (72 hours)
2. If snapshot was already deleted, **uninstall the offending update:**
   - Windows: `wusa /uninstall /kb:5012345 /norestart`
   - Linux: `sudo dnf history undo last -y`
3. Document the issue and report to the vendor

## Emergency / Out-of-Band Patches

For zero-day vulnerabilities or critical CVEs (CVSS 9.0+):

- **Assessment:** Security team evaluates within 4 hours of disclosure
- **Approval:** CISO can authorize emergency patching outside the normal window
- **Execution:** Patch applied within 24-48 hours depending on severity
- **Communication:** Real-time updates in `#security-incidents` Slack channel

## Metrics

| Metric | Target |
|--------|--------|
| Patch compliance (30-day) | > 95% |
| Critical patch SLA (48 hrs) | 100% |
| Rollback rate | < 2% |
| Average patch window duration | < 4 hours |
