# Network Architecture Overview

## Summary

This document describes the corporate network topology, segmentation strategy, and key infrastructure components across all office locations and cloud environments.

## Network Diagram

```
                    ┌──────────────┐
                    │   Internet   │
                    └──────┬───────┘
                           │
                    ┌──────┴───────┐
                    │  Palo Alto   │
                    │  Firewall    │
                    │  (HA Pair)   │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌───┴───┐ ┌─────┴─────┐
        │   DMZ     │ │ Corp  │ │   Guest   │
        │ 10.1.0/24 │ │10.2/16│ │10.3.0/24  │
        └───────────┘ └───┬───┘ └───────────┘
                          │
            ┌─────────────┼─────────────┐
            │             │             │
      ┌─────┴────┐ ┌─────┴────┐ ┌─────┴────┐
      │ Servers  │ │ Clients  │ │   VoIP   │
      │10.2.1/24 │ │10.2.2/24 │ │10.2.3/24 │
      └──────────┘ └──────────┘ └──────────┘
```

## VLAN Assignments

| VLAN ID | Name | Subnet | Purpose |
|---------|------|--------|---------|
| 10 | DMZ | `10.1.0.0/24` | Public-facing servers |
| 20 | Servers | `10.2.1.0/24` | Internal application servers |
| 30 | Clients | `10.2.2.0/24` | End-user workstations |
| 40 | VoIP | `10.2.3.0/24` | Phone system traffic |
| 50 | Guest | `10.3.0.0/24` | Visitor Wi-Fi (isolated) |
| 99 | Management | `10.99.0.0/24` | Network device management |

## Core Infrastructure

### Firewalls
- **Primary:** Palo Alto PA-5260 (Active)
- **Secondary:** Palo Alto PA-5260 (Passive)
- Threat prevention, URL filtering, and WildFire sandboxing enabled

### Switches
- **Core:** Cisco Catalyst 9500 (x2, stacked)
- **Distribution:** Cisco Catalyst 9300 (x8)
- **Access:** Cisco Catalyst 9200 (x40)

### Wireless
- **Controller:** Cisco 9800-CL (virtual)
- **Access Points:** Cisco Catalyst 9120AXI (x120)
- SSIDs: `CorpSecure` (802.1X), `CorpGuest` (captive portal)

## Cloud Connectivity

- **Azure ExpressRoute** — 1 Gbps dedicated circuit to Azure East US
- **AWS Direct Connect** — 1 Gbps to AWS us-east-1
- **Site-to-site VPN** — Backup tunnels to both cloud providers over public internet

## DNS and DHCP

- Internal DNS: `dc01.corp.example.com` and `dc02.corp.example.com` (Active Directory integrated)
- External DNS: Cloudflare (primary), Route 53 (secondary)
- DHCP: Windows Server DHCP with failover between `dc01` and `dc02`

## Monitoring

All network devices are monitored via:

- **PRTG** — Bandwidth, latency, and uptime
- **Splunk** — Log aggregation and SIEM correlation
- **Cisco DNA Center** — Wireless health and client troubleshooting

## Change Management

All network changes must follow the CAB (Change Advisory Board) process:

1. Submit a change request in ServiceNow
2. Include a rollback plan and impact assessment
3. Obtain approval from the Network team lead and CAB
4. Execute during the approved maintenance window (Saturdays 2am–6am)
