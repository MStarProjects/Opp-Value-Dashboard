import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Opp Value Dashboard",
  description:
    "Client-side workbook reconciliation and portfolio analytics for the US Opp Value dashboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
