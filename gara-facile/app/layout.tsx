import type { Metadata } from "next";
import { Jost } from "next/font/google";
import { Suspense } from "react";
import { EvolusWidget } from "./components/evolus-widget";
import "./globals.css";

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Business profile | Gara Facile",
  description:
    "Build your business profile to find public tenders that match what you do.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jost.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Suspense fallback={null}>
          <EvolusWidget />
        </Suspense>
      </body>
    </html>
  );
}
