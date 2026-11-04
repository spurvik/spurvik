import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Next.js chat example",
  description: "A small Next.js chat that wraps the Vercel AI SDK with Spurvik and shows an interaction notice.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
