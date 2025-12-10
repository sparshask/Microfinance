// components/repay-loan.tsx
"use client";

import React, { useState } from "react";
import { ethers } from "ethers";
import microfinance from "../contracts/Microfinance.json";

declare global {
  interface Window { ethereum?: any }
}

interface RepayLoanProps {
  loanId: number;
  amountWei: bigint;        // principal in wei (BigInt)
  borrower: string;         // borrower address (for check)
  account: string | null;   // currently connected wallet
  onSuccess?: () => Promise<void> | void; // callback to refresh parent
}

export default function RepayLoan({ loanId, amountWei, borrower, account, onSuccess }: RepayLoanProps) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!contractAddress) {
    return <div className="text-sm text-red-600">Contract address not configured</div>;
  }

  const short = (a: string) => a ? `${a.slice(0,6)}…${a.slice(-4)}` : "";

  const handleRepay = async () => {
    setErr(null);

    try {
      if (!window.ethereum) throw new Error("No wallet found (window.ethereum)");
      if (!account) throw new Error("Connect your wallet to repay");
      // Ensure the connected account is the borrower
      if (account.toLowerCase() !== borrower.toLowerCase()) {
        // allow repay even if not same? we block here as app expects borrower to repay
        throw new Error("Connected account is not the borrower for this loan. Switch wallet to repay.");
      }

      setLoading(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, (microfinance as any).abi, signer);

      // Make sure amountWei is bigint
      const value = typeof amountWei === "bigint" ? amountWei : BigInt(amountWei.toString());

      // call repayLoan with value equal to principal (contract refunds excess)
      const tx = await contract.repayLoan(loanId, { value });
      console.debug("repay tx sent:", tx);
      await tx.wait();
      // success
      if (onSuccess) await onSuccess();
      alert("Repayment successful — transaction mined.");
    } catch (e: any) {
      console.error("repay error:", e);
      setErr(e?.reason || e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  // show button + error
  return (
    <div className="mt-3 flex flex-col items-end gap-2">
      <div className="text-sm text-gray-600">
        Borrower: <span className="font-mono">{short(borrower)}</span>
      </div>

      <button
        onClick={handleRepay}
        disabled={loading}
        className={`px-4 py-2 rounded text-white ${loading ? "bg-gray-400" : "bg-indigo-600 hover:bg-indigo-700"}`}
      >
        {loading ? "Processing..." : `Repay ${ethers.formatEther(amountWei)} ETH`}
      </button>

      {err && <div className="text-sm text-red-600 mt-1 break-words">{err}</div>}
    </div>
  );
}
