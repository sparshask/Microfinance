"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { ethers } from "ethers";

const Navbar = dynamic(() => import("../../components/Navbar"), { ssr: false });

declare global {
  interface Window { ethereum?: any; }
}

type LoanRow = {
  id: number;
  borrower: string;
  amountEth: string;
  amountWei: bigint;
  duration: number;
  purpose: string;
  status: number;
  dueDate: number;
  lender: string;
};

const SEPOLIA_CHAIN_ID = 11155111n;

export default function LenderDashboard() {
  const [account, setAccount] = useState<string | null>(null);
  const [providerReady, setProviderReady] = useState(false);
  const [isSepolia, setIsSepolia] = useState(false);
  const [networkId, setNetworkId] = useState<string | null>(null);

  const [loans, setLoans] = useState<LoanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contractAddress = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "").toLowerCase();

  const contractRef = useRef<any | null>(null);

  // initialize provider + network
  const initProvider = useCallback(async () => {
    setError(null);
    try {
      if (!window.ethereum) {
        setProviderReady(false);
        setIsSepolia(false);
        return;
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const net = await provider.getNetwork();
      setProviderReady(true);
      setIsSepolia((net.chainId ?? 0n) === SEPOLIA_CHAIN_ID);
      setNetworkId(String(net.chainId ?? "0"));
    } catch (err: any) {
      console.error("initProvider error:", err);
      setProviderReady(false);
      setIsSepolia(false);
      setError(String(err?.message ?? err));
    }
  }, []);

  // fetch loans (reads from chain)
  const fetchLoans = useCallback(async () => {
    setError(null);
    setLoading(true);
    setLoans([]);
    try {
      if (!contractAddress) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS not set");
      if (!window.ethereum) throw new Error("No provider available");

      // dynamic ABI import
      const mod = await import("../../contracts/abi/Microfinance.json");
      const microfinanceAbi = (mod as any).default ?? mod;

      const provider = new ethers.BrowserProvider(window.ethereum);
      const net = await provider.getNetwork();
      setNetworkId(String(net.chainId ?? "0"));

      if ((net.chainId ?? 0n) !== SEPOLIA_CHAIN_ID) {
        setIsSepolia(false);
        throw new Error("Please switch wallet to Sepolia.");
      } else {
        setIsSepolia(true);
      }

      const contract = new ethers.Contract(contractAddress, microfinanceAbi.abi ?? microfinanceAbi, provider);
      // store contract instance to ref for later (events might be attached elsewhere)
      contractRef.current = contract;

      const countBn: any = await contract.getLoanCount();
      const total = Number(countBn ?? 0);
      const out: LoanRow[] = [];
      for (let i = 0; i < total; i++) {
        try {
          const row: any = await contract.getLoan(i);
          const borrower = String(row.borrower ?? row[0] ?? "0x0");
          const amountWei = BigInt((row.amount ?? row[1] ?? 0n).toString());
          const amountEth = ethers.formatEther(amountWei);
          const duration = Number(row.duration ?? row[2] ?? 0);
          const purpose = String(row.purpose ?? row[3] ?? "");
          const status = Number(row.status ?? row[4] ?? 0);
          const dueDate = Number(row.dueDate ?? row[5] ?? 0);
          const lenderAddr = String(row.lender ?? row[6] ?? "0x0");
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
        } catch (e) {
          // skip individual row error
          console.warn("getLoan error for index", i, e);
        }
      }
      out.reverse();
      setLoans(out);
    } catch (err: any) {
      console.error("fetchLoans:", err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [contractAddress]);

  // fund loan (unchanged)
  const fundLoan = async (loanId: number, amountWei: bigint) => {
    setActionLoading(loanId);
    setError(null);
    try {
      if (!window.ethereum) throw new Error("No wallet provider found");
      if (!contractAddress) throw new Error("Contract address missing");
      const mod = await import("../../contracts/abi/Microfinance.json");
      const microfinanceAbi = (mod as any).default ?? mod;
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, microfinanceAbi.abi ?? microfinanceAbi, signer);

      const lenderFeeBps: bigint = await contract.lenderFeeBps();
      const lenderFee = (amountWei * BigInt(lenderFeeBps)) / 10000n;
      const totalValue = amountWei + lenderFee;

      const tx = await contract.fundLoan(loanId, { value: totalValue });
      setError("Waiting for transaction confirmation...");
      await tx.wait();
      setError(null);
      await fetchLoans();
    } catch (err: any) {
      console.error("fundLoan:", err);
      setError(err?.message ?? String(err));
    } finally {
      setActionLoading(null);
    }
  };

  // rejectLoan: on-chain call — wallet popup is expected because this is permanent
  const rejectLoan = async (loanId: number) => {
    setActionLoading(loanId);
    setError(null);
    try {
      if (!window.ethereum) throw new Error("No wallet provider found");
      if (!contractAddress) throw new Error("Contract address missing");
      const mod = await import("../../contracts/abi/Microfinance.json");
      const microfinanceAbi = (mod as any).default ?? mod;
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(contractAddress, microfinanceAbi.abi ?? microfinanceAbi, signer);

      const tx = await contract.rejectLoan(loanId); // permissionless if contract updated
      setError("Waiting for transaction confirmation...");
      await tx.wait();
      setError(null);

      // force a global refetch
      await fetchLoans();

      // also emit a DOM event so other UI pieces who don't listen to contract events can refresh immediately
      try {
        window.dispatchEvent(new Event("loanStatusChanged"));
      } catch {}
    } catch (err: any) {
      console.error("rejectLoan:", err);
      setError(err?.message ?? String(err));
    } finally {
      setActionLoading(null);
    }
  };

  // attach event listener for contract events (so Lender page also updates when other people change loans)
  useEffect(() => {
    let mounted = true;
    let contractInstance: any = null;

    (async () => {
      try {
        if (!window.ethereum || !contractAddress) return;
        const mod = await import("../../contracts/abi/Microfinance.json");
        const microfinanceAbi = (mod as any).default ?? mod;
        const provider = new ethers.BrowserProvider(window.ethereum);
        contractInstance = new ethers.Contract(contractAddress, microfinanceAbi.abi ?? microfinanceAbi, provider);

        const onLoanRejected = async (loanId: any, borrower: any) => {
          console.debug("Event LoanRejected", loanId?.toString?.());
          if (!mounted) return;
          await fetchLoans().catch(() => {});
        };
        const onLoanFunded = async () => { if (!mounted) return; await fetchLoans().catch(() => {}); };
        const onLoanRepaid = async () => { if (!mounted) return; await fetchLoans().catch(() => {}); };

        // attach
        contractInstance.on?.("LoanRejected", onLoanRejected);
        contractInstance.on?.("LoanFunded", onLoanFunded);
        contractInstance.on?.("LoanRepaid", onLoanRepaid);

        // save ref for cleanup & possible reuse
        contractRef.current = contractInstance;
      } catch (e) {
        console.warn("attach events failed:", e);
      }
    })();

    return () => {
      mounted = false;
      try {
        if (contractInstance?.removeListener) {
          contractInstance.removeListener("LoanRejected");
          contractInstance.removeListener("LoanFunded");
          contractInstance.removeListener("LoanRepaid");
        }
      } catch (e) {}
    };
  }, [contractAddress, fetchLoans]);

  // wallet accounts / chain change handling
  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = (accounts: string[]) => {
      setAccount(accounts?.length ? accounts[0] : null);
    };
    const onChainChanged = async () => {
      await initProvider();
      if (account) await fetchLoans().catch(() => {});
    };
    window.ethereum.on?.("accountsChanged", onAccounts);
    window.ethereum.on?.("chainChanged", onChainChanged);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccounts);
      window.ethereum?.removeListener?.("chainChanged", onChainChanged);
    };
  }, [account, fetchLoans, initProvider]);

  // auto init once
  useEffect(() => { initProvider(); }, [initProvider]);

  // fetch loans when account+network ok
  useEffect(() => {
    if (!account) return;
    (async () => {
      await initProvider();
      if (isSepolia) await fetchLoans();
    })();
  }, [account, fetchLoans, initProvider, isSepolia]);

  // render
  const visibleLoans = loans; // On lender page we show all loans (we're not filtering by owed status)

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1b5240] via-[#2f6f5a] to-[#cfeee5] text-white">
      <Navbar />

      <div className="container mx-auto px-4 py-10 pt-20">
        <h1 className="text-3xl font-bold mb-6 text-center">Lender Dashboard</h1>

        <div className="bg-white text-gray-800 rounded-xl shadow p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <div className="text-sm text-gray-500">Lender provider</div>
              <div className="flex items-center gap-4 mt-2">
                <button className={`px-4 py-2 rounded text-white ${providerReady ? (isSepolia ? "bg-green-600" : "bg-yellow-600") : "bg-gray-500"}`} aria-hidden>
                  {providerReady ? (isSepolia ? "Connected" : "Connected (wrong network)") : "No provider"}
                </button>
                <div className="font-mono text-sm">{account ?? "not connected"}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {!account ? (
                <button onClick={async () => {
                  try {
                    if (!window.ethereum) throw new Error("No wallet provider");
                    const accs: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
                    setAccount(accs?.length ? accs[0] : null);
                    await initProvider();
                  } catch (e:any) { setError(e.message || String(e)); }
                }} className="px-4 py-2 bg-[#1b5240] hover:opacity-90 text-white rounded shadow text-sm">Connect Lender Wallet</button>
              ) : (
                <>
                  <button onClick={async () => {
                    try {
                      if (!window.ethereum) throw new Error("No wallet provider");
                      const accs: string[] = await window.ethereum.request({ method: "eth_requestAccounts" });
                      setAccount(accs?.length ? accs[0] : null);
                      await initProvider();
                      await fetchLoans();
                    } catch (e:any) { setError(e.message || String(e)); }
                  }} className="px-4 py-2 bg-gray-100 rounded shadow text-sm">Switch Account</button>

                  <button onClick={() => { setAccount(null); setLoans([]); setError(null); }} className="px-4 py-2 bg-red-100 text-red-700 rounded shadow text-sm">Disconnect</button>
                </>
              )}

              <button onClick={() => fetchLoans()} className="px-4 py-2 bg-gray-100 rounded shadow text-sm">Refresh</button>
            </div>
          </div>

          {error && <div className="mt-4 p-3 rounded bg-red-100 text-red-700">{error}</div>}
          {!isSepolia && providerReady && <div className="mt-4 p-3 rounded bg-yellow-50 text-yellow-800">Please switch your wallet to Sepolia.</div>}
        </div>

        <div className="bg-white text-gray-800 rounded-xl shadow p-6">
          {loading ? (
            <div className="text-center py-12">Loading loans…</div>
          ) : visibleLoans.length === 0 ? (
            <div className="text-center py-12">No loans found.</div>
          ) : (
            <div className="space-y-4">
              {visibleLoans.map(loan => (
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
                    <div className="px-3 py-1 rounded text-sm" style={{
                      background: loan.status === 0 ? "#fef3c7" : loan.status === 1 ? "#dcfce7" : "#fee2e2",
                      color: loan.status === 0 ? "#92400e" : loan.status === 1 ? "#166534" : "#991b1b",
                    }}>
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
