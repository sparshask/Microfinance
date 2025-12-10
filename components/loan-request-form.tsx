"use client";

import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";

declare global {
  interface Window {
    ethereum?: any;
  }
}

const ABI = [
  "function requestLoan(uint256 amount, uint256 duration, string calldata purpose) external",
] as const;

const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7"; // 11155111

export default function LoanRequestForm() {
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState("30");
  const [purpose, setPurpose] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- visual effects boot ---
  useEffect(() => {
    setIsVisible(true);
    const handleMouseMove = (e: MouseEvent) => {
      if (sectionRef.current) {
        const rect = sectionRef.current.getBoundingClientRect();
        setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const mouseXpercentage = (mousePosition.x / (sectionRef.current?.offsetWidth || 1)) * 100;
  const mouseYpercentage = (mousePosition.y / (sectionRef.current?.offsetHeight || 1)) * 100;

  // --- helpers ---
  function getAddressFromEnv(): string {
    const addr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
    if (!addr || !ethers.isAddress(addr)) {
      throw new Error(
        "Contract address missing or invalid. Set NEXT_PUBLIC_CONTRACT_ADDRESS in .env.local"
      );
    }
    return addr;
  }

  async function ensureSepolia(providerLike?: any) {
    if (!window.ethereum) return;
    try {
      const chainId = await window.ethereum.request({ method: "eth_chainId" });
      if (chainId?.toLowerCase() !== SEPOLIA_CHAIN_ID_HEX) {
        // try switch
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
        });
      }
    } catch (err) {
      // If the chain isn't added, you could prompt add here. For now, surface a friendly msg.
      console.warn("Network check/switch failed:", err);
      throw new Error("Please switch MetaMask to the Sepolia network and try again.");
    }
  }

  async function getContract() {
    if (!window.ethereum) throw new Error("Ethereum wallet not detected. Please install MetaMask.");
    const provider = new ethers.BrowserProvider(window.ethereum);
    await ensureSepolia();
    const signer = await provider.getSigner();
    const address = getAddressFromEnv();
    return new ethers.Contract(address, ABI, signer);
  }

  // --- actions ---
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    // basic validation
    if (!amount || !purpose || !duration) {
      setMessage({ type: "error", text: "Please fill out all fields." });
      return;
    }
    if (isNaN(Number(amount)) || Number(amount) <= 0) {
      setMessage({ type: "error", text: "Enter a valid loan amount greater than 0." });
      return;
    }
    if (isNaN(Number(duration)) || Number(duration) <= 0 || Number(duration) > 365) {
      setMessage({ type: "error", text: "Duration must be between 1 and 365 days." });
      return;
    }

    try {
      setIsSubmitting(true);
      const contract = await getContract();

      const amountInWei = ethers.parseEther(amount);
      const durationInDays = parseInt(duration);

      const tx = await contract.requestLoan(amountInWei, durationInDays, purpose);
      setMessage({ type: "success", text: "Submitting your loan request..." });

      await tx.wait();
      setMessage({ type: "success", text: "Loan request confirmed on the blockchain." });

      // reset
      setAmount("");
      setPurpose("");
      setDuration("30");
    } catch (error: any) {
      console.error("Error submitting loan request:", error);
      const readable =
        error?.reason ||
        error?.data?.message ||
        error?.message ||
        "Failed to submit loan request. Please try again.";
      setMessage({ type: "error", text: readable });
    } finally {
      setIsSubmitting(false);
    }
  }

  // --- UI ---
  return (
    <>
      <div className="bg-white text-gray-800">
        {/* Hero Section (green) */}
        <section
          ref={sectionRef}
          className="relative min-h-screen overflow-hidden flex flex-col items-center justify-center text-white text-center px-4 py-16 md:p-10"
          style={{ backgroundColor: "#1b5240" }}
        >
          {/* Mouse-following light */}
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              background: `radial-gradient(circle 400px at ${mouseXpercentage}% ${mouseYpercentage}%, rgba(255,255,255,0.15), transparent)`,
              transition: "background 0.2s",
            }}
          />

          {/* Floating particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            {Array(20)
              .fill(null)
              .map((_, i) => {
                const size = Math.random() * 16 + 8;
                return (
                  <div
                    key={i}
                    className="absolute rounded-full bg-white opacity-10 blur-sm"
                    style={{
                      width: `${size}px`,
                      height: `${size}px`,
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`,
                      animation: `floatX ${20 + Math.random() * 20}s ease-in-out ${
                        Math.random() * 5
                      }s infinite alternate, floatY ${25 + Math.random() * 20}s ease-in-out ${
                        Math.random() * 5
                      }s infinite alternate`,
                    }}
                  />
                );
              })}
          </div>

          {/* Title & text */}
          <div
            className="relative z-10 max-w-[1200px] mt-[100px] mx-auto px-4 sm:px-6 lg:px-8"
            style={{
              transform: `translate(${(mouseXpercentage - 50) / -30}px, ${
                (mouseYpercentage - 50) / -30
              }px)`,
              transition: "transform 0.5s ease-out",
            }}
          >
            <h1
              className={`text-4xl md:text-5xl lg:text-6xl font-bold mb-6 transition duration-1000 transform ${
                isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
              }`}
            >
              <span className="block">Empowering Our Farmers</span>
              <span className="block mt-2">through Decentralized Microfinance</span>
            </h1>

            <p
              className={`text-base sm:text-lg md:text-xl mb-8 transition duration-1000 delay-300 transform ${
                isVisible ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
              }`}
            >
              A blockchain-powered platform making financial services accessible, secure, and
              transparent.
            </p>
          </div>

          {/* Loan Request Card */}
          <section className="w-full px-4 sm:px-6 lg:px-8 mt-16">
            <div className="relative z-10 bg-white rounded-xl shadow-2xl p-4 sm:p-6 md:p-8 max-w-xl mx-auto animate-fade-in-up">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-center text-green-700 mb-6">
                Request a Loan
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4 md:space-y-6">
                <input
                  type="number"
                  placeholder="Amount (ETH)"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 border text-black border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-700 transition"
                />
                <input
                  type="number"
                  placeholder="Duration (days)"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 border text-black border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-700 transition"
                />
                <textarea
                  placeholder="Loan purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  disabled={isSubmitting}
                  rows={4}
                  className="w-full px-4 py-3 border text-black border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-700 transition"
                />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`w-full py-3 px-6 rounded-xl text-white font-bold text-lg transition duration-300 transform ${
                    isSubmitting ? "bg-gray-400 cursor-not-allowed" : "hover:scale-105 shadow-lg"
                  }`}
                  style={{ backgroundColor: isSubmitting ? undefined : "#1b5240" }}
                >
                  {isSubmitting ? "Submitting..." : "Request Loan"}
                </button>

                {message && (
                  <p
                    className={`text-center text-sm font-semibold ${
                      message.type === "error" ? "text-red-500" : "text-green-700"
                    }`}
                  >
                    {message.text}
                  </p>
                )}
              </form>
            </div>
          </section>
        </section>

        {/* Pricing strip */}
        <section className="py-20 px-10 text-center">
          <h2 className="text-3xl font-bold mb-6">Simple Pricing</h2>
          <p className="text-gray-600 mb-10">
            Only pay when your loan is funded. No hidden costs.
          </p>

          <div className="flex flex-col md:flex-row gap-8 justify-center">
            <div
              className="border rounded-xl p-8 w-full md:w-1/3 shadow-lg text-white"
              style={{ backgroundColor: "rgba(27, 82, 64, 0.8)" }}
            >
              <h3 className="text-xl font-bold mb-4">Borrower</h3>
              <p className="text-3xl font-bold mb-2">0.5% Platform Fee</p>
            </div>

            <div
              className="border rounded-xl p-8 w-full md:w-1/3 shadow-lg text-white"
              style={{ backgroundColor: "rgba(27, 82, 64, 0.8)" }}
            >
              <h3 className="text-xl font-bold mb-4">Lender</h3>
              <p className="text-3xl font-bold mb-2">1% Fee</p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-10 bg-black text-white text-center">
          <p>&copy; 2025 FieldFund. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
