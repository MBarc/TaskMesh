# IT Asset Management Policy

## Purpose

This policy establishes standards for tracking, managing, and disposing of all IT assets throughout their lifecycle to ensure compliance, cost control, and security.

## Scope

This policy applies to all hardware and software assets owned or leased by the organization, including:

- Laptops, desktops, and workstations
- Servers (physical and virtual)
- Networking equipment (switches, routers, firewalls, APs)
- Mobile devices (company-issued phones and tablets)
- Peripherals (monitors, docking stations, printers)
- Software licenses

## Asset Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Request  │───>│ Procure  │───>│ Deploy   │───>│ Maintain  │───>│ Retire   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │               │
  ServiceNow      Approved        Intune/SCCM     Patching &      Secure
  Request         Vendors         Enrollment      Warranty         Wipe &
                                                                  Recycle
```

## Asset Tagging

Every physical asset must be tagged with a unique identifier upon receipt:

- **Format:** `ASSET-[TYPE]-[YEAR]-[SEQUENCE]`
- **Examples:**
  - `ASSET-LT-2025-0042` (Laptop)
  - `ASSET-SV-2024-0108` (Server)
  - `ASSET-MN-2025-0215` (Monitor)

Tags are recorded in the **ServiceNow CMDB** along with:

- Serial number
- Make and model
- Assigned user
- Purchase date and cost
- Warranty expiration
- Location

## Procurement Standards

### Approved Hardware Vendors

| Category | Vendor | Standard Model |
|----------|--------|----------------|
| Laptops | Dell | Latitude 5540 / 7440 |
| Laptops | Apple | MacBook Pro 14" M3 |
| Desktops | Dell | OptiPlex 7010 |
| Monitors | Dell | U2723QE (27" 4K) |
| Servers | Dell | PowerEdge R760 |
| Networking | Cisco | Catalyst 9000 series |

### Purchasing Process

1. Employee submits a request via the **IT Self-Service Portal**
2. Manager approves the request
3. IT Procurement verifies budget and selects the vendor
4. Asset is ordered, received, tagged, and entered into the CMDB
5. Asset is configured and deployed to the end user

## Software License Management

- All software purchases must go through IT Procurement
- License compliance is audited **quarterly** using **Flexera**
- Unused licenses are reclaimed after **60 days** of inactivity
- *Shadow IT* purchases are prohibited — all SaaS subscriptions must be approved

### License Types

| Type | Description | Example |
|------|-------------|---------|
| Per-user | Tied to an individual | Microsoft 365 E3 |
| Per-device | Tied to a specific machine | Windows Server CAL |
| Concurrent | Limited simultaneous users | AutoCAD Network License |
| Site license | Unlimited use at a location | Campus-wide antivirus |

## Asset Disposal

When an asset reaches end-of-life:

1. **Data sanitization:** All storage media wiped using DoD 5220.22-M standard (3-pass)
2. **Certificate of destruction:** Obtained from certified e-waste vendor
3. **CMDB update:** Asset status changed to "Retired"
4. **Physical disposal:** Through certified R2/e-Stewards recycling partner

> **Warning:** Assets containing sensitive data (servers, executive laptops) must have their drives **physically destroyed** and documented.

## Reporting

| Report | Frequency | Audience |
|--------|-----------|----------|
| Asset inventory summary | Monthly | IT Director |
| License compliance | Quarterly | CIO, Compliance |
| Warranty expiration forecast | Monthly | IT Procurement |
| Disposal log | Per event | Security, Compliance |

## Policy Violations

Failure to comply with this policy may result in:

- Revocation of IT privileges
- Disciplinary action per the employee handbook
- Financial liability for unauthorized purchases
