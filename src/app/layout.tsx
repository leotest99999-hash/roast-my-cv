import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/ui/themes";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "RoastMyCV",
  description:
    "Upload a PDF resume, get a brutally funny but useful roast for free, then unlock unlimited roasts, rewrites, and cover letters with RoastMyCV Pro.",
};

export const viewport: Viewport = {
  themeColor: "#050608",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased">
        <ClerkProvider
          afterSignOutUrl="/"
          signInUrl="/sign-in"
          signInFallbackRedirectUrl="/"
          signUpUrl="/sign-up"
          signUpFallbackRedirectUrl="/"
          appearance={{
            theme: dark,
          }}
        >
          {children}
          <Analytics />
        </ClerkProvider>
      </body>
    </html>
  );
}
