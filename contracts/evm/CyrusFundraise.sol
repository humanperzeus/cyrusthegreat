// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title CyrusFundraise
 * @notice Minimal, NON-CUSTODIAL fundraising registry that gives every
 *         campaign a real on-chain id + an accurate per-campaign raised
 *         total — without a backend and without event-scanning.
 *
 * Why this exists
 * ---------------
 * The first /fund implementation treated a "campaign" as just a URL
 * (?to=&title=…). Donations were plain ERC-20 transfers, which carry no
 * campaign reference, so a wallet total could never be attributed to one
 * campaign — and reading even that required eth_getLogs, which free-tier
 * RPCs cap at ~10 blocks. This contract fixes both:
 *
 *   • createCampaign() mints an auto-incrementing `id` (the unique id).
 *   • donate()/donateNative() FORWARD funds straight to the recipient in
 *     the same tx (the contract never holds anything) AND bump a per-
 *     campaign `raised` counter.
 *   • The frontend reads campaigns(id).raised in a SINGLE eth_call — no
 *     getLogs, no indexer, no block-range limit. Progress is exact.
 *
 * Non-custodial by construction: there is no withdraw function and no
 * balance held here. Every wei/‌token a donor sends leaves the donor and
 * lands at the recipient (and the fee collector) before donate() returns.
 * For ERC-20 the two legs are pulled straight from the donor with two
 * transferFrom calls, so the contract never even briefly holds the funds.
 * A bug can't lock funds because the contract keeps none.
 *
 * Platform fee: fee = max($0.10, 0.1% of the donation), split off to
 * `feeCollector` at donate time; the rest goes to the recipient.
 *   - 0.1% (FEE_BPS = 10) is the rate above $100.
 *   - $0.10 is the floor below that — matching the pool's $0.10-flat fee, so
 *     small stablecoin gifts still yield something (a $50 gift → $0.10 =
 *     0.2%, not the pennies pure-0.1% would give). Crypto's gas friction
 *     means real donations cluster well above $5, so the floor rarely bites.
 *
 * The $0.10 floor is denominated per-campaign at creation, computed FROM the
 * token's decimals assuming a $1-pegged stablecoin (10^(decimals-1) = $0.10).
 * The app only offers $1 stablecoins (USD1/USDC/USDT) + native, so this holds
 * for every campaign the UI creates. NATIVE campaigns get floor = 0 (no price
 * oracle to define $0.10 in ETH) — they pay a straight 0.1%, which is fine
 * since native donations are large anyway. The floor is computed by the
 * CONTRACT (not passed by the creator) so it can't be gamed to zero.
 *
 * Title/description are NOT stored on-chain (strings are gas-heavy).
 * The title is emitted once in CampaignCreated for cheap off-chain
 * indexing; richer metadata rides in the campaign URL (or the optional
 * metaURI). What's on-chain is the money-truth: recipient, token, goal,
 * raised.
 */
contract CyrusFundraise is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Sentinel for a native-token (ETH/BNB/…) campaign.
    address public constant NATIVE = address(0);

    /// @notice Platform fee in basis points. 10 bps = 0.1%.
    uint256 public constant FEE_BPS = 10;
    uint256 private constant BPS_DENOM = 10_000;

    /// @notice Where the 0.1% platform fee is sent. Immutable — set once at
    ///         construction (owner-less thereafter, matching the rest of the app).
    address public immutable feeCollector;

    struct Campaign {
        address recipient;  // where donations are forwarded
        address token;      // ERC-20 address, or NATIVE (address(0)) for the chain coin
        uint256 goal;       // display target in token's smallest unit (0 = no goal)
        uint256 raised;     // running gross total (what donors gave)
        uint256 minFee;     // $0.10 floor in token units, computed at creation (0 for native)
        uint64  createdAt;  // block timestamp at creation
        bool    active;     // creator can flip this off; donations then revert
        bool    listed;     // OPT-IN: appears in the public /discover directory
        string  title;      // stored on-chain so the directory needs no getLogs/backend
    }

    /// @notice campaignId => campaign. Ids start at 1 (0 is "does not exist").
    mapping(uint256 => Campaign) public campaigns;

    /// @notice Id that will be assigned to the NEXT created campaign.
    uint256 public nextId = 1;

    // --------------------------------------------------------------------
    //  CONSTRUCTOR
    // --------------------------------------------------------------------
    /// @param _feeCollector Recipient of the 0.1% platform fee. Cannot be zero.
    constructor(address _feeCollector) {
        if (_feeCollector == address(0)) revert ZeroFeeCollector();
        feeCollector = _feeCollector;
    }

    // --------------------------------------------------------------------
    //  EVENTS
    // --------------------------------------------------------------------
    event CampaignCreated(
        uint256 indexed id,
        address indexed recipient,
        address indexed token,
        uint256 goal,
        string  title,
        string  metaURI,
        bool    listed
    );
    event CampaignListed(uint256 indexed id, bool listed);
    event Donation(
        uint256 indexed id,
        address indexed donor,
        uint256 amount,     // gross the donor gave
        uint256 fee,        // platform cut sent to feeCollector
        uint256 newRaised   // running gross total for the campaign
    );
    event CampaignClosed(uint256 indexed id);

    // --------------------------------------------------------------------
    //  ERRORS
    // --------------------------------------------------------------------
    error ZeroRecipient();
    error ZeroFeeCollector();
    error CampaignInactive();
    error ZeroAmount();
    error NotRecipient();
    error NativeMismatch();   // sent value to an ERC-20 campaign, or vice-versa
    error NativeForwardFailed();
    error FeeForwardFailed();
    error BelowMinDonation(); // donation is <= the fee (must exceed the $0.10 floor)

    // --------------------------------------------------------------------
    //  CREATE
    // --------------------------------------------------------------------
    /**
     * @notice Register a campaign and receive its unique id.
     * @param recipient Where donations are forwarded. Cannot be zero.
     * @param token     ERC-20 token address, or NATIVE (address(0)) for the chain coin.
     * @param goal      Display target (token's smallest unit). 0 = no goal.
     * @param title     Human title — stored on-chain (so /discover needs no
     *                  backend/getLogs) AND emitted. Kept short by the UI.
     * @param metaURI   Optional off-chain metadata pointer (ipfs://…, https://…). May be "".
     * @param listed    OPT-IN: if true the campaign shows in the public
     *                  /discover directory. Default your UI to false.
     * @return id       The new campaign id.
     */
    function createCampaign(
        address recipient,
        address token,
        uint256 goal,
        string calldata title,
        string calldata metaURI,
        bool listed
    ) external returns (uint256 id) {
        if (recipient == address(0)) revert ZeroRecipient();

        id = nextId++;
        campaigns[id] = Campaign({
            recipient: recipient,
            token: token,
            goal: goal,
            raised: 0,
            minFee: _minFeeFor(token),
            createdAt: uint64(block.timestamp),
            active: true,
            listed: listed,
            title: title
        });

        emit CampaignCreated(id, recipient, token, goal, title, metaURI, listed);
    }

    /**
     * @notice List / unlist a campaign in the public directory. Recipient-only.
     *         Opt-in privacy: a campaign is invisible in /discover until its
     *         owner explicitly lists it, and can be pulled any time.
     */
    function setListed(uint256 id, bool listed) external {
        Campaign storage c = campaigns[id];
        if (msg.sender != c.recipient) revert NotRecipient();
        c.listed = listed;
        emit CampaignListed(id, listed);
    }

    /**
     * @dev The $0.10 fee floor in `token` units, assuming a $1-pegged
     *      stablecoin: 0.10 * 10^decimals == 10^(decimals-1). Native gets 0
     *      (no on-chain price for "$0.10 in ETH"). Robust to tokens without
     *      a decimals() (→ 0 floor, straight 0.1%). Computed once at
     *      creation so donate() never re-reads decimals and the floor can't
     *      be gamed by the campaign creator.
     */
    function _minFeeFor(address token) internal view returns (uint256) {
        if (token == NATIVE) return 0;
        try IERC20Metadata(token).decimals() returns (uint8 d) {
            return d >= 1 ? 10 ** (uint256(d) - 1) : 0;
        } catch {
            return 0;
        }
    }

    /// @dev fee = max($0.10 floor, 0.1% of amount).
    function _feeFor(Campaign storage c, uint256 amount) internal view returns (uint256) {
        uint256 pct = (amount * FEE_BPS) / BPS_DENOM;
        return pct > c.minFee ? pct : c.minFee;
    }

    // --------------------------------------------------------------------
    //  DONATE
    // --------------------------------------------------------------------
    /**
     * @notice Donate an ERC-20 amount to a campaign. Requires prior
     *         approve(this, amount). Two pulls straight from the donor —
     *         the fee to feeCollector and the rest to the recipient — so the
     *         contract never holds the funds even for an instant.
     * @dev    fee = max($0.10 floor, 0.1%). Donation must exceed the fee.
     *         `raised` counts GROSS `amount` (what the donor gave), the
     *         fundraise-total the progress bar shows. For fee-on-transfer
     *         tokens the recipient nets slightly less, but the app's
     *         stablecoins have no transfer fee so amounts match.
     */
    function donate(uint256 id, uint256 amount) external nonReentrant {
        Campaign storage c = campaigns[id];
        if (!c.active) revert CampaignInactive();
        if (c.token == NATIVE) revert NativeMismatch();
        if (amount == 0) revert ZeroAmount();

        uint256 fee = _feeFor(c, amount);
        if (amount <= fee) revert BelowMinDonation(); // must leave recipient something
        c.raised += amount;
        emit Donation(id, msg.sender, amount, fee, c.raised);

        // Pull straight from donor — never through the contract's balance.
        if (fee > 0) IERC20(c.token).safeTransferFrom(msg.sender, feeCollector, fee);
        IERC20(c.token).safeTransferFrom(msg.sender, c.recipient, amount - fee);
    }

    /**
     * @notice Donate the chain's native coin (ETH/BNB/…) to a native campaign.
     *         fee (straight 0.1%, no floor for native) + rest forwarded in-tx.
     */
    function donateNative(uint256 id) external payable nonReentrant {
        Campaign storage c = campaigns[id];
        if (!c.active) revert CampaignInactive();
        if (c.token != NATIVE) revert NativeMismatch();
        if (msg.value == 0) revert ZeroAmount();

        uint256 fee = _feeFor(c, msg.value); // native minFee is 0 → straight 0.1%
        if (msg.value <= fee) revert BelowMinDonation();
        c.raised += msg.value;
        emit Donation(id, msg.sender, msg.value, fee, c.raised);

        // Forward both legs in-tx; contract retains nothing.
        if (fee > 0) {
            (bool okFee, ) = payable(feeCollector).call{value: fee}("");
            if (!okFee) revert FeeForwardFailed();
        }
        (bool ok, ) = payable(c.recipient).call{value: msg.value - fee}("");
        if (!ok) revert NativeForwardFailed();
    }

    // --------------------------------------------------------------------
    //  CLOSE
    // --------------------------------------------------------------------
    /**
     * @notice Deactivate a campaign so no further donations are accepted.
     *         Only the campaign's recipient may close it. Idempotent-safe:
     *         reverts only on wrong caller, not on already-closed.
     */
    function closeCampaign(uint256 id) external {
        Campaign storage c = campaigns[id];
        if (msg.sender != c.recipient) revert NotRecipient();
        c.active = false;
        emit CampaignClosed(id);
    }

    // --------------------------------------------------------------------
    //  VIEWS (single eth_call — no getLogs needed for progress)
    // --------------------------------------------------------------------
    /// @notice Full campaign struct for id (recipient/token/goal/raised/createdAt/active).
    function getCampaign(uint256 id) external view returns (Campaign memory) {
        return campaigns[id];
    }

    /// @notice Just the raised total — the one number the progress bar needs.
    function raisedOf(uint256 id) external view returns (uint256) {
        return campaigns[id].raised;
    }

    /**
     * @notice Directory feed: campaigns in [startId, endId] that are LISTED,
     *         newest-first-agnostic (returned in id order). One eth_call powers
     *         the whole /discover page — no getLogs, no backend.
     * @param startId first id to scan (>= 1).
     * @param endId   last id to scan (clamped to nextId-1).
     * @return ids    the listed campaign ids in range.
     * @return list   the matching Campaign structs (parallel to ids).
     */
    function getListedCampaigns(uint256 startId, uint256 endId)
        external
        view
        returns (uint256[] memory ids, Campaign[] memory list)
    {
        uint256 last = nextId - 1;
        if (endId > last) endId = last;
        if (startId == 0) startId = 1;

        // First pass: count matches so we can size the fixed arrays.
        uint256 n = 0;
        for (uint256 i = startId; i <= endId; i++) {
            if (campaigns[i].listed) n++;
        }

        ids = new uint256[](n);
        list = new Campaign[](n);
        uint256 j = 0;
        for (uint256 i = startId; i <= endId; i++) {
            if (campaigns[i].listed) {
                ids[j] = i;
                list[j] = campaigns[i];
                j++;
            }
        }
    }
}
