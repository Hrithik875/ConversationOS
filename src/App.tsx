import { BrowserRouter, Routes, Route, Link } from 'react-router'
import { ThemeProvider } from '@/app/theme-provider'
import { ThemeToggle } from '@/components/theme-toggle'

function LandingScreen() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background p-6 text-center">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl text-foreground">
        ConversationOS — Foundation
      </h1>
      <p className="mt-6 text-lg leading-8 text-muted-foreground">
        Phase 0 placeholder screen.
      </p>
      <div className="mt-10 flex items-center justify-center gap-x-6">
        <Link
          to="/app"
          className="rounded-md bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Go to App Shell
        </Link>
      </div>
    </div>
  )
}

function AppShellStub() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background p-6 text-center">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
        App Shell Route Stub
      </h2>
      <div className="mt-10 flex items-center justify-center gap-x-6">
        <Link
          to="/"
          className="text-sm font-semibold leading-6 text-foreground"
        >
          <span aria-hidden="true">&larr;</span> Back to home
        </Link>
      </div>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingScreen />} />
          <Route path="/app" element={<AppShellStub />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
