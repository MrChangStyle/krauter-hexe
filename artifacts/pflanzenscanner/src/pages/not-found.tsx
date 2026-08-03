export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center">
      <h1 className="text-6xl font-serif text-primary mb-4">404</h1>
      <h2 className="text-2xl font-medium mb-4">Seite nicht gefunden</h2>
      <p className="text-muted-foreground">
        Diese Seite existiert leider nicht.
      </p>
    </div>
  );
}
