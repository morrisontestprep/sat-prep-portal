// Layout for the practice-test section.
// The test runner (/practice-test/[id]) is full-screen and manages its own chrome.
// The launcher and results pages use this layout's Nav.
// We detect which page we're on via the slot pattern — since Next.js doesn't expose
// the pathname in a server layout, we simply render children directly and each
// non-runner page includes Nav itself (launcher, results, retake all do this).
export default function PracticeTestLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
