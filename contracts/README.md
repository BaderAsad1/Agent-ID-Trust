# Agent ID Contracts

This directory contains the smart contract definitions and related tooling for the Agent ID protocol's on-chain components (handle minting, registry, etc.).

## Overview

Agent ID uses on-chain contracts on Base (Ethereum L2) to provide verifiable, tamper-evident handle ownership records. Every 3-character and 4-character handle purchase includes an on-chain mint. Standard handles (5+ characters) receive an on-chain record when included with a Starter or Pro plan.

## Contract Architecture

The on-chain system uses an upgradeable proxy pattern with two distinct address types:

| Env Var | Role | Description |
|---|---|---|
| `BASE_AGENTID_REGISTRAR` | **Proxy** address | The callable proxy address for all on-chain write operations (registerHandle, reserveHandles, releaseHandle). This is the address your app should call. |
| `BASE_ERC8004_REGISTRY` | **Registry** address | The underlying ERC-8004 registry/implementation address for metadata reads. Not used for write calls. |

> **Important:** `BASE_AGENTID_REGISTRAR` is the proxy address that all write calls go through. `BASE_ERC8004_REGISTRY` is the registry (implementation or storage) address. Do not use `BASE_ERC8004_REGISTRY` as a callable proxy address for write operations.

The deployment manifest (`deployment.json`) captures the deployed addresses for each network. A valid deployment manifest **must be checked in** before production use. See `deployment.json` for current testnet addresses and the expected structure for mainnet.

## Structure

```
contracts/
  README.md          — This file
  deployment.json    — Deployed contract addresses per network (required for production)
```

## Deployment

Contract deployment and upgrades are managed manually by the Agent ID core team. There is no automated deploy script in this repository.

> **Production requirement:** `contracts/deployment.json` must contain valid proxy and registry addresses for all target networks before deploying to production. The `base-mainnet` section must be filled in by the infrastructure team before going live.

### Upgrade Process

Schema and contract upgrades are performed as manual operational steps by the Agent ID infrastructure team. There is no `script/upgrade.ts` or equivalent automated upgrade script at this time.

To perform an upgrade:

1. Coordinate with the Agent ID core team (infrastructure@getagent.id)
2. Review the upgrade plan and target contract version
3. Follow the internal runbook for the specific upgrade type (schema migration, contract re-deploy, etc.)
4. Update `deployment.json` with the new addresses and commit it before restarting services

> **Note:** Automated upgrade tooling is planned for a future release. Until then, all upgrades are manual and coordinated directly with the infrastructure team.

## Contact

For questions about contract architecture or upgrade procedures, contact the Agent ID team at infrastructure@getagent.id.
