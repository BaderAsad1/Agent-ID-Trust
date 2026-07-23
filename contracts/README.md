# Agent ID Contracts

This directory contains deployment metadata for a deferred Agent ID on-chain anchoring integration. It does not contain deployable contract source code.

## Overview

The launch product resolves identities off-chain. No launch plan or handle purchase includes an on-chain mint. The application keeps a disabled-by-default integration path for a future Base deployment; it must not be enabled until audited contract source, deployment automation, verified addresses, and an operational runbook exist.

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

> **On-chain feature requirement:** `contracts/deployment.json` must contain verified proxy and registry addresses before `ONCHAIN_MINTING_ENABLED` can be enabled. Empty mainnet addresses do not block the off-chain launch.

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
