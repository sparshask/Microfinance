"use client";
import React, { useState } from "react";
import Navbar from "../../components/Navbar";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Signup functionality coming soon!");
  };

  return (
    <>
      <Navbar /> {/* ✅ Navbar stays on top */}
      <div
        className="
          relative flex items-center justify-center min-h-screen overflow-hidden pt-16
          bg-gradient-to-br from-[#1b5240] via-[#2f6f5a] to-[#cfeee5]
        "
      >
        {/* Signup Card */}
        <div className="relative z-10 w-[90%] max-w-md p-8 bg-white/15 rounded-2xl shadow-2xl backdrop-blur-md border border-white/20">
          <h2 className="text-3xl font-bold text-center text-white mb-6">
            Create an Account
          </h2>

          <form onSubmit={handleSignup}>
            <input
              type="text"
              placeholder="Full Name"
              className="w-full px-4 py-2 mb-4 border border-white/30 bg-white/70 text-black rounded-xl focus:ring-2 focus:ring-emerald-300"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              type="text"
              placeholder="Username"
              className="w-full px-4 py-2 mb-4 border border-white/30 bg-white/70 text-black rounded-xl focus:ring-2 focus:ring-emerald-300"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />

            <input
              type="password"
              placeholder="Password"
              className="w-full px-4 py-2 mb-6 border border-white/30 bg-white/70 text-black rounded-xl focus:ring-2 focus:ring-emerald-300"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              type="submit"
              className="w-full px-4 py-2 font-semibold text-white transition-transform bg-emerald-700 rounded hover:bg-emerald-800 hover:scale-105 shadow-md"
            >
              Sign Up
            </button>
          </form>

          {/* Login Redirect */}
          <div className="mt-6 text-center text-sm text-emerald-50">
            Already have an account?{" "}
            <a href="/Lender" className="text-emerald-200 hover:underline">
              Log in
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
