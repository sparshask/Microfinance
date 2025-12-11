// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Microfinance
 * @dev Request/fund/repay loans with platform fees for lender & borrower
 *
 * Status codes:
 * 0 = Pending, 1 = Approved/Funded, 2 = Repaid, 3 = Rejected
 */
contract Microfinance is Ownable, Pausable, ReentrancyGuard {
    enum LoanStatus { Pending, Approved, Repaid, Rejected }

    struct Loan {
        address borrower;
        uint256 amount;     // wei
        uint256 duration;   // days
        string  purpose;
        LoanStatus status;  // 0=Pending,1=Approved/Funded,2=Repaid,3=Rejected
        uint256 dueDate;
        address lender;     // set on funding
    }

    // ===== Storage =====

    Loan[] public loans;
    mapping(address => uint256[]) public userLoans;
    mapping(address => uint256)   public creditScores;

    // Fees in basis points (bps): 100 bps = 1.00%
    uint256 public lenderFeeBps   = 100; // 1.00% extra paid by lender on funding
    uint256 public borrowerFeeBps = 50;  // 0.50% withheld from borrower on funding
    address payable public treasury;

    // ===== Events =====

    event LoanRequested(uint256 indexed loanId, address indexed borrower, uint256 amount, uint256 duration);
    event LoanFunded(
        uint256 indexed loanId,
        address indexed borrower,
        address indexed lender,
        uint256 amount,
        uint256 lenderFee,
        uint256 borrowerFee
    );
    event LoanRejected(uint256 indexed loanId, address indexed borrower);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower, address indexed lender, uint256 amount);

    // ===== Constructor =====

    constructor(address payable _treasury) Ownable(msg.sender) {
        require(_treasury != address(0), "treasury required");
        treasury = _treasury;
    }

    // ===== Admin controls =====

    function setFees(uint256 _lenderFeeBps, uint256 _borrowerFeeBps) external onlyOwner {
        // put sane caps; adjust as needed
        require(_lenderFeeBps <= 1000 && _borrowerFeeBps <= 1000, "fee too high"); // max 10% each
        lenderFeeBps   = _lenderFeeBps;
        borrowerFeeBps = _borrowerFeeBps;
    }

    function setTreasury(address payable _treasury) external onlyOwner {
        require(_treasury != address(0), "treasury required");
        treasury = _treasury;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ===== Core: Request / Fund / Reject / Repay =====

    /**
     * @dev Request a new loan
     */
    function requestLoan(uint256 _amount, uint256 _duration, string memory _purpose)
        external
        whenNotPaused
        returns (uint256 loanId)
    {
        require(_amount > 0, "amount=0");
        require(_duration > 0, "duration=0");
        require(bytes(_purpose).length > 0, "purpose empty");

        loanId = loans.length;

        loans.push(Loan({
            borrower: msg.sender,
            amount: _amount,
            duration: _duration,
            purpose: _purpose,
            status: LoanStatus.Pending,
            dueDate: block.timestamp + (_duration * 1 days),
            lender: address(0)
        }));

        userLoans[msg.sender].push(loanId);

        emit LoanRequested(loanId, msg.sender, _amount, _duration);
    }

    /**
     * @dev Lender funds a pending loan by sending amount + lender fee.
     *      - Lender pays: amount + (amount * lenderFeeBps / 10000) to contract.
     *      - Borrower receives: amount - (amount * borrowerFeeBps / 10000).
     *      - Both fees go to treasury.
     *      - Status becomes Approved (Funded), lender recorded, dueDate refreshed.
     */
    function fundLoan(uint256 _loanId)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        require(_loanId < loans.length, "invalid id");
        Loan storage L = loans[_loanId];
        require(L.status == LoanStatus.Pending, "not pending");
        require(L.amount > 0, "invalid amount");

        uint256 lenderFee   = (L.amount * lenderFeeBps) / 10000;
        uint256 borrowerFee = (L.amount * borrowerFeeBps) / 10000;
        uint256 required    = L.amount + lenderFee;

        require(msg.value == required, "incorrect value");

        // send lender fee to treasury
        (bool ok1, ) = treasury.call{value: lenderFee}("");
        require(ok1, "lender fee xfer failed");

        // send borrower proceeds (amount - borrowerFee)
        uint256 toBorrower = L.amount - borrowerFee;
        (bool ok2, ) = payable(L.borrower).call{value: toBorrower}("");
        require(ok2, "borrower xfer failed");

        // send borrower fee to treasury
        (bool ok3, ) = treasury.call{value: borrowerFee}("");
        require(ok3, "borrower fee xfer failed");

        L.status  = LoanStatus.Approved;
        L.lender  = msg.sender;
        L.dueDate = block.timestamp + (L.duration * 1 days);

        emit LoanFunded(_loanId, L.borrower, msg.sender, L.amount, lenderFee, borrowerFee);
    }

    /**
     * @dev Reject a pending loan.
     * NOTE: intentionally NOT onlyOwner so anyone can reject (permanent on-chain).
     */
    function rejectLoan(uint256 _loanId)
        external
        whenNotPaused
    {
        require(_loanId < loans.length, "invalid id");
        Loan storage L = loans[_loanId];
        require(L.status == LoanStatus.Pending, "not pending");

        L.status = LoanStatus.Rejected;
        emit LoanRejected(_loanId, L.borrower);
    }

    /**
     * @dev Repay a funded loan; principal forwarded to lender.
     *      (Interest can be added as needed.)
     */
    function repayLoan(uint256 _loanId)
        external
        payable
        nonReentrant
        whenNotPaused
    {
        require(_loanId < loans.length, "invalid id");
        Loan storage L = loans[_loanId];

        require(L.borrower == msg.sender, "not borrower");
        require(L.status == LoanStatus.Approved, "not approved");
        require(msg.value >= L.amount, "insufficient repay");
        require(L.lender != address(0), "no lender");

        L.status = LoanStatus.Repaid;

        // simple credit score bump (demo)
        creditScores[msg.sender] += 10;

        // forward principal to lender
        (bool ok, ) = payable(L.lender).call{value: L.amount}("");
        require(ok, "lender xfer failed");

        emit LoanRepaid(_loanId, L.borrower, L.lender, L.amount);

        // refund any excess
        uint256 extra = msg.value - L.amount;
        if (extra > 0) {
            (bool ok2, ) = payable(msg.sender).call{value: extra}("");
            require(ok2, "refund failed");
        }
    }

    // ===== Views =====

    function getLoanCount() external view returns (uint256) {
        return loans.length;
    }

    function getLoan(uint256 _loanId) external view returns (
        address borrower,
        uint256 amount,
        uint256 duration,
        string memory purpose,
        LoanStatus status,
        uint256 dueDate,
        address lender
    ) {
        require(_loanId < loans.length, "invalid id");
        Loan storage L = loans[_loanId];
        return (L.borrower, L.amount, L.duration, L.purpose, L.status, L.dueDate, L.lender);
    }

    function getUserLoanCount(address _user) external view returns (uint256) {
        return userLoans[_user].length;
    }

    function getUserLoanAtIndex(address _user, uint256 _index) external view returns (Loan memory) {
        require(_index < userLoans[_user].length, "bad index");
        uint256 id = userLoans[_user][_index];
        return loans[id];
    }

    function getUserCreditScore(address _user) external view returns (uint256) {
        return creditScores[_user];
    }

    // ===== Deprecated Owner-Approval (kept for compatibility, no transfer) =====
    // If your old UI calls approveLoan, we only mark Approved (no funds moved).
    function approveLoan(uint256 _loanId) external onlyOwner whenNotPaused {
        require(_loanId < loans.length, "invalid id");
        Loan storage L = loans[_loanId];
        require(L.status == LoanStatus.Pending, "not pending");
        L.status  = LoanStatus.Approved;
        L.dueDate = block.timestamp + (L.duration * 1 days);
        // No transfer here; use fundLoan for real funding + fees.
    }
}
