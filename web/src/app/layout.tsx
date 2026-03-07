import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenPoster",
  description: "OpenPoster beta UI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <nav style={{ display: "flex", gap: 12, padding: 16, borderBottom: "1px solid #222" }}>
          <a href="/">Home</a>
          <a href="/browse">Browse</a>
          <a href="/creators">Creators</a>
          <a href="/connect">Connect node</a>
          <a href="/upload">Upload</a>
          <a href="/library">My library</a>
          <a href="/register">Register</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
