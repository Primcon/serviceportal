export default function PortalLoading() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="h-8 w-48 animate-pulse bg-line" />
        <div className="mt-6 space-y-4">
          <div className="h-24 animate-pulse bg-paper" />
          <div className="h-24 animate-pulse bg-paper" />
          <div className="h-24 animate-pulse bg-paper" />
        </div>
      </div>
    </main>
  );
}
