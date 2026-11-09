/** Shown on the "My cars" pages until the one-time database setup is done. */
export function SetupNote() {
  return (
    <div className="rounded-md border-l-4 border-l-warn bg-warn-soft px-5 py-4">
      <p className="font-semibold">One-time setup needed</p>
      <p className="mt-1">
        Saving cars needs two small tables in your Supabase database. Open Supabase → SQL Editor → New query, paste the file{" "}
        <code className="font-mono text-sm">supabase/migrations/20261109_checked_cars.sql</code> and press Run. Then reload this page.
        Details are in docs/SETUP.md, step 8.
      </p>
    </div>
  );
}
