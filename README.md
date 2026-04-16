# TrustX Code Package

This is a student-friendly prototype of a simplified decentralized collateralized lending DApp.

## Included
- Solidity contracts
- Hardhat config
- Deployment script
- Basic tests
- Crash simulation script
- React frontend

## Backend Setup
```bash
npm install
cp .env.example .env
npm run compile
npm test
```

## Run Locally
Terminal 1:
```bash
npm run node
```

Terminal 2:
```bash
npm run deploy:local
npm run simulate:local
```

## Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## Important Notes
- `MockToken` includes a public faucet mint for demo/testing, so this is **not production-safe**.
- `MockOracle` is manually controlled by the deployer/admin and is used for price crash simulation.
- The liquidation logic is intentionally simplified for undergraduate implementation.
- You may still need to adjust package versions or small UI details in your local environment.
