// components/user-stats.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, formatEther } from "ethers";
import { toast } from "react-hot-toast";

interface UserStatsProps {
  account: string; // connected wallet address
}

interface LoanStruct {
  borrower: string;
  amount: bigint;
  duration: bigint;
  purpose: string;
  status: number; // uint8
  dueDate: bigint;
  lender?: string;
}

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as string;

// Minimal ABI — make sure this matches your contract artifact
const ABI = [
  "function getUserLoanCount(address) view returns (uint256)",
  "function getUserCreditScore(address) view returns (uint256)",
  // note: getUserLoanAtIndex returns the Loan struct in your current contract
  "function getUserLoanAtIndex(address,uint256) view returns (tuple(address borrower,uint256 amount,uint256 duration,string purpose,uint8 status,uint256 dueDate,address lender))",
  "function getLoan(uint256) view returns (address borrower,uint256 amount,uint256 duration,string purpose,uint8 status,uint256 dueDate,address lender)",
  "function getUserCreditScore(address) view returns (uint256)",
];

export function UserStats({ account }: UserStatsProps) {
  const [isLoading, setIsLoading] = useState(true);

  const [balance, setBalance] = useState("0"); // ETH string
  const [loanCount, setLoanCount] = useState(0);
  const [creditScore, setCreditScore] = useState(0);
  const [activeLoans, setActiveLoans] = useState(0);
  const [totalBorrowed, setTotalBorrowed] = useState("0");
  const [totalRepaid, setTotalRepaid] = useState("0");

  const hasConfig = useMemo(
    () => Boolean(CONTRACT_ADDRESS && CONTRACT_ADDRESS.startsWith("0x")),
    []
  );

  // defensive conversion helpers
  function toBigIntSafe(v: any): bigint {
    if (v == null) return 0n;
    if (typeof v === "bigint") return v;
    try {
      // ethers BigNumber/string -> toString -> BigInt
      return BigInt(v.toString());
    } catch {
      return 0n;
    }
  }
  function toNumberSafe(v: any): number {
    if (v == null) return 0;
    if (typeof v === "number") return v;
    try {
      return Number(v.toString());
    } catch {
      return 0;
    }
  }
  function toStringSafe(v: any): string {
    if (v == null) return "";
    return String(v);
  }

  useEffect(() => {
    if (!account || !hasConfig || !(window as any).ethereum) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);

        // Provider
        const provider = new BrowserProvider((window as any).ethereum);

        // 1) Wallet balance
        const bal = await provider.getBalance(account);
        if (!cancelled) setBalance(formatEther(bal));

        // 2) Contract (read-only)
        const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

        // Loan count & credit score
        const [lcBN, csBN] = await Promise.all([
          contract.getUserLoanCount(account),
          contract.getUserCreditScore(account),
        ]);
        const lc = Number(lcBN ?? 0);
        const cs = Number(csBN ?? 0);
        if (!cancelled) {
          setLoanCount(lc);
          setCreditScore(cs);
        }

        // 3) Aggregate loan stats
        let active = 0;
        let borrowed = 0n;
        let repaid = 0n;

        // iterate user loans — getUserLoanAtIndex returns a Loan struct
        for (let i = 0; i < lc; i++) {
          try {
            const loanRaw: any = await contract.getUserLoanAtIndex(account, i);

            // loanRaw may be an object with named fields or an array-like tuple.
            // Use defensive extraction.
            const borrower = toStringSafe(loanRaw.borrower ?? loanRaw[0]);
            const amount = toBigIntSafe(loanRaw.amount ?? loanRaw[1]);
            const duration = toBigIntSafe(loanRaw.duration ?? loanRaw[2]);
            const purpose = toStringSafe(loanRaw.purpose ?? loanRaw[3]);
            const status = toNumberSafe(loanRaw.status ?? loanRaw[4]);
            const dueDate = toBigIntSafe(loanRaw.dueDate ?? loanRaw[5]);
            // lender may be the 6th or 7th slot depending on ABI — try both
            // const lender = toStringSafe(loanRaw.lender ?? loanRaw[6] ?? "");

            // status mapping: 0 = Pending, 1 = Approved/Funded, 2 = Repaid, 3 = Rejected
            if (status === 1) {
              active += 1;
              borrowed += amount;
            } else if (status === 2) {
              repaid += amount;
            }
          } catch (innerErr) {
            // don't fail entire load if one index is weird — log and continue
            console.warn("Failed decoding loan at index", i, innerErr);
            continue;
          }
        }

        if (!cancelled) {
          setActiveLoans(active);
          // format Ether values (formatEther accepts bigint)
          setTotalBorrowed(Number.parseFloat(formatEther(borrowed)).toString());
          setTotalRepaid(Number.parseFloat(formatEther(repaid)).toString());
        }
      } catch (err: any) {
        console.error("UserStats load error:", err);
        if (!cancelled) {
          toast.error(err?.message || "Failed to fetch user stats");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();

    // Optional polling (e.g., every 20s)
    const int = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(int);
    };
  }, [account, hasConfig]);

  if (!account) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Connect Wallet</h2>
          <p className="text-gray-600">Please connect your wallet to view your statistics</p>
        </div>
      </div>
    );
  }

  if (!hasConfig) {
    return (
      <div className="p-6 text-center text-gray-600">
        Missing <code>NEXT_PUBLIC_CONTRACT_ADDRESS</code> in <code>.env.local</code>.
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center text-gray-600">Loading user stats...</div>;
  }

  return (
    <div className="p-4 md:p-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* ETH Balance */}
        <div className="bg-white p-6 rounded-2xl shadow-md border animate-fade-in-up">
          <h3 className="text-lg font-semibold mb-1">ETH Balance</h3>
          <p className="text-sm text-gray-500 mb-3">Your current wallet balance</p>
          <p className="text-3xl font-bold text-blue-600">
            {Number.parseFloat(balance).toFixed(4)} ETH
          </p>
        </div>

        {/* Loan Count */}
        <div className="bg-white p-6 rounded-2xl shadow-md border animate-fade-in-up delay-100">
          <h3 className="text-lg font-semibold mb-1">Loan Count</h3>
          <p className="text-sm text-gray-500 mb-3">Total number of your loans</p>
          <p className="text-3xl font-bold text-green-600">{loanCount}</p>
        </div>

        {/* Credit Score */}
        <div className="bg-white p-6 rounded-2xl shadow-md border animate-fade-in-up delay-200">
          <h3 className="text-lg font-semibold mb-1">Credit Score</h3>
          <p className="text-sm text-gray-500 mb-3">Your platform credit score</p>
          <p className="text-3xl font-bold text-purple-600">{creditScore}</p>
        </div>

        {/* Loan Statistics */}
        <div className="bg-white rounded-xl shadow-md p-6 md:col-span-3">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Loan Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-gray-600">Active Loans</p>
              <p className="text-2xl font-bold text-indigo-600">{activeLoans}</p>
            </div>
            <div>
              <p className="text-gray-600">Total Borrowed</p>
              <p className="text-2xl font-bold text-blue-600">
                {Number.parseFloat(totalBorrowed || "0").toFixed(4)} ETH
              </p>
            </div>
            <div>
              <p className="text-gray-600">Total Repaid</p>
              <p className="text-2xl font-bold text-green-600">
                {Number.parseFloat(totalRepaid || "0").toFixed(4)} ETH
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
