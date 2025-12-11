"use client";

import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import RepayLoan from "./repay-loan";

declare global {
  interface Window { ethereum?: any; }
}

interface LoansListProps {
  account: string | null;
}

type UiLoan = {
  id: number;
  borrower: string;
  amountWei: bigint;
  duration: number;
  purpose: string;
  status: number;
  dueDate: number;
  lender?: string;
};

// ---------- Safe converters ----------
const toBigIntSafe = (v: any): bigint => {
  try { return BigInt(v.toString()); } catch { return 0n; }
};
const toNumberSafe = (v: any): number => {
  try { return Number(v.toString()); } catch { return 0; }
};
const toStringSafe = (v: any): string => (v == null ? "" : String(v));
// -------------------------------------

export default function LoansList({ account }: LoansListProps) {
  const [loans, setLoans] = useState<UiLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // IMPORTANT — correct permanent source of contract address
  const contractAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "").toLowerCase();

  const fetchLoans = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      if (!account) { setLoading(false); return; }
      if (!window.ethereum) throw new Error("Wallet provider not found.");
      if (!contractAddress) throw new Error("Contract address missing.");

      const provider = new ethers.BrowserProvider(window.ethereum);

      // load ABI cleanly
      const mod = await import("../contracts/abi/Microfinance.json");
      const abi = (mod as any).default?.abi ?? mod.abi ?? mod;

      const contract = new ethers.Contract(contractAddress, abi, provider);

      const total = Number(await contract.getLoanCount());
      const results: UiLoan[] = [];

      // fetch + filter by borrower
      for (let i = 0; i < total; i++) {
        try {
          const row: any = await contract.getLoan(i);
          const borrower = toStringSafe(row.borrower ?? row[0] ?? "");
          if (borrower.toLowerCase() !== account.toLowerCase()) continue;

          results.push({
            id: i,
            borrower,
            amountWei: toBigIntSafe(row.amount ?? row[1]),
            duration: toNumberSafe(row.duration ?? row[2]),
            purpose: toStringSafe(row.purpose ?? row[3]),
            status: toNumberSafe(row.status ?? row[4]),
            dueDate: toNumberSafe(row.dueDate ?? row[5]),
            lender: toStringSafe(row.lender ?? row[6])
          });
        } catch {}
      }

      results.sort((a, b) => b.id - a.id);
      setLoans(results);
    } catch (e: any) {
      console.error("LoansList error:", e);
      setErr(e.message ?? "Failed to load loans");
    } finally {
      setLoading(false);
    }
  }, [account, contractAddress]);

  // auto refresh if blockchain events fire elsewhere (fund/reject/repay)
  useEffect(() => {
    if (!account) return;
    fetchLoans();
  }, [account, fetchLoans]);

  // render
  if (!account) return null;

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-600 mx-auto"></div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6 text-center text-red-600">
        {err}
      </div>
    );
  }

  if (loans.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6 text-center">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Your Loans</h2>
        <p className="text-gray-600">You haven’t taken any loans yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">Your Loans</h2>
      <div className="space-y-4">
        {loans.map((loan) => {
          const status = loan.status;
          const badgeText =
            status === 0 ? "Pending" :
            status === 1 ? "Approved" :
            status === 2 ? "Repaid" :
            "Rejected";

          const badgeClass =
            status === 0 ? "bg-yellow-100 text-yellow-700" :
            status === 1 ? "bg-green-100 text-green-700" :
            status === 2 ? "bg-blue-100 text-blue-700" :
            "bg-red-100 text-red-700";

          return (
            <div key={`loan-${loan.id}`} className="border rounded-lg p-4 hover:shadow-md transition">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <h3 className="text-sm text-gray-500">Amount</h3>
                  <p className="text-lg font-semibold text-gray-900">
                    {ethers.formatEther(loan.amountWei)} ETH
                  </p>
                </div>

                <div>
                  <h3 className="text-sm text-gray-500">Duration</h3>
                  <p className="text-lg font-semibold text-gray-900">{loan.duration} days</p>
                </div>

                <div>
                  <h3 className="text-sm text-gray-500">Purpose</h3>
                  <p className="text-lg font-semibold text-gray-900">{loan.purpose}</p>
                </div>

                <div>
                  <h3 className="text-sm text-gray-500">Status</h3>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${badgeClass}`}>
                    {badgeText}
                  </span>
                </div>
              </div>

              {status === 1 && (
                <div className="mt-4 border-t pt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h3 className="text-sm text-gray-500">Due Date</h3>
                    <p className="text-lg font-semibold text-gray-900">
                      {loan.dueDate ? new Date(loan.dueDate * 1000).toLocaleDateString() : "—"}
                    </p>
                  </div>

                  <RepayLoan
                    loanId={loan.id}
                    amountWei={loan.amountWei}
                    borrower={loan.borrower}
                    account={account}
                    onSuccess={fetchLoans}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
