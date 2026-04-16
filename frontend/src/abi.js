export const TRUSTX_ABI = [
  "function deposit() payable",
  "function withdraw(uint256 amount)",
  "function borrow(uint256 amount)",
  "function repay(uint256 amount)",
  "function liquidate(address borrower, uint256 repayAmount)",
  "function collateralBalance(address user) view returns (uint256)",
  "function borrowBalance(address user) view returns (uint256)",
  "function getHealthFactor(address user) view returns (uint256)",
  "function isLiquidatable(address user) view returns (bool)",
  "function oracle() view returns (address)",
  "function token() view returns (address)"
];

export const TOKEN_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function faucetMint(address to, uint256 amount)"
];

export const ORACLE_ABI = [
  "function getPrice() view returns (uint256)",
  "function setPrice(uint256 newPrice)"
];
