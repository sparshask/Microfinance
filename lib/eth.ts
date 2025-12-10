// lib/eth.ts
import { ethers } from "ethers";
import abi from "../contracts/abi/Microfinance.json";

export function getAddress() {
  const a = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!a) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS missing");
  return a;
}

export async function getProvider() {
  if (!window.ethereum) throw new Error("Install MetaMask.");
  return new ethers.BrowserProvider(window.ethereum);
}

export async function getSigner() {
  const p = await getProvider();
  return p.getSigner();
}

export async function getContract(withSigner = true) {
  const address = getAddress();
  const iface = (abi as any).abi ?? abi;
  if (withSigner) {
    const s = await getSigner();
    return new ethers.Contract(address, iface, s);
  }
  const p = await getProvider();
  return new ethers.Contract(address, iface, p);
}
