import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gift Inventory Sync",
  description: "쇼핑몰 구매 이력 기반 선물 관리 애플리케이션",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
