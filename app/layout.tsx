// app/layout.tsx
import "./global.css";
import { ReactNode } from "react";
import ClientEthersLoader from "../components/ClientEthersLoader";

export const metadata = {
  title: "Microfinance",
  description: "Microfinance DApp",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ClientEthersLoader />
      </body>
    </html>
  );
}
