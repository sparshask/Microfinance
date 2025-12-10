"use client";
import { ethers } from "ethers";
import { useState, useEffect } from "react";
import LoanRequestForm from "./loan-request-form";
import Navbar from "./Navbar";

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function Dashboard() {
  const [account, setAccount] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const getAccount = () => account;

  const checkWalletConnection = async () => {
    setIsLoading(true);
    try {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.listAccounts();

        if (accounts.length > 0) {
          setAccount(accounts[0].address);
          setIsConnected(true);
        } else {
          setIsConnected(false);
          setAccount(null);
        }
      }
    } catch (error) {
      console.error("Wallet check failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const connectWallet = async () => {
    try {
      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        setAccount(accounts[0]);
        setIsConnected(true);
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    }
  };

  useEffect(() => {
    checkWalletConnection();
  }, []);

  return (
    <div className="dashboard bg-gradient-to-bl from-[#1b5240] via-[#2f6f5a] to-[#cfeee5] min-h-screen">
      <Navbar />
      <LoanRequestForm />
    </div>
  );
}
