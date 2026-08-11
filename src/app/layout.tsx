import type { Metadata } from "next";
import Script from "next/script";
import "@fontsource/noto-sans-sc/300.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/700.css";
import "@fontsource/noto-serif-sc/400.css";
import "@fontsource/noto-serif-sc/600.css";
import "@fontsource/noto-serif-sc/700.css";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./globals.css";
import "./dialogs.css";
import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  title: "inkland — 同人创作社区",
  description: "一个干净、无广告、尊重阅读体验的同人创作社区。支持图文创作、标签搜索、段评互动。",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  alternates: { canonical: "/" },
  openGraph: {
    title: "inkland — 同人创作社区",
    description: "一个干净、无广告、尊重阅读体验的同人创作社区。",
    type: "website",
    siteName: "inkland",
    locale: "zh_CN",
  },
  twitter: { card: "summary_large_image", title: "inkland — 同人创作社区", description: "一个干净、无广告、尊重阅读体验的同人创作社区。" },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark")document.documentElement.setAttribute("data-theme","dark");else document.documentElement.setAttribute("data-theme","light");}catch(e){}})()`,
          }}
        />
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
