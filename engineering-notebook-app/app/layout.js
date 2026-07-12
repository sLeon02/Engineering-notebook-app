import './globals.css';

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
