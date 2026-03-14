import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
// NOTE: Temporarily not loading custom global CSS; rely on MUI defaults + CssBaseline.
// import "./globals.css";
// import "./app.css";

import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import EmotionCacheProvider from "./EmotionCacheProvider";
import MuiProviders from "./mui-providers";
import Nav from "./nav";
import QuickSearchBar from "./QuickSearchBarClient";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <NextIntlClientProvider messages={messages}>
          <EmotionCacheProvider>
            <MuiProviders>
              <Nav />
              <QuickSearchBar />
              {children}
            </MuiProviders>
          </EmotionCacheProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
