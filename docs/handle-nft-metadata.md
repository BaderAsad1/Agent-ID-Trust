# Handle NFT Metadata

## Canonical Token URI

For handle NFTs, the canonical `tokenURI` target is:

`https://getagent.id/api/v1/nft/metadata/{handle}`

Example:

`https://getagent.id/api/v1/nft/metadata/launchsmoke20260403`

## Product Model

- The NFT represents the handle itself.
- The metadata is handle-centric, not agent-centric.
- A handle NFT can resolve valid metadata even when no public agent is currently linked.

## Canonical Public Routes

- Metadata JSON: `GET /api/v1/nft/metadata/:handle`
- Handle image SVG: `GET /api/v1/handles/:handle/image.svg`

## Legacy Route

Legacy `agent-card` requests are redirected to the canonical handle NFT metadata route:

- `GET /api/v1/agent-card/:handle` -> `308 /api/v1/nft/metadata/:handle`
