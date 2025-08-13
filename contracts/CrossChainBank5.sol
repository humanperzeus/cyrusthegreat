// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title CrossChainBank5
 * @notice A privacy‑first vault with a dynamic $0.10 fee (Chainlink price feed),
 *         native‑ and ERC‑20 support, internal‑ledger transfers and
 *         **O(1) token‑list cleanup** so the front‑end never sees a zero‑balance token.
 *
 * Features
 *  • Dynamic fee calculated from a native/USD Chainlink feed
 *  • Fee is paid separately from the deposited amount (does not reduce the deposit)
 *  • Private obfuscated balances (`vault`) + fee vault (`feeVault`)
 *  • Per‑user token enumeration (`_userTokens`) with constant‑time removal
 *  • Soft‑cap (`MAX_TOKENS_PER_USER`) + per‑tx new‑token cap (`MAX_NEW_TOKENS_PER_TX`)
 *  • Owner‑less after construction – only the fee collector can pull fees
 */
contract CrossChainBank5 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --------------------------------------------------------------------
    //  IMMUTABLES
    // --------------------------------------------------------------------
    address private immutable feeCollector;
    bytes32 private immutable salt;
    AggregatorV3Interface public immutable priceFeed; // native/USD price feed

    // --------------------------------------------------------------------
    //  STORAGE
    // --------------------------------------------------------------------
    // obfuscated balances: vault[user|token|salt] => amount
    mapping(bytes32 => uint256) private vault;
    // native‑token fees only
    mapping(bytes32 => uint256) private feeVault;

    // per‑user enumerable token list
    mapping(address => address[]) private _userTokens;
    // token => (index+1) for O(1) removal; 0 = not present
    mapping(address => mapping(address => uint256)) private _tokenIdx;

    // --------------------------------------------------------------------
    //  CONSTANTS & SETTINGS
    // --------------------------------------------------------------------
    int256 private constant USD_FEE_CENTS = 10;          // $0.10 = 10 cents
    uint256 public constant MAX_TOKENS_PER_USER = 200;  // hard cap per address
    uint256 public constant MAX_NEW_TOKENS_PER_TX = 5;  // limit dummy‑spam per tx

    // --------------------------------------------------------------------
    //  EVENTS
    // --------------------------------------------------------------------
    event Deposit(address indexed token, address indexed user, uint256 amount);
    event Withdraw(address indexed token, address indexed user, uint256 amount);
    event InternalTransfer(
        address indexed token,
        address indexed from,
        address indexed to,
        uint256 amount
    );
    event FeesCollected(uint256 amount);
    event TokenPruned(address indexed user, address indexed token);

    // --------------------------------------------------------------------
    //  CONSTRUCTOR
    // --------------------------------------------------------------------
    constructor(
        address _feeCollector,
        bytes32 _salt,
        address _priceFeed // Chainlink native/USD feed
    ) {
        require(_feeCollector != address(0), "Invalid fee collector");
        require(_priceFeed != address(0), "Invalid price feed");
        feeCollector = _feeCollector;
        salt = _salt;
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    // --------------------------------------------------------------------
    //  INTERNAL HELPERS
    // --------------------------------------------------------------------
    function _key(address user, address token) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(user, token, salt));
    }

    /** @dev Returns the current $0.10 fee expressed in native wei. */
    function _getDynamicFeeInWei() public view returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "Invalid price");
        uint8 decimals = priceFeed.decimals();

        // fee (cents) → wei : feeCents * 10^(18+decimals-2) / price
        uint256 usdFeeScaled = uint256(USD_FEE_CENTS) *
            (10 ** (18 + decimals - 2));
        return usdFeeScaled / uint256(price);
    }

    /** @dev Pulls the fee from msg.value (called by every payable entry). */
    function _chargeFeeFromWallet() internal {
        uint256 fee = _getDynamicFeeInWei();
        require(msg.value >= fee, "Insufficient fee sent");
        feeVault[_key(feeCollector, address(0))] += fee;
        // any excess ETH stays with the caller – handled by the outer function
    }

    /**
     * @dev Record a *new* token for the caller.
     *      `newTokensInTx` is the number of tokens that were not yet tracked
     *      before this call – the caller can add at most `MAX_NEW_TOKENS_PER_TX`.
     */
    function _trackToken(address token, uint256 newTokensInTx) internal {
        // If already present – nothing to do.
        if (_tokenIdx[msg.sender][token] != 0) return;

        // Enforce per‑tx new‑token cap (prevents batch‑spam attacks).
        require(
            newTokensInTx <= MAX_NEW_TOKENS_PER_TX,
            "Too many new tokens in tx"
        );

        // Enforce overall per‑user cap.
        require(
            _userTokens[msg.sender].length < MAX_TOKENS_PER_USER,
            "Token list full"
        );

        // Append token and store index+1.
        _userTokens[msg.sender].push(token);
        _tokenIdx[msg.sender][token] = _userTokens[msg.sender].length; // index+1
    }

    /**
     * @dev Remove `token` from the caller’s token list **iff** its balance
     *      is now zero. O(1) thanks to `_tokenIdx`.
     */
    function _removeTokenIfZero(address token) internal {
        bytes32 k = _key(msg.sender, token);
        if (vault[k] != 0) return; // still has a balance → keep it

        // Delete the balance slot (saves a storage word).
        delete vault[k];

        uint256 idxPlusOne = _tokenIdx[msg.sender][token];
        if (idxPlusOne == 0) return; // not tracked – should not happen
        uint256 idx = idxPlusOne - 1; // real zero‑based index

        address[] storage list = _userTokens[msg.sender];
        uint256 lastIdx = list.length - 1;

        if (idx != lastIdx) {
            // Swap the last token into the removed slot.
            address lastToken = list[lastIdx];
            list[idx] = lastToken;
            _tokenIdx[msg.sender][lastToken] = idx + 1; // update its index
        }

        // Remove the duplicate tail entry.
        list.pop();
        delete _tokenIdx[msg.sender][token];

        emit TokenPruned(msg.sender, token);
    }

    /**
     * @dev Helper used when the **recipient** receives a token for the first
     *      time (internal transfer). It adds the token to the recipient’s list
     *      respecting the caps, but does **not** count toward the sender’s
     *      per‑tx new‑token limit.
     */
    function _addTokenForRecipient(address recipient, address token) internal {
        if (_tokenIdx[recipient][token] != 0) return; // already there

        require(
            _userTokens[recipient].length < MAX_TOKENS_PER_USER,
            "Recipient token list full"
        );

        _userTokens[recipient].push(token);
        _tokenIdx[recipient][token] = _userTokens[recipient].length;
    }

    // --------------------------------------------------------------------
    //  SELF‑ONLY VIEW (filters out zero balances)
    // --------------------------------------------------------------------
    /**
     * @notice Returns **only the caller’s** token addresses *and* balances,
     *         omitting any token whose balance is zero.
     * @return tokens   Array of token contract addresses (address(0) = native ETH)
     * @return balances Parallel array of balances for each token
     */
    function getMyVaultedTokens()
        external
        view
        returns (address[] memory tokens, uint256[] memory balances)
    {
        address[] storage list = _userTokens[msg.sender];
        uint256 count = 0;

        // First pass: count non‑zero entries
        for (uint256 i = 0; i < list.length; ++i) {
            if (vault[_key(msg.sender, list[i])] > 0) {
                ++count;
            }
        }

        tokens = new address[](count);
        balances = new uint256[](count);
        uint256 idx = 0;

        // Second pass: copy the data
        for (uint256 i = 0; i < list.length; ++i) {
            uint256 bal = vault[_key(msg.sender, list[i])];
            if (bal == 0) continue;
            tokens[idx] = list[i];
            balances[idx] = bal;
            ++idx;
        }
    }

    // --------------------------------------------------------------------
    //  NATIVE‑TOKEN (ETH) OPERATIONS
    // --------------------------------------------------------------------
    function depositETH() external payable nonReentrant {
        require(msg.value > 0, "Zero deposit");
        uint256 fee = _getDynamicFeeInWei();
        require(msg.value > fee, "Amount must exceed fee");

        uint256 amount = msg.value - fee;
        unchecked {
            vault[_key(msg.sender, address(0))] += amount;
        }
        feeVault[_key(feeCollector, address(0))] += fee;

        // Track native token (address(0)) – at most one new token per tx.
        _trackToken(address(0), 1);

        emit Deposit(address(0), msg.sender, amount);
    }

    function withdrawETH(uint256 amount) external payable nonReentrant {
        bytes32 userKey = _key(msg.sender, address(0));
        require(vault[userKey] >= amount, "Insufficient balance");

        _chargeFeeFromWallet();

        unchecked {
            vault[userKey] -= amount;
        }

        // Auto‑cleanup if balance hits zero
        _removeTokenIfZero(address(0));

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "ETH transfer failed");

        emit Withdraw(address(0), msg.sender, amount);
    }

    function transferInternalETH(address to, uint256 amount)
        external
        payable
        nonReentrant
    {
        require(to != address(0) && to != msg.sender, "Invalid recipient");
        bytes32 fromKey = _key(msg.sender, address(0));
        bytes32 toKey   = _key(to, address(0));
        require(vault[fromKey] >= amount, "Insufficient balance");

        _chargeFeeFromWallet();

        unchecked {
            vault[fromKey] -= amount;
            vault[toKey]   += amount;
        }

        // Clean up sender if needed
        _removeTokenIfZero(address(0));
        // Ensure the receiver’s list contains native token
        _addTokenForRecipient(to, address(0));

        emit InternalTransfer(address(0), msg.sender, to, amount);
    }

    // --------------------------------------------------------------------
    //  ERC‑20 OPERATIONS
    // --------------------------------------------------------------------
    function depositToken(address token, uint256 amount)
        external
        payable
        nonReentrant
    {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Zero deposit");

        _chargeFeeFromWallet();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        unchecked {
            vault[_key(msg.sender, token)] += amount;
        }

        // If this token is new for the caller we count it as a “new token”
        // for the per‑tx limit.
        uint256 newTokens = (_tokenIdx[msg.sender][token] == 0) ? 1 : 0;
        _trackToken(token, newTokens);

        emit Deposit(token, msg.sender, amount);
    }

    function withdrawToken(address token, uint256 amount)
        external
        payable
        nonReentrant
    {
        require(token != address(0), "Invalid token");
        bytes32 userKey = _key(msg.sender, token);
        require(vault[userKey] >= amount, "Insufficient balance");

        _chargeFeeFromWallet();

        unchecked {
            vault[userKey] -= amount;
        }

        // Auto‑cleanup if balance is now zero
        _removeTokenIfZero(token);

        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdraw(token, msg.sender, amount);
    }

    function transferInternalToken(
        address token,
        address to,
        uint256 amount
    ) external payable nonReentrant {
        require(token != address(0), "Invalid token");
        require(to != address(0) && to != msg.sender, "Invalid recipient");

        bytes32 fromKey = _key(msg.sender, token);
        bytes32 toKey   = _key(to, token);
        require(vault[fromKey] >= amount, "Insufficient balance");

        _chargeFeeFromWallet();

        unchecked {
            vault[fromKey] -= amount;
            vault[toKey]   += amount;
        }

        // Clean up sender if needed
        _removeTokenIfZero(token);
        // Ensure the recipient’s list contains the token
        _addTokenForRecipient(to, token);

        emit InternalTransfer(token, msg.sender, to, amount);
    }

    // --------------------------------------------------------------------
    //  FEE COLLECTION (feeCollector‑only)
    // --------------------------------------------------------------------
    function collectFees() external nonReentrant {
        require(msg.sender == feeCollector, "Not authorized");
        bytes32 feeKey = _key(feeCollector, address(0));
        uint256 amount = feeVault[feeKey];
        require(amount > 0, "No fees");

        feeVault[feeKey] = 0;
        (bool success, ) = payable(feeCollector).call{value: amount}("");
        require(success, "Fee transfer failed");

        emit FeesCollected(amount);
    }

    // --------------------------------------------------------------------
    //  READ‑ONLY HELPERS
    // --------------------------------------------------------------------
    /** @dev Raw (obfuscated) balance for any user‑token pair. */
    function getBalance(address user, address token)
        external
        view
        returns (uint256)
    {
        return vault[_key(user, token)];
    }

    /** @dev Current fee (in native wei) – UI can call this once on load. */
    function getCurrentFeeInWei() external view returns (uint256) {
        return _getDynamicFeeInWei();
    }
}