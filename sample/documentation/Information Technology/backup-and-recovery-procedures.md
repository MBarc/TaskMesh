# Backup & Recovery Procedures

## Purpose

This document defines the backup strategy, schedules, and recovery procedures for all critical IT systems.

## Backup Strategy

We follow the **3-2-1 rule**:

- **3** copies of all data
- **2** different storage media
- **1** offsite or cloud copy

## Backup Schedule

### Production Servers

| System | Type | Frequency | Retention | Tool |
|--------|------|-----------|-----------|------|
| SQL Databases | Full | Sunday 1:00 AM | 30 days | Veeam Backup |
| SQL Databases | Differential | Daily 1:00 AM | 7 days | Veeam Backup |
| SQL Databases | Transaction Log | Every 15 min | 48 hours | Veeam Backup |
| File Servers | Full | Saturday 11:00 PM | 60 days | Veeam Backup |
| File Servers | Incremental | Daily 11:00 PM | 14 days | Veeam Backup |
| VM Snapshots | Snapshot | Daily 3:00 AM | 7 days | VMware vSphere |
| Active Directory | System State | Daily 2:00 AM | 30 days | Windows Server Backup |

### Cloud Workloads

| System | Type | Frequency | Retention | Tool |
|--------|------|-----------|-----------|------|
| Azure VMs | Snapshot | Daily | 30 days | Azure Backup |
| AWS RDS | Automated Snapshot | Daily | 35 days | AWS Backup |
| Microsoft 365 | Full | 3x Daily | 1 year | Veeam for M365 |
| SharePoint Online | Full | Daily | 1 year | Veeam for M365 |

## Storage Locations

1. **Primary:** NetApp FAS2750 (on-premises SAN)
2. **Secondary:** Synology RS3621xs+ (on-premises NAS in separate fire zone)
3. **Offsite:** Azure Blob Storage (Cool tier, geo-redundant)

## Recovery Time Objectives

| System | RTO | RPO |
|--------|-----|-----|
| Email (M365) | 1 hour | 8 hours |
| ERP Application | 2 hours | 15 minutes |
| File Servers | 4 hours | 24 hours |
| Development Environments | 8 hours | 24 hours |
| Archived Data | 24 hours | 7 days |

> **RTO** = Recovery Time Objective (max downtime)
> **RPO** = Recovery Point Objective (max data loss)

## Recovery Procedures

### Restore a SQL Database

```sql
-- Step 1: Identify the backup file
RESTORE HEADERONLY FROM DISK = 'D:\Backups\AppDB_Full_20250120.bak'

-- Step 2: Restore with NORECOVERY for applying differentials
RESTORE DATABASE AppDB FROM DISK = 'D:\Backups\AppDB_Full_20250120.bak'
WITH NORECOVERY, REPLACE

-- Step 3: Apply differential
RESTORE DATABASE AppDB FROM DISK = 'D:\Backups\AppDB_Diff_20250121.bak'
WITH RECOVERY
```

### Restore a VM from Veeam

1. Open the **Veeam Backup & Replication** console
2. Navigate to **Home > Backups > Disk**
3. Right-click the VM and select **Restore entire VM**
4. Choose the restore point and target location
5. Select **Quick Rollback** if restoring to the original location

### Restore Microsoft 365 Mailbox

1. Open **Veeam Backup for Microsoft 365** console
2. Select **Explore > Exchange Online**
3. Browse to the user's mailbox and locate the items
4. Right-click and choose **Restore to original location** or **Export to PST**

## Backup Verification

- **Weekly:** Automated restore tests via Veeam SureBackup
- **Monthly:** Manual restore drill for one randomly selected critical system
- **Quarterly:** Full DR simulation documented and reviewed by IT leadership

## Responsibilities

- **Backup Administrator:** Monitors daily backup jobs, resolves failures
- **System Owners:** Define RPO/RTO requirements for their systems
- **IT Director:** Approves changes to the backup strategy and DR plan
