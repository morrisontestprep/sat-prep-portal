import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAT Prep Portal",
  description: "Assign and track SAT homework for students",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
