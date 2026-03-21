import type { Metadata } from "next";
import { Roboto } from "next/font/google";

import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

import EmotionCacheProvider from "./EmotionCacheProvider";
import MuiProviders from "./mui-providers";
import Nav from "./nav";
import PosterSizeBootstrap from "./PosterSizeBootstrap";

const roboto = Roboto({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OpenPoster",
  description: "OpenPoster beta UI",
  icons: { icon: "/favicon.svg" },
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
      <body className={roboto.className}>
        <NextIntlClientProvider messages={messages}>
          <EmotionCacheProvider>
            <MuiProviders>
              <PosterSizeBootstrap />
              <Nav />
              {children}
            </MuiProviders>
          </EmotionCacheProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
