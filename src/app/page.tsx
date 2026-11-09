import { Analyzer } from "@/components/analyzer/Analyzer";

export default function CheckListingPage() {
  return (
    <>
      <div className="mb-10">
        <h1 className="text-3xl sm:text-[2.5rem]">Is this used car worth it?</h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Copy a listing from any site, or just the VIN. VinVerdict checks the car&apos;s history, safety and the seller before
          you spend a dollar.
        </p>
      </div>
      <Analyzer />
    </>
  );
}
