# Agent ID Contracts

This directory contains the smart contract definitions and related tooling for the Agent ID protocol's on-chain components (handle minting, registry, etc.).

## Overview

Agent ID uses on-chain contracts on Base (Ethereum L2) to provide verifiable, tamper-evident handle ownership records. Every 3-character and 4-character handle purchase includes an on-chain mint. Standard handles (5+ characters) receive an on-chain record when included with a Starter or Pro plan.

## Structure

```
contracts/
  README.md       — This file
```

## Deployment

Contract deployment and upgrades are managed manually by the Agent ID core team. There is no automated deploy script in this repository.

### Upgrade Process

Schema and contract upgrades are performed as manual operational steps by the Agent ID infrastructure team. There is no `script/upgrade.ts` or equivalent automated upgrade script at this time.

To perform an upgrade:

1. Coordinate with the Agent ID core team (infrastructure@getagent.id)
2. Review the upgrade plan and target contract version
3. Follow the internal runbook for the specific upgrade type (schema migration, contract re-deploy, etc.)

> **Note:** Automated upgrade tooling is planned for a future release. Until then, all upgrades are manual and coordinated directly with the infrastructure team.

## Contact

For questions about contract architecture or upgrade procedures, contact the Agent ID team at infrastructure@getagent.id.
