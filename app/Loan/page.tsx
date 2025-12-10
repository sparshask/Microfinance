"use client";

import { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import LoansList from "../../components/loans-list";
import "./page.css";

export default function Profile() {
  const [account, setAccount] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [chainId, setChainId] = useState<string | null>(null);
  const [ethPresent, setEthPresent] = useState(false);
  const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "(not set)";

  useEffect(() => {
    if (typeof window === "undefined") return;

    const tryGetAccounts = async () => {
      setChecking(true);
      try {
        const win: any = window;
        setEthPresent(Boolean(win.ethereum));
        if (!win.ethereum) {
          console.warn("window.ethereum not found");
          setChecking(false);
          return;
        }

        // non-prompting check
        const accounts: string[] = await win.ethereum.request({
          method: "eth_accounts",
        }).catch((e: any) => {
          console.warn("eth_accounts failed:", e);
          return [];
        });

        console.debug("eth_accounts ->", accounts);
        if (accounts?.length) setAccount(accounts[0]);

        // try to get chainId
        const cId = await win.ethereum.request({ method: "eth_chainId" }).catch(() => null);
        if (cId) setChainId(cId);
        console.debug("chainId:", cId);

        // listen for account and chain changes while on page
        const handleAccounts = (accs: string[]) => {
          console.debug("accountsChanged ->", accs);
          setAccount(accs?.length ? accs[0] : null);
        };
        const handleChain = (id: string) => {
          console.debug("chainChanged ->", id);
          setChainId(id);
        };

        if (win.ethereum.on) {
          win.ethereum.on("accountsChanged", handleAccounts);
          win.ethereum.on("chainChanged", handleChain);
        }

        // cleanup listeners on unmount
        return () => {
          if (win.ethereum?.removeListener) {
            win.ethereum.removeListener("accountsChanged", handleAccounts);
            win.ethereum.removeListener("chainChanged", handleChain);
          }
        };
      } catch (err) {
        console.error("tryGetAccounts error:", err);
      } finally {
        setChecking(false);
      }
    };

    tryGetAccounts();
  }, []);

  const connectWallet = async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) {
      alert("No Ethereum provider found. Install MetaMask or another wallet.");
      return;
    }
    try {
      const accounts: string[] = await (window as any).ethereum.request({
        method: "eth_requestAccounts",
      });
      console.debug("eth_requestAccounts ->", accounts);
      if (accounts?.length) setAccount(accounts[0]);
      const cId = await (window as any).ethereum.request({ method: "eth_chainId" }).catch(() => null);
      if (cId) setChainId(cId);
    } catch (e: any) {
      console.error("Wallet connect error:", e);
    }
  };

  const shortAccount = (addr: string | null) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "");

  return (
    <div className="relative min-h-screen">
      <div className="absolute inset-0 -z-10 animated-green-gradient" />

      <Navbar />

      <div className="w-[80%] mx-[10%] py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">My Profile</h1>

          <div>
            {checking ? (
              <div className="bg-white/10 text-white px-4 py-2 rounded-md text-sm">Checking...</div>
            ) : account ? (
              <div className="flex items-center gap-3">
                <div className="bg-emerald-600 text-white px-4 py-2 rounded-md font-medium text-sm">Connected</div>
                <div className="bg-white/10 text-white px-3 py-1 rounded-md font-mono text-sm">
                  {shortAccount(account)}
                </div>
              </div>
            ) : (
              <button onClick={connectWallet} className="bg-emerald-600 text-white px-4 py-2 rounded-md hover:opacity-95">
                Connect Wallet
              </button>
            )}
          </div>
        </div>

        {/* ===== Diagnostics panel (visible to help debugging) ===== */}
        

        {/* White card containing loans (LoansList will render when it can) */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <LoansList account={account} />
          {/* Helpful fallback while debugging */}
          {!account && (
            <div className="text-center text-gray-600 py-8">
              Connect your wallet to view loans.
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .animated-green-gradient {
          background: linear-gradient(135deg, #1b5240 0%, #2f6f5a 35%, #87cbb1 65%, #cfeee5 100%);
          background-size: 200% 200%;
          animation: gradientShift 18s ease-in-out infinite;
        }
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animated-green-gradient { animation: none; background-position: 50% 50%; }
        }
      `}</style>
    </div>
  );
}
