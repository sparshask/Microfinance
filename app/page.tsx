"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import DashboardPage from "../components/dashboard-page";
import "./page.css";

/** Small client-only helper that logs the inlined NEXT_PUBLIC env value */
function DebugLog() {
  useEffect(() => {
    // This will be inlined at build time by Next if NEXT_PUBLIC_CONTRACT_ADDRESS exists
    console.log("NEXT_PUBLIC_CONTRACT_ADDRESS (inlined):", process.env.NEXT_PUBLIC_CONTRACT_ADDRESS);
  }, []);
  return null; // no UI
}

export default function Home() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  useEffect(() => {
    const popup = searchParams.get("popup");
    setIsPopupOpen(popup === "open");
  }, [searchParams]);

  const openPopup = () => {
    router.push("?popup=open"); // push query param
  };

  const closePopup = () => {
    router.push("/"); // remove query param
  };

  return (
    <div className="relative min-h-screen">
      <DebugLog />
      <DashboardPage />
    </div>
  );
}
