import type { Metadata } from "next";
import "./globals.css";


export const metadata: Metadata = {
  title: "API",
  description: "Upview API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html>
    <body>
           {children}

    </body>
    </html>
       
  );
}
