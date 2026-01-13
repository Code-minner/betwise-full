import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'BetWise - Smart Sports Predictions',
  description: 'AI-powered sports betting predictions for Football, Basketball, and Tennis',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {/* Header */}
        <header className="border-b border-dark-700/50 bg-dark-900/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-2">
                <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                  <span className="text-xl font-bold">BW</span>
                </div>
                <span className="text-xl font-bold">BetWise</span>
              </Link>

              {/* Navigation */}
              <nav className="flex items-center gap-4 md:gap-6 flex-wrap">
                <Link 
                  href="/football" 
                  className="text-dark-300 hover:text-white transition-colors"
                >
                  ⚽ Football
                </Link>
                <Link 
                  href="/basketball" 
                  className="text-dark-300 hover:text-white transition-colors"
                >
                  🏀 Basketball
                </Link>
                <Link 
                  href="/tennis" 
                  className="text-dark-300 hover:text-white transition-colors"
                >
                  🎾 Tennis
                </Link>
                <Link 
                  href="/analyze" 
                  className="text-dark-300 hover:text-white transition-colors"
                >
                  📋 Analyze
                </Link>
                <Link 
                  href="/history" 
                  className="text-dark-300 hover:text-white transition-colors"
                >
                  History
                </Link>
                <Link 
                  href="/stats" 
                  className="text-dark-300 hover:text-white transition-colors"
                >
                  Stats
                </Link>
              </nav>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 py-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-dark-700/50 bg-dark-900/50 mt-auto">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-dark-400 text-sm">
                © 2024 BetWise. For educational purposes only.
              </p>
              <p className="text-dark-500 text-xs max-w-xl text-center">
                Gambling involves risk. Please bet responsibly. BetWise provides predictions 
                based on statistical analysis and does not guarantee results.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
