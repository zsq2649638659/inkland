import type { Metadata } from "next";
import Script from "next/script";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./globals.css";
import ClientLayout from "@/components/ClientLayout";

const notoSans = Noto_Sans_SC({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

const notoSerif = Noto_Serif_SC({
  variable: "--font-noto-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "墨者 — 同人创作社区",
  description: "一个干净、无广告、尊重阅读体验的同人创作社区。支持图文创作、标签搜索、段评互动。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${notoSans.variable} ${notoSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <Script
        id="theme-init"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark")document.documentElement.setAttribute("data-theme","dark");else document.documentElement.setAttribute("data-theme","light");}catch(e){}})()`,
        }}
      />
      <body className="min-h-full flex flex-col pt-14">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}