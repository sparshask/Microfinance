// scripts/fundLoanNode.js
require("dotenv").config();
const { ethers } = require("ethers");
const microfinance = require("../artifacts/contracts/Microfinance.sol/Microfinance.json"); // or your ABI path

async function main() {
  const RPC = process.env.RPC_URL; // e.g. Sepolia RPC
  const PRIVATE_KEY = process.env.LENDER_PRIVATE_KEY; // lender's private key
  const CONTRACT = process.env.CONTRACT_ADDRESS;
  const LOAN_ID = Number(process.env.LOAN_ID || "0");

  const provider = new ethers.providers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(CONTRACT, microfinance.abi, wallet);

  const loan = await contract.getLoan(LOAN_ID);
  const amount = BigInt(loan[1].toString()); // amount in wei
  const lenderFeeBps = BigInt((await contract.lenderFeeBps()).toString());
  const lenderFee = (amount * lenderFeeBps) / 10000n;
  const required = amount + lenderFee;

  console.log("Funding loan:", LOAN_ID, "amount:", amount.toString(), "required:", required.toString());
  const tx = await contract.fundLoan(LOAN_ID, { value: required.toString() });
  console.log("Sent tx:", tx.hash);
  const rcpt = await tx.wait();
  console.log("Confirmed:", rcpt.transactionHash);
}

main().catch(console.error);
