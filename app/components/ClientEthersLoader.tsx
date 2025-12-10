// app/components/ClientEthersLoader.tsx
"use client";

import { useEffect } from "react";

// This component runs only in the browser and:
// 1) dynamically imports ethers and attaches it to window.ethers
// 2) imports the compiled ABI JSON and attaches ABI array to window.__MICROFINANCE_ABI__
export default function ClientEthersLoader() {
  useEffect(() => {
    (async () => {
      try {
        if (!(window as any).ethers) {
          const ethers = await import("ethers");
          (window as any).ethers = ethers;
          console.log("✅ window.ethers set");
        } else {
          console.log("✅ window.ethers already present");
        }
      } catch (err) {
        console.warn("⚠️ Failed to load ethers dynamically:", err);
      }

      try {
        // IMPORTANT: this path must match where your ABI file lives in the compiled artifacts
        const mod = await import("../../artifacts/contracts/Microfinance.sol/Microfinance.json");
        // The HH artifact shape has `.abi`
        (window as any).__MICROFINANCE_ABI__ = mod.abi ?? mod.default?.abi ?? mod;
        console.log("✅ window.__MICROFINANCE_ABI__ set (length):", (window as any).__MICROFINANCE_ABI__?.length ?? "unknown");
      } catch (err) {
        console.warn("⚠️ Failed to load ABI JSON from artifacts:", err);
      }
    })();
  }, []);

  return null;
}
