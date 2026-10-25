import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import Navbar from "./components/Navbar";
import SyncUser from "./components/SyncUser";
import ThemeProvider from "./components/ThemeProvider";
import { UserDataProvider } from "./contexts/UserDataContext";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Zugzwang",
  description: "Rated real-time chess, a leaderboard, and an explorer built from the games played here.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <UserDataProvider>
        <html lang="en">
          <body className={`${archivo.variable} ${jetbrains.variable} min-h-screen antialiased`}>
            <ThemeProvider>
              <Navbar />
              <SyncUser />
              {children}
            </ThemeProvider>
          </body>
        </html>
      </UserDataProvider>
    </ClerkProvider>
  );
}
