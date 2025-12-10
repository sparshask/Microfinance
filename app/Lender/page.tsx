"use client";

import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import Navbar from "../../components/Navbar";
import microfinance from "../../contracts/abi/Microfinance.json";

declare global {
  interface Window {
    ethereum?: any;
  }
}

type LoanRow = {
  id: number;
  borrower: string;
  amountEth: string; // human string (ethers.formatEther)
  amountWei: bigint;
  duration: number;
  purpose: string;
  status: number; // 0 pending, 1 funded, 2 repaid, 3 rejected
  dueDate: number; // unix seconds
  lender: string;
};

const SEPOLIA_CHAIN_ID = 11155111n;

export default function LenderDashboard() {
  const [account, setAccount] = useState<string | null>(null);
  const [providerReady, setProviderReady] = useState(false);
  const [isSepolia, setIsSepolia] = useState(false);
  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";

  // init provider & network check
  const initProvider = useCallback(async () => {
    setError(null);
    try {
      if (!window.ethereum) {
        setProviderReady(false);
        setIsSepolia(false);
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      // chainId is bigint in ethers v6
      setProviderReady(true);
      setIsSepolia((network.chainId ?? 0n) === SEPOLIA_CHAIN_ID);
    } catch (err: any) {
      console.error("initProvider error:", err);
      setProviderReady(false);
      setIsSepolia(false);
      setError(String(err?.message ?? err));
    }
  }, []);

  // connect lender wallet (request accounts)
  const connectWallet = useCallback(async () => {
    setError(null);
    try {
      if (!window.ethereum) throw new Error("No wallet provider found (install Metamask/Rabby).");

      const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) throw new Error("No accounts returned");
      setAccount(accounts[0]);
      // re-init (network/state)
      await initProvider();
    } catch (err: any) {
      console.error("connectWallet:", err);
      setError(err?.message || String(err));
    }
  }, [initProvider]);

  // "Disconnect" (UI-only)
  const disconnectWallet = () => {
    setAccount(null);
    setLoans([]);
    setError(null);
  };

  // Switch account (re-prompt wallet account chooser)
  const switchAccount = async () => {
    setError(null);
    try {
      if (!window.ethereum) throw new Error("No wallet provider found");
      const accounts: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) throw new Error("No accounts returned");
      setAccount(accounts[0]);
      await initProvider();
      // optionally fetch loans for this account
      await fetchLoans();
    } catch (err: any) {
      console.error("switchAccount:", err);
      setError(err?.message || String(err));
    }
  };

  // fetchLoans: loads all loans from contract (for lender view we show all loans)
  const fetchLoans = useCallback(async () => {
    setError(null);
    setLoading(true);
    setLoans([]);
    try {
      if (!contractAddress) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS not set");
      if (!window.ethereum) throw new Error("No provider (window.ethereum)");
      const provider = new ethers.BrowserProvider(window.ethereum);

      // quick network check
      const net = await provider.getNetwork();
      if ((net.chainId ?? 0n) !== SEPOLIA_CHAIN_ID) {
        setIsSepolia(false);
        throw new Error(`Please switch wallet network to Sepolia (current chainId=${net.chainId})`);
      } else {
        setIsSepolia(true);
      }

      // contract read-only
      const contract = new ethers.Contract(contractAddress, (microfinance as any).abi, provider);

      // We expect getLoanCount() and getLoan(uint256) exist
      const countBn: bigint = await contract.getLoanCount();
      const count = Number(countBn);

      const out: LoanRow[] = [];
      for (let i = 0; i < count; i++) {
        const row: any = await contract.getLoan(i);
        // contract.getLoan returns tuple (borrower, amount, duration, purpose, status, dueDate, lender)
        // handle both named fields and tuple indices defensively
        const borrower = String(row.borrower ?? row[0] ?? "0x0");
        const amountWei = (() => {
          const v = row.amount ?? row[1] ?? 0n;
          try {
            return BigInt(v.toString());
          } catch {
            return 0n;
          }
        })();
        const amountEth = ethers.formatEther(amountWei);
        const duration = Number(row.duration ?? row[2] ?? 0);
        const purpose = String(row.purpose ?? row[3] ?? "");
        const status = Number(row.status ?? row[4] ?? 0);
        const dueDate = Number(row.dueDate ?? row[5] ?? 0);
        const lenderAddr = String(row.lender ?? row[6] ?? "0x0000000000000000000000000000000000000000");

        out.push({
          id: i,
          borrower,
          amountEth,
          amountWei,
          duration,
          purpose,
          status,
          dueDate,
          lender: lenderAddr,
        });
      }

      // newest first
      out.reverse();
      setLoans(out);
    } catch (err: any) {
      console.error("fetchLoans:", err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [contractAddress]);

  // fundLoan (lender accepts) -> call contract.fundLoan(loanId) with correct value
  const fundLoan = async (loanId: number, amountWei: bigint) => {
    setActionLoading(loanId);
    setError(null);
    try {
      if (!window.ethereum) throw new Error("No wallet provider found");
      if (!contractAddress) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS not set");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, (microfinance as any).abi, signer);

      // read lender fee bps
      const lenderFeeBps: bigint = await contract.lenderFeeBps();
      // amountWei is bigint already
      const lenderFee = (amountWei * BigInt(lenderFeeBps)) / 10000n;
      const totalValue = amountWei + lenderFee;

      const tx = await contract.fundLoan(loanId, { value: totalValue });
      setError("Waiting for transaction confirmation...");
      await tx.wait();
      setError(null);
      // refresh loans
      await fetchLoans();
    } catch (err: any) {
      console.error("fundLoan:", err);
      setError(err?.message ?? String(err));
    } finally {
      setActionLoading(null);
    }
  };

  // rejectLoan -> owner-only onchain
  const rejectLoan = async (loanId: number) => {
    setActionLoading(loanId);
    setError(null);
    try {
      if (!window.ethereum) throw new Error("No wallet provider found");
      if (!contractAddress) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS not set");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, (microfinance as any).abi, signer);

      const tx = await contract.rejectLoan(loanId);
      setError("Waiting for transaction confirmation...");
      await tx.wait();
      setError(null);
      await fetchLoans();
    } catch (err: any) {
      console.error("rejectLoan:", err);
      setError(err?.message ?? String(err));
    } finally {
      setActionLoading(null);
    }
  };

  // Listen for account / chain changes to keep UI in sync
  useEffect(() => {
    if (!window.ethereum) return;

    const onAccounts = (accounts: string[]) => {
      if (!accounts || accounts.length === 0) {
        setAccount(null);
      } else {
        setAccount(accounts[0]);
      }
    };
    const onChainChanged = async (_chainIdHex: string) => {
      // re-init provider + refresh loans
      await initProvider();
      // if account present, attempt to fetch loans (but only if Sepolia)
      if (account) {
        try {
          await fetchLoans();
        } catch {
          /* ignore */
        }
      }
    };

    window.ethereum.on?.("accountsChanged", onAccounts);
    window.ethereum.on?.("chainChanged", onChainChanged);

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccounts);
      window.ethereum?.removeListener?.("chainChanged", onChainChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, fetchLoans, initProvider]);

  // initial
  useEffect(() => {
    initProvider();
  }, [initProvider]);

  // fetch loans if account connected and network OK
  useEffect(() => {
    if (!account) return;
    (async () => {
      await initProvider();
      if (isSepolia) {
        await fetchLoans();
      }
    })();
  }, [account, fetchLoans, initProvider, isSepolia]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1b5240] via-[#2f6f5a] to-[#cfeee5] text-white">
      <Navbar />

      <div className="container mx-auto px-4 py-10 pt-20">
        <h1 className="text-3xl font-bold mb-6 text-center">Lender Dashboard</h1>

        {/* Top card: provider / account controls */}
        <div className="bg-white text-gray-800 rounded-xl shadow p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-gray-500">Lender provider</div>
              <div className="flex items-center gap-4 mt-2">
                <button
                  className={`px-4 py-2 rounded text-white ${
                    providerReady ? (isSepolia ? "bg-green-600" : "bg-yellow-600") : "bg-gray-500"
                  }`}
                  aria-hidden
                >
                  {providerReady ? (isSepolia ? "Connected" : "Connected (wrong network)") : "No provider"}
                </button>

                <div className="font-mono text-sm">{account ?? "not connected"}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!account ? (
                <button
                  onClick={connectWallet}
                  className="px-4 py-2 bg-[#1b5240] hover:opacity-90 text-white rounded shadow text-sm"
                >
                  Connect Lender Wallet
                </button>
              ) : (
                <>
                  <button
                    onClick={switchAccount}
                    className="px-4 py-2 bg-gray-100 rounded shadow text-sm"
                  >
                    Switch Account
                  </button>

                  <button
                    onClick={disconnectWallet}
                    className="px-4 py-2 bg-red-100 text-red-700 rounded shadow text-sm"
                  >
                    Disconnect
                  </button>
                </>
              )}

              <button onClick={() => fetchLoans()} className="px-4 py-2 bg-gray-100 rounded shadow text-sm">Refresh</button>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded bg-red-100 text-red-700">
              {error}
            </div>
          )}

          {!isSepolia && providerReady && (
            <div className="mt-4 p-3 rounded bg-yellow-50 text-yellow-800">
              Please switch your wallet to Sepolia. Your wallet's network must be Sepolia to interact with the deployed contract.
            </div>
          )}
        </div>

        {/* Loans list */}
        <div className="bg-white text-gray-800 rounded-xl shadow p-6">
          {loading ? (
            <div className="text-center py-12">Loading loans…</div>
          ) : loans.length === 0 ? (
            <div className="text-center py-12">No loans found on contract.</div>
          ) : (
            <div className="space-y-4">
              {loans.map((loan) => (
                <div key={loan.id} className="border rounded p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Borrower</div>
                    <div className="font-mono">{loan.borrower}</div>
                    <div className="text-sm text-gray-500 mt-2">Purpose</div>
                    <div>{loan.purpose}</div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm text-gray-500">Amount</div>
                    <div className="text-xl font-semibold">{loan.amountEth} ETH</div>
                    <div className="text-sm text-gray-500 mt-2">Duration</div>
                    <div>{loan.duration} days</div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div
                      className="px-3 py-1 rounded text-sm"
                      style={{
                        background: loan.status === 0 ? "#fef3c7" : loan.status === 1 ? "#dcfce7" : "#fee2e2",
                        color: loan.status === 0 ? "#92400e" : loan.status === 1 ? "#166534" : "#991b1b",
                      }}
                    >
                      {loan.status === 0 ? "Pending" : loan.status === 1 ? "Approved" : loan.status === 2 ? "Repaid" : "Rejected"}
                    </div>

                    {loan.status === 0 && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => fundLoan(loan.id, loan.amountWei)}
                          disabled={actionLoading === loan.id}
                          className={`px-4 py-2 rounded text-white ${actionLoading === loan.id ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"}`}
                        >
                          {actionLoading === loan.id ? "Processing..." : "Accept (Fund)"}
                        </button>
                        <button
                          onClick={() => rejectLoan(loan.id)}
                          disabled={actionLoading === loan.id}
                          className={`px-4 py-2 rounded text-white ${actionLoading === loan.id ? "bg-gray-400" : "bg-red-600 hover:bg-red-700"}`}
                        >
                          {actionLoading === loan.id ? "Processing..." : "Reject"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
