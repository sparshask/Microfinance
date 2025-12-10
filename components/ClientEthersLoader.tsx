// components/ClientEthersLoader.tsx
"use client";

import { useEffect } from "react";
import microfinance from "../contracts/Microfinance.json"; // <-- make sure this file exists (see steps below)

export default function ClientEthersLoader() {
  useEffect(() => {
    // load ethers in the browser and expose safely
    import("ethers")
      .then((ethersModule) => {
        // expose ethers, but do NOT touch window.ethereum
        (window as any).ethers = ethersModule;
        console.log("✅ window.ethers set");

        // expose ABI (so frontend doesn't fetch a trimmed ABI by accident)
        (window as any).__MICROFINANCE_ABI__ = microfinance.abi || microfinance;
        console.log("✅ window.__MICROFINANCE_ABI__ set (length):", (window as any).__MICROFINANCE_ABI__?.length);

        // also surface the contract address env var on window for quick console tests
        (window as any).NEXT_PUBLIC_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
      })
      .catch((err) => {
        console.warn("⚠️ Failed to load ethers:", err);
      });
  }, []);

  return null;
}
