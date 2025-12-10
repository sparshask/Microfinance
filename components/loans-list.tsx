// components/loans-list.tsx
"use client";

import { useEffect, useState } from "react";
import { ethers } from "ethers";
// make sure this path points to the JSON artifact you copied into your repo
import microfinance from "../contracts/Microfinance.json";
import RepayLoan from "./repay-loan";

declare global {
  interface Window { ethereum?: any; ethers?: any; __MICROFINANCE_ABI__?: any; NEXT_PUBLIC_CONTRACT_ADDRESS?: string }
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

function statusBadge(s: number) {
  switch (Number(s)) {
    case 0: return { text: "Pending",  bg: "bg-yellow-100", color: "text-yellow-700" };
    case 1: return { text: "Approved", bg: "bg-green-100",  color: "text-green-700"  };
    case 2: return { text: "Repaid",   bg: "bg-blue-100",   color: "text-blue-700"   };
    case 3: return { text: "Rejected", bg: "bg-red-100",    color: "text-red-700"    };
    default:return { text: "Unknown",  bg: "bg-gray-100",   color: "text-gray-700"   };
  }
}

function toBigIntSafe(v: any): bigint {
  if (typeof v === "bigint") return v;
  if (v == null) return 0n;
  try { return BigInt(v.toString()); } catch { return 0n; }
}
function toNumberSafe(v: any): number {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  try { return Number(v.toString()); } catch { return 0; }
}
function toStringSafe(v: any): string {
  if (v == null) return "";
  return String(v);
}

export default function LoansList({ account }: LoansListProps) {
  const [loans, setLoans] = useState<UiLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? (window?.NEXT_PUBLIC_CONTRACT_ADDRESS as string | undefined);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr(null);
      setLoans([]);

      try {
        if (!account) { setLoading(false); return; }
        if (!window.ethereum) throw new Error("Wallet/provider not found (window.ethereum)");
        if (!contractAddress) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS not set in .env.local or window.NEXT_PUBLIC_CONTRACT_ADDRESS");

        // Prefer a globally injected ethers (window.ethers) if available (our loader sets this)
        const ethersLib = (window as any).ethers ?? ethers;
        const provider = new (ethersLib as any).BrowserProvider(window.ethereum);
        console.log("loans-list: using provider, contractAddress=", contractAddress);

        // sanity check: contract code exists at address on the connected chain
        try {
          const code = await provider.getCode(contractAddress);
          console.log("loans-list: provider.getCode ->", code ? (code === "0x" ? "0x (no code)" : `code length ${code.length}`) : "no result");
          if (!code || code === "0x") {
            throw new Error(`No contract code found at ${contractAddress} on the connected network. Did you deploy to this network?`);
          }
        } catch (codeErr) {
          // bubble it up as clear message
          throw codeErr;
        }

        const contract = new ethersLib.Contract(contractAddress, (microfinance as any).abi, provider);
        const acctNorm = account.toLowerCase();

        console.log("loans-list: contract created at", contract.address);

        // 1) Preferred mapping approach: userLoans(address, index) -> loanId + getLoan(loanId)
        if (typeof contract.userLoans === "function") {
          try {
            const userCountBn: any = await contract.getUserLoanCount(account);
            const userCount = Number(userCountBn);
            console.log("loans-list: getUserLoanCount ->", userCount);

            if (userCount > 0) {
              // fetch loan IDs in parallel but not too many at once
              const loanIdPromises: Promise<any>[] = [];
              for (let i = 0; i < userCount; i++) loanIdPromises.push(contract.userLoans(account, i));
              const loanIdResults = await Promise.all(loanIdPromises);
              const loanFetchPromises = loanIdResults.map((idBn: any) => {
                const id = toNumberSafe(idBn);
                return contract.getLoan(id).then((r: any) => ({ id, row: r })).catch((err: any) => {
                  console.warn("loans-list: getLoan failed for id", id, err);
                  return null;
                });
              });
              const loanRows = await Promise.all(loanFetchPromises);
              const ui: UiLoan[] = [];
              for (const item of loanRows) {
                if (!item) continue;
                const id = toNumberSafe(item.id);
                const row = item.row;
                const borrower = toStringSafe(row.borrower ?? row[0] ?? "");
                if (!borrower) continue;
                if (borrower.toLowerCase() !== acctNorm) continue;
                ui.push({
                  id,
                  borrower,
                  amountWei: toBigIntSafe(row.amount ?? row[1] ?? 0n),
                  duration: toNumberSafe(row.duration ?? row[2] ?? 0),
                  purpose: toStringSafe(row.purpose ?? row[3] ?? ""),
                  status: toNumberSafe(row.status ?? row[4] ?? 0),
                  dueDate: toNumberSafe(row.dueDate ?? row[5] ?? 0),
                  lender: toStringSafe(row.lender ?? row[6] ?? ""),
                });
              }

              if (ui.length > 0) {
                if (mounted) setLoans(ui.sort((a,b) => b.id - a.id));
                setLoading(false);
                console.log("loans-list: loaded via userLoans mapping, count=", ui.length);
                return;
              }
            } else {
              console.log("loans-list: userLoans mapping exists but userCount is 0");
            }
          } catch (userMapErr) {
            console.warn("loans-list: userLoans/getLoan path failed:", userMapErr);
            // continue to fallbacks
          }
        } else {
          console.log("loans-list: contract.userLoans is not a function (no mapping accessor in ABI)");
        }

        // 2) Fallback: getUserLoanAtIndex (some ABI variants provide this)
        if (typeof contract.getUserLoanAtIndex === "function") {
          try {
            const countBn: any = await contract.getUserLoanCount(account);
            const count = Number(countBn);
            console.log("loans-list: fallback getUserLoanAtIndex count:", count);
            if (count > 0) {
              const ui: UiLoan[] = [];
              for (let i = 0; i < count; i++) {
                try {
                  const row: any = await contract.getUserLoanAtIndex(account, i);
                  const borrower = toStringSafe(row.borrower ?? row[0] ?? account);
                  if (borrower.toLowerCase() !== acctNorm) continue;
                  ui.push({
                    id: toNumberSafe(row.id ?? i),
                    borrower,
                    amountWei: toBigIntSafe(row.amount ?? row[1] ?? 0n),
                    duration: toNumberSafe(row.duration ?? row[2] ?? 0),
                    purpose: toStringSafe(row.purpose ?? row[3] ?? ""),
                    status: toNumberSafe(row.status ?? row[4] ?? 0),
                    dueDate: toNumberSafe(row.dueDate ?? row[5] ?? 0),
                    lender: toStringSafe(row.lender ?? row[6] ?? ""),
                  });
                } catch (inner) {
                  console.warn("loans-list: getUserLoanAtIndex index failed", i, inner);
                }
              }
              if (ui.length > 0) {
                if (mounted) setLoans(ui.reverse());
                setLoading(false);
                console.log("loans-list: loaded via getUserLoanAtIndex, count=", ui.length);
                return;
              }
            }
          } catch (atIndexErr) {
            console.warn("loans-list: getUserLoanAtIndex fallback failed:", atIndexErr);
          }
        } else {
          console.log("loans-list: getUserLoanAtIndex not present on contract");
        }

        // 3) Global scan: getLoanCount + getLoan(i)
        try {
          const totalBn: any = await contract.getLoanCount();
          const total = Number(totalBn);
          console.log("loans-list: global scan total loans:", total);
          if (total > 0) {
            const ui: UiLoan[] = [];
            const batch: Promise<void>[] = [];
            for (let i = 0; i < total; i++) {
              batch.push((async () => {
                try {
                  const row: any = await contract.getLoan(i);
                  const borrower = toStringSafe(row.borrower ?? row[0] ?? "");
                  if (!borrower) return;
                  if (borrower.toLowerCase() !== acctNorm) return;
                  ui.push({
                    id: i,
                    borrower,
                    amountWei: toBigIntSafe(row.amount ?? row[1] ?? 0n),
                    duration: toNumberSafe(row.duration ?? row[2] ?? 0),
                    purpose: toStringSafe(row.purpose ?? row[3] ?? ""),
                    status: toNumberSafe(row.status ?? row[4] ?? 0),
                    dueDate: toNumberSafe(row.dueDate ?? row[5] ?? 0),
                    lender: toStringSafe(row.lender ?? row[6] ?? ""),
                  });
                } catch (e) {
                  // skip errors for individual rows
                }
              })());
            }
            await Promise.all(batch);
            if (ui.length > 0) {
              if (mounted) setLoans(ui.sort((a,b) => b.id - a.id));
              setLoading(false);
              console.log("loans-list: loaded via global scan, count=", ui.length);
              return;
            }
          }
        } catch (scanErr) {
          console.warn("loans-list: global scan failed:", scanErr);
        }

        // 4) Final fallback: parse logs/events (requires node / provider log access)
        try {
          const iface = new (ethersLib as any).Interface((microfinance as any).abi);
          const logs = await provider.getLogs({ address: contractAddress, fromBlock: 0, toBlock: "latest" });
          const temp: Record<number, UiLoan> = {};
          for (const log of logs) {
            try {
              const parsed = iface.parseLog(log);
              const name = parsed.name;
              const args = parsed.args;
              if (name === "LoanRequested") {
                const borrower = toStringSafe(args.borrower ?? args[1] ?? args[0]);
                if (borrower.toLowerCase() !== acctNorm) continue;
                const id = Number(args.loanId ?? args.id ?? args[0] ?? args[1]);
                temp[id] = {
                  id,
                  borrower,
                  amountWei: toBigIntSafe(args.amount ?? args[2] ?? 0n),
                  duration: toNumberSafe(args.duration ?? args[3] ?? 0),
                  purpose: toStringSafe(args.purpose ?? args[4] ?? ""),
                  status: 0,
                  dueDate: 0,
                };
              } else if (name === "LoanFunded" || name === "LoanApproved") {
                const id = Number(args.loanId ?? args.id ?? args[0] ?? args[1]);
                if (temp[id]) temp[id].status = 1;
              } else if (name === "LoanRepaid") {
                const id = Number(args.loanId ?? args.id ?? args[0] ?? args[1]);
                if (temp[id]) temp[id].status = 2;
              } else if (name === "LoanRejected") {
                const id = Number(args.loanId ?? args.id ?? args[0] ?? args[1]);
                if (temp[id]) temp[id].status = 3;
              }
            } catch {
              continue;
            }
          }
          const finalList = Object.values(temp).sort((a,b) => b.id - a.id);
          if (finalList.length > 0) {
            if (mounted) setLoans(finalList);
            setLoading(false);
            console.log("loans-list: loaded via event parsing, count=", finalList.length);
            return;
          }
        } catch (evErr) {
          console.warn("loans-list: events fallback failed:", evErr);
        }

        if (mounted) setErr("No loans found for this account.");
      } catch (e: any) {
        console.error("LoansList error:", e);
        if (mounted) setErr(e?.message || "Failed to load loans");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [account, contractAddress]);

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
          const b = statusBadge(loan.status);
          return (
            <div key={`${loan.borrower}-${loan.id}`} className="border rounded-lg p-4 hover:shadow-md transition">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Amount</h3>
                  <p className="text-lg font-semibold text-gray-900">
                    { ( (window as any).ethers ?? ethers ).formatEther(loan.amountWei) } ETH
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Duration</h3>
                  <p className="text-lg font-semibold text-gray-900">{loan.duration} days</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Purpose</h3>
                  <p className="text-lg font-semibold text-gray-900">{loan.purpose}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Status</h3>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${b.bg} ${b.color}`}>
                    {b.text}
                  </span>
                </div>
              </div>

              {Number(loan.status) === 1 && (
                <div className="mt-4 border-t pt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Due Date</h3>
                    <p className="text-lg font-semibold text-gray-900">
                      {loan.dueDate > 0 ? new Date(loan.dueDate * 1000).toLocaleDateString() : "—"}
                    </p>
                  </div>

                  <div>
                    <RepayLoan
                      loanId={loan.id}
                      amountWei={loan.amountWei}
                      borrower={loan.borrower}
                      account={account}
                      onSuccess={async () => {
                        try { window.location.reload(); } catch { /* ignore */ }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
