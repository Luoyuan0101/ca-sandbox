import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "元胞自动机沙盒 · 复杂系统的涌现实验室",
  description:
    "用元胞自动机模拟火灾蔓延与传染病传播。调整植被、湿度、风力、降雨与扑救策略，观察简单规则如何涌现出复杂现象。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
