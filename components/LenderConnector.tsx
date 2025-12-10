// components/LenderConnector.tsx
"use client";

import React, { useEffect, useState } from "react";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export type ProviderEntry = {
  id: string;
  name: string;
  provider: any;
};

export default function LenderConnector({
  onConnect,
}: {
  onConnect?: (account: string, provider: any) => void;
}) {
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) {
      setProviders([]);
      return;
    }

    if (Array.isArray(eth.providers) && eth.providers.length > 0) {
      const list = eth.providers.map((p: any, i: number) => {
        const name =
          (p.isMetaMask && "MetaMask") ||
          (p.isRabby && "Rabby") ||
          (p.isBraveWallet && "Brave Wallet") ||
          (p.isFrame && "Frame") ||
          `Provider ${i + 1}`;
        return { id: `${i}`, name, provider: p } as ProviderEntry;
      });
      setProviders(list);
      setSelectedId(list[0].id);
    } else {
      const name =
        (eth.isMetaMask && "MetaMask") ||
        (eth.isRabby && "Rabby") ||
        (eth.isBraveWallet && "Brave Wallet") ||
        "Injected Wallet";
      setProviders([{ id: "0", name, provider: eth }]);
      setSelectedId("0");
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const sel = providers.find((p) => p.id === selectedId);
    if (!sel) return;
    const p = sel.provider;
    const handler = (accounts: string[]) => {
      setAccount(accounts && accounts.length ? accounts[0] : null);
      if (accounts && accounts.length && onConnect) onConnect(accounts[0], p);
    };
    try {
      p.on?.("accountsChanged", handler);
    } catch {}
    return () => {
      try {
        p.removeListener?.("accountsChanged", handler);
      } catch {}
    };
  }, [providers, selectedId, onConnect]);

  const connect = async () => {
    setError(null);
    setConnecting(true);
    try {
      if (!selectedId) throw new Error("No provider selected");
      const sel = providers.find((p) => p.id === selectedId);
      if (!sel) throw new Error("Selected provider not found");
      const p = sel.provider;
      const accounts: string[] = await p.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) throw new Error("No accounts returned");
      const acct = accounts[0];
      setAccount(acct);
      if (onConnect) onConnect(acct, p);
    } catch (err: any) {
      setError(err?.message || String(err));
      console.error("LenderConnector connect error:", err);
    } finally {
      setConnecting(false);
    }
  };

  if (!providers.length) {
    return (
      <div className="p-4">
        <div className="text-sm text-red-600">
          No injected wallet found. Install MetaMask / Rabby / Brave Wallet.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-2 text-sm text-gray-600">Lender provider</div>

      {providers.length > 1 && (
        <select
          value={selectedId ?? ""}
          onChange={(e) => setSelectedId(e.target.value)}
          className="border px-3 py-1 rounded mb-2"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={connect}
          className={`px-4 py-2 rounded ${account ? "bg-green-600 text-white" : "bg-[#1b5240] text-white"}`}
          disabled={connecting}
        >
          {account ? "Connected" : connecting ? "Connecting..." : "Connect Lender Wallet"}
        </button>

        <div className="text-sm font-mono">{account ?? <span className="text-gray-500">Not connected</span>}</div>
      </div>

      {error && <div className="mt-2 text-red-600">{error}</div>}
    </div>
  );
}
