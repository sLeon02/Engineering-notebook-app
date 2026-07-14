import './globals.css';

// This app is inherently dynamic (live Supabase data), so skip static
// pre-rendering — that also avoids build failures if env vars aren't
// visible at build time in some deploy setups.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Engineering Notebook',
  description: 'Turn field notes and progress photos into dated, judge-ready notebook entries.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
