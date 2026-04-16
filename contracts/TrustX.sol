// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPriceOracle {
    function getPrice() external view returns (uint256);
}

interface IMockToken is IERC20 {
    function faucetMint(address to, uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

event Deposited(address indexed user, uint256 amount);
event Borrowed(address indexed user, uint256 amount);
event Repaid(address indexed user, uint256 amount);
event Withdrawn(address indexed user, uint256 amount);
event Liquidated(address indexed liquidator, address indexed borrower, uint256 repayAmount, uint256 collateralSeized);

contract TrustX is ReentrancyGuard {
    // IERC20 public immutable token;
    IMockToken public immutable token;
    IPriceOracle public immutable oracle;

    // 1e18 precision.
    uint256 public constant PRECISION = 1e18;
    // uint256 public constant LIQUIDATION_THRESHOLD = 150e16; // 1.5 = 150%
    uint256 public immutable LIQUIDATION_THRESHOLD;
    uint256 public constant LIQUIDATION_BONUS = 110e16; // liquidator gets 110% collateral value
    uint256 public constant SAFE_NO_DEBT_HF = 1000e18;

    mapping(address => uint256) public collateralBalance; // ETH, 18 decimals
    mapping(address => uint256) public borrowBalance; // Token, 18 decimals

    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(
        address indexed liquidator,
        address indexed borrower,
        uint256 repaidAmount,
        uint256 collateralSeized
    );

    constructor(address tokenAddress, address oracleAddress, uint256 Threshold) {
        require(tokenAddress != address(0), "Invalid token address");
        require(oracleAddress != address(0), "Invalid oracle address");
        // token = IERC20(tokenAddress);
        token = IMockToken(tokenAddress);
        oracle = IPriceOracle(oracleAddress);
        LIQUIDATION_THRESHOLD = Threshold;
    }

    function deposit() external payable {
        require(msg.value > 0, "Deposit must be > 0");
        collateralBalance[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(collateralBalance[msg.sender] >= amount, "Insufficient collateral");

        collateralBalance[msg.sender] -= amount;
        require(_isHealthy(msg.sender), "Withdrawal would make account unsafe");

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    function borrow(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        borrowBalance[msg.sender] += amount;
        require(_isHealthy(msg.sender), "Insufficient collateral");

        // Mock token has faucetMint for demo/testing.
        //    (bool success, bytes memory data) = address(token).call(
        //        abi.encodeWithSignature("faucetMint(address,uint256)", msg.sender, amount)
        //    );
        //    require(success, _getRevertMsg(data));

        token.faucetMint(msg.sender, amount);

        emit Borrowed(msg.sender, amount);
    }

    function repay(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(borrowBalance[msg.sender] >= amount, "Repay exceeds debt");

        bool ok = token.transferFrom(msg.sender, address(this), amount);
        require(ok, "Token transfer failed");

        borrowBalance[msg.sender] -= amount;

        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSignature("burn(uint256)", amount)
        );
        require(success, _getRevertMsg(data));

        emit Repaid(msg.sender, amount);
    }

    function liquidate(address borrower, uint256 repayAmount) external nonReentrant {
        require(borrower != address(0), "Invalid borrower");
        require(repayAmount > 0, "Repay amount must be > 0");
        require(!_isHealthy(borrower), "Borrower is healthy");

        require(borrowBalance[borrower] >= repayAmount, "Repay exceeds borrower debt");

        bool ok = token.transferFrom(msg.sender, address(this), repayAmount);
        require(ok, "Token transfer failed");

        uint256 collateralToSeize = _tokenAmountToEthWithBonus(repayAmount);
        require(collateralBalance[borrower] >= collateralToSeize, "Not enough collateral to seize");

        borrowBalance[borrower] -= repayAmount;
        collateralBalance[borrower] -= collateralToSeize;

        (bool burnSuccess, bytes memory burnData) = address(token).call(
            abi.encodeWithSignature("burn(uint256)", repayAmount)
        );
        require(burnSuccess, _getRevertMsg(burnData));

        (bool ethSuccess, ) = payable(msg.sender).call{value: collateralToSeize}("");
        require(ethSuccess, "ETH transfer failed");

        emit Liquidated(msg.sender, borrower, repayAmount, collateralToSeize);
    }

    function getCollateralValue(address user) public view returns (uint256) {
        // ETH amount * ETH price / 1e18 = USD value, 18 decimals.
        return (collateralBalance[user] * oracle.getPrice()) / PRECISION;
    }

    function getHealthFactor(address user) public view returns (uint256) {
        uint256 debt = borrowBalance[user];
        if (debt == 0) {
            // return type(uint256).max;
            return SAFE_NO_DEBT_HF;
        }

        uint256 collateralValue = getCollateralValue(user);
        return (collateralValue * PRECISION) / debt;
    }

    // function isLiquidatable(address user) external view returns (bool) {
    //    return !_isHealthy(user);
    //}

    function isLiquidatable(address user) public view returns (bool) {
        return getHealthFactor(user) < LIQUIDATION_THRESHOLD;
    }

    function _isHealthy(address user) internal view returns (bool) {
        uint256 debt = borrowBalance[user];
        if (debt == 0) {
            return true;
        }
        return getHealthFactor(user) >= LIQUIDATION_THRESHOLD;
    }

    function _tokenAmountToEthWithBonus(uint256 tokenAmount) internal view returns (uint256) {
        uint256 ethPrice = oracle.getPrice();
        // tokenAmount is USD-like value with 18 decimals.
        // ETH needed = tokenAmount / ethPrice, then apply liquidation bonus.
        uint256 baseEth = (tokenAmount * PRECISION) / ethPrice;
        return (baseEth * LIQUIDATION_BONUS) / PRECISION;
    }

    function _getRevertMsg(bytes memory returnData) internal pure returns (string memory) {
        if (returnData.length < 68) return "External call failed";
        assembly {
            returnData := add(returnData, 0x04)
        }
        return abi.decode(returnData, (string));
    }
}
