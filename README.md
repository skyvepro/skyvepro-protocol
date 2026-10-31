# Skyve

Idle capital, put to work on Solana.

[![Live site](https://img.shields.io/badge/live-skyve.pro-46f7a4?style=flat-square)](https://skyve.pro)
![Chain](https://img.shields.io/badge/chain-Solana-24a15d?style=flat-square)

**Contract address:** `pending`

## Overview

Skyve places a deposit into concentrated liquidity on Solana, so trading activity pays the depositor a fee. This repository holds the static marketing site served at skyve.pro.

## Features

- Live Solana market board: ten pairs ranked by 24h volume, with a matching ticker
- Contract address slot at the top of every page, copy on click once the address is stated
- Register of external facts (`src/register.json`); anything not yet stated renders inert
- Animated hero with reduced-motion support
- Zero-dependency build to `dist/`

## Links

- Site: https://skyve.pro
- X: pending
- GitHub: pending
- Whitepaper: [docs/whitepaper.md](docs/whitepaper.md)

## Develop

```bash
npm run build   # writes dist/
npm run gates   # build checks, both register branches
npm run serve   # serves dist/ on http://localhost:4173
```

Deploy by uploading the contents of `dist/`.

## License

MIT
