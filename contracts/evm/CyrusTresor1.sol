// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title CyrusTresor1
 * @notice Privacy‑first multi‑chain vault with an opt‑in anonymity pool layer.
 *         Per the design spec at docs/cyrustresor1_spec.md, this contract has
 *         two modes side‑by‑side:
 *
 *  1.  REGULAR VAULT — byte‑for‑byte identical to CrossChainBank8 (live since
 *      2026‑05‑09 on Sepolia/BSC Testnet/Base Sepolia, 12/12 functions verified
 *      end‑to‑end on 2026‑05‑13). All Bank8 surface preserved unchanged so
 *      existing UI code keeps working.
 *
 *  2.  ANONYMITY POOL LAYER — added in subsequent commits (Session B+ per the
 *      spec). Will provide: epoch‑batched deposits/withdrawals (1h windows),
 *      denomination buckets (configured per chain via constructor), commit/
 *      reveal mechanics with withdrawTo baked into the commitment hash for
 *      MEV protection, and a reserved zkVerifier slot for v2 ZK extension.
 *
 *         This scaffold commit lands ONLY the regular‑vault surface (= Bank8)
 *         under the new name. The pool layer is intentionally NOT here yet —
 *         it ships incrementally per Rule 1 (one intent per artifact).
 *
 * Bank8 features preserved verbatim:
 *  • Dynamic fee calculated from a native/USD Chainlink feed
 *  • Fee is paid separately from the deposited amount (does not reduce the deposit)
 *  • Private obfuscated balances (`vault`) + fee vault (`feeVault`)
 *  • Per‑user token enumeration (`_userTokens`) with constant‑time removal
 *  • Soft‑cap (`MAX_TOKENS_PER_USER`) + per‑tx new‑token cap (`MAX_NEW_TOKENS_PER_TX`)
 *  • MULTI-TOKEN BATCH OPERATIONS: 1‑25 custom tokens per transaction
 *  • RATE LIMITING: Anti‑spam protection (1000/min) with event emission
 *  • ATOMIC OPERATIONS: All‑or‑nothing multi‑token transactions
 *  • Owner‑less after construction – only the fee collector can pull fees
 */
contract CyrusTresor1 is ReentrancyGuard {
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

    // Simplified rate limiting - just per-minute to save space
    mapping(address => uint256) private _transactionsPerMinute;
    mapping(address => uint256) private _lastTransactionMinute;

    // --------------------------------------------------------------------
    //  CONSTANTS & SETTINGS
    // --------------------------------------------------------------------
    int256 private constant USD_FEE_CENTS = 10;          // $0.10 = 10 cents
    uint256 public constant MAX_TOKENS_PER_USER = 200;  // hard cap per address
    uint256 public constant MAX_NEW_TOKENS_PER_TX = 5;  // limit dummy‑spam per tx

    // Simplified rate limiting constants
    uint256 public constant MAX_TRANSACTIONS_PER_MINUTE = 1000;
    uint256 public constant RATE_LIMIT_WINDOW_MINUTE = 60;
    uint256 public constant MAX_BATCH_SIZE = 25; // Maximum tokens per batch

    // --------------------------------------------------------------------
    //  POOL LAYER — anonymity pool (per docs/cyrustresor1_spec.md)
    // --------------------------------------------------------------------
    // Epoch length: 1 hour per spec § 4. A commitment made in epoch E can
    // be revealed starting from epoch E+1 (enforced in revealFromPool,
    // Session C). block.timestamp granularity is fine for hour-scale windows.
    uint256 public constant EPOCH_LENGTH = 3600;

    // Reserved for v2 ZK proof verifier per spec § 10. Constructor-immutable.
    // v1 deployments pass address(0); v2 deployments will pass a real verifier
    // and revealFromPool() will switch enforcement paths.
    address public immutable zkVerifier;

    // Per-commitment metadata. The commitment hash itself binds (secret, salt,
    // withdrawTo, token, bucketIdx, address(this), block.chainid) — so we only
    // need to track depositEpoch + spent here. token/bucketIdx are recomputed
    // from the user-supplied params at reveal time via the keccak preimage.
    struct Commitment {
        uint64 depositEpoch;  // 0 = never used (fresh sentinel — block.timestamp/3600 is never 0 in practice)
        bool spent;
    }
    mapping(bytes32 => Commitment) public commitments;

    // Bucket sizes per pool-supported token. Configured at deploy time.
    // address(0) = native ETH/BNB. Tokens not in this map cannot be pooled.
    mapping(address => uint256[]) public poolBucketSizes;

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

    // Simplified security events (reduced to save space)
    event RateLimitExceeded(address indexed user, uint256 count);
    event BatchOperation(address indexed user, uint256 tokenCount);

    // Pool-layer events. Intentionally NO depositor address — anonymity depends
    // on the commit event being un-linkable to a specific msg.sender. Off-chain
    // observers can correlate by block timestamp only.
    event PoolDeposit(bytes32 indexed commitment, address indexed token, uint8 bucketIdx, uint256 depositEpoch);

    // --------------------------------------------------------------------
    //  CONSTRUCTOR
    // --------------------------------------------------------------------
    constructor(
        address _feeCollector,
        bytes32 _salt,
        address _priceFeed,                       // Chainlink native/USD feed
        address[] memory _poolTokens,             // pool-supported tokens; address(0) = native
        uint256[][] memory _bucketSchedules,      // _bucketSchedules[i] = sizes for _poolTokens[i]
        address _zkVerifier                       // v1 = address(0); v2 = real verifier per spec § 10
    ) {
        require(_feeCollector != address(0), "Invalid fee collector");
        require(_priceFeed != address(0), "Invalid price feed");
        require(_poolTokens.length == _bucketSchedules.length, "pool: tokens/buckets length mismatch");
        feeCollector = _feeCollector;
        salt = _salt;
        priceFeed = AggregatorV3Interface(_priceFeed);
        zkVerifier = _zkVerifier;

        // Configure pool bucket schedules per token.
        for (uint256 i = 0; i < _poolTokens.length; i++) {
            require(_bucketSchedules[i].length > 0, "pool: empty bucket schedule");
            // Sanity: all bucket sizes must be > 0 (zero-amount commits would be free privacy).
            for (uint256 j = 0; j < _bucketSchedules[i].length; j++) {
                require(_bucketSchedules[i][j] > 0, "pool: zero bucket size");
            }
            poolBucketSizes[_poolTokens[i]] = _bucketSchedules[i];
        }
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
    //  RATE LIMITING FUNCTIONS (Anti-spam protection)
    // --------------------------------------------------------------------
    /**
     * @dev Simplified rate limiting (per-minute only to save space)
     */
    function _checkAndUpdateRateLimit() internal {
        uint256 currentTime = block.timestamp;

        // Reset counter if time window has passed
        if (currentTime >= _lastTransactionMinute[msg.sender] + RATE_LIMIT_WINDOW_MINUTE) {
            _transactionsPerMinute[msg.sender] = 0;
            _lastTransactionMinute[msg.sender] = currentTime;
        }

        // Check rate limit
        if (_transactionsPerMinute[msg.sender] >= MAX_TRANSACTIONS_PER_MINUTE) {
            emit RateLimitExceeded(msg.sender, _transactionsPerMinute[msg.sender]);
            revert("Rate limit exceeded");
        }

        // Update counter
        _transactionsPerMinute[msg.sender]++;
    }

    /**
     * @dev Simplified input validation for multi-token operations
     */
    function _validateMultiTokenInput(address[] calldata tokens, uint256[] calldata amounts) internal {
        require(tokens.length > 0 && tokens.length <= MAX_BATCH_SIZE, "Invalid token count");
        require(tokens.length == amounts.length, "Array length mismatch");

        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "Zero amount not allowed");
            require(tokens[i] != address(0), "Invalid token address");
        }

        emit BatchOperation(msg.sender, tokens.length);
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
    //  MULTI-TOKEN OPERATIONS (Custom Bundle Support)
    // --------------------------------------------------------------------

    /**
     * @notice Deposit multiple custom tokens in a single transaction
     * @dev Supports 1-25 different tokens per transaction with custom bundles (no presets)
     * @param tokens Array of token addresses to deposit (address(0) for native ETH)
     * @param amounts Array of amounts to deposit for each token
     */
    function depositMultipleTokens(
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external payable nonReentrant {
        _validateMultiTokenInput(tokens, amounts);
        _checkAndUpdateRateLimit();

        _chargeFeeFromWallet();

        // Count new tokens for this transaction
        uint256 newTokensInTx = 0;

        // Process each token deposit
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 amount = amounts[i];

            if (token == address(0)) {
                // Native ETH deposit
                uint256 fee = _getDynamicFeeInWei();
                require(msg.value >= fee, "Insufficient fee sent");
                require(amount > fee, "Amount must exceed fee");

                unchecked {
                    vault[_key(msg.sender, address(0))] += amount;
                }
                feeVault[_key(feeCollector, address(0))] += fee;

                if (_tokenIdx[msg.sender][address(0)] == 0) {
                    newTokensInTx++;
                }
                _trackToken(address(0), newTokensInTx);
            } else {
                // ERC20 token deposit
                IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

                unchecked {
                    vault[_key(msg.sender, token)] += amount;
                }

                if (_tokenIdx[msg.sender][token] == 0) {
                    newTokensInTx++;
                }
                _trackToken(token, newTokensInTx);
            }

            emit Deposit(token, msg.sender, amount);
        }
    }

    /**
     * @notice Withdraw multiple custom tokens in a single transaction
     * @dev Supports 1-25 different tokens per transaction with custom bundles (no presets)
     * @param tokens Array of token addresses to withdraw (address(0) for native ETH)
     * @param amounts Array of amounts to withdraw for each token
     */
    function withdrawMultipleTokens(
        address[] calldata tokens,
        uint256[] calldata amounts
    ) external payable nonReentrant {
        _validateMultiTokenInput(tokens, amounts);
        _checkAndUpdateRateLimit();

        _chargeFeeFromWallet();

        // First pass: Validate all balances before any withdrawal
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 amount = amounts[i];
            bytes32 userKey = _key(msg.sender, token);
            require(vault[userKey] >= amount, "Insufficient balance for token");
        }

        // Second pass: Perform all withdrawals (atomic operation)
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 amount = amounts[i];

            bytes32 userKey = _key(msg.sender, token);
            unchecked {
                vault[userKey] -= amount;
            }

            // Auto-cleanup if balance is now zero
            _removeTokenIfZero(token);

            if (token == address(0)) {
                // Native ETH withdrawal
                (bool success, ) = payable(msg.sender).call{value: amount}("");
                require(success, "ETH transfer failed");
            } else {
                // ERC20 token withdrawal
                IERC20(token).safeTransfer(msg.sender, amount);
            }

            emit Withdraw(token, msg.sender, amount);
        }
    }

    /**
     * @notice Transfer multiple custom tokens internally to another user (anonymous)
     * @dev Supports 1-25 different tokens per transaction with custom bundles (no presets)
     * @param tokens Array of token addresses to transfer (address(0) for native ETH)
     * @param to Recipient address
     * @param amounts Array of amounts to transfer for each token
     */
    function transferMultipleTokensInternal(
        address[] calldata tokens,
        address to,
        uint256[] calldata amounts
    ) external payable nonReentrant {
        require(to != address(0) && to != msg.sender, "Invalid recipient");
        _validateMultiTokenInput(tokens, amounts);
        _checkAndUpdateRateLimit();

        _chargeFeeFromWallet();

        // First pass: Validate all sender balances before any transfer
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 amount = amounts[i];
            bytes32 fromKey = _key(msg.sender, token);
            require(vault[fromKey] >= amount, "Insufficient balance for token");
        }

        // Second pass: Perform all transfers (atomic operation)
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            uint256 amount = amounts[i];

            bytes32 fromKey = _key(msg.sender, token);
            bytes32 toKey = _key(to, token);

            unchecked {
                vault[fromKey] -= amount;
                vault[toKey] += amount;
            }

            // Clean up sender if needed
            _removeTokenIfZero(token);
            // Ensure the recipient's list contains the token
            _addTokenForRecipient(to, token);

            emit InternalTransfer(token, msg.sender, to, amount);
        }
    }

    // --------------------------------------------------------------------
    //  POOL LAYER — commit (deposit into anonymity pool)
    // --------------------------------------------------------------------
    /// @dev Returns the current epoch index. Anyone can call.
    function currentEpoch() public view returns (uint256) {
        return block.timestamp / EPOCH_LENGTH;
    }

    /// @dev Returns the bucket size for (token, bucketIdx). Reverts if not configured.
    function getPoolBucketSize(address token, uint8 bucketIdx) public view returns (uint256) {
        uint256[] storage sizes = poolBucketSizes[token];
        require(bucketIdx < sizes.length, "pool: bucket index out of range");
        return sizes[bucketIdx];
    }

    /// @notice Commit a deposit into the anonymity pool. Fee is paid in full
    ///         at commit time (spec § 7 "pay forward"); revealFromPool is
    ///         contract-fee-free (gas only, paid by whoever broadcasts the
    ///         reveal tx — typically the recipient or a relayer).
    /// @dev    The `commitment` arg MUST be precomputed off-chain (by the dapp) as
    ///         keccak256(abi.encode(secret, salt, withdrawTo, token, bucketIdx, address(this), block.chainid))
    ///         where (secret, salt) are 256-bit random user-side entropy. The
    ///         withdrawTo is baked in to prevent reveal-time MEV redirection
    ///         (spec § 9). The contract does NOT validate the commitment's
    ///         preimage at commit time — the keccak binding is enforced at
    ///         reveal time (revealFromPool, Session C). Caller must NOT reuse
    ///         a commitment that was previously committed (depositEpoch != 0
    ///         on the stored entry).
    /// @param  commitment Precomputed keccak-256 hash; see @dev.
    /// @param  token      address(0) = native ETH/BNB; otherwise an ERC-20 in poolBucketSizes.
    /// @param  bucketIdx  Index into poolBucketSizes[token]; out-of-range reverts.
    function commitToPool(
        bytes32 commitment,
        address token,
        uint8 bucketIdx
    ) external payable nonReentrant {
        _checkAndUpdateRateLimit();

        // Freshness: each commitment can only be used once (no reuse, no front-run replay).
        require(commitments[commitment].depositEpoch == 0, "pool: commitment already used");

        uint256 bucketSize = getPoolBucketSize(token, bucketIdx);  // reverts on bad bucketIdx
        uint256 fee = _getDynamicFeeInWei();

        if (token == address(0)) {
            // Native ETH/BNB: msg.value must cover bucketSize + fee exactly.
            // Excess reverts (would leak identity via the refund).
            require(msg.value == bucketSize + fee, "pool: native msg.value must equal bucketSize + fee");
            // Bucket size stays in the contract as backing for future reveals.
        } else {
            // ERC-20: msg.value must equal fee only; the bucket size is pulled via transferFrom.
            require(msg.value == fee, "pool: erc20 msg.value must equal fee");
            IERC20(token).safeTransferFrom(msg.sender, address(this), bucketSize);
        }

        // Credit the fee to feeCollector (uses the same feeVault path as Bank8 deposits).
        feeVault[_key(feeCollector, address(0))] += fee;

        uint256 epoch = currentEpoch();
        commitments[commitment] = Commitment({
            depositEpoch: uint64(epoch),
            spent: false
        });

        // Emit WITHOUT msg.sender — anonymity primitive (spec § 6 "no depositor address in the event").
        emit PoolDeposit(commitment, token, bucketIdx, epoch);
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