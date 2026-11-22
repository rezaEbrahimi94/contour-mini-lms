import "@daypicker/react/style.css";
import "./globals.css";
export const metadata = { title: "Contour student portal" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
