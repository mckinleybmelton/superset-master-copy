import { Dashboard } from "@/components/Dashboard";
import { DEFAULT_LOOKBACK_DAYS } from "@/lib/config";
import { buildDashboard } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const rangeEnd = new Date();
  const rangeStart = new Date(
    rangeEnd.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  let initialData = null;
  let initialError: string | null = null;
  try {
    initialData = await buildDashboard({
      rangeStart,
      rangeEnd,
      includeInFlight: true,
    });
  } catch (error) {
    initialError = error instanceof Error ? error.message : String(error);
  }

  return (
    <Dashboard
      initialData={initialData}
      initialError={initialError}
      initialDays={DEFAULT_LOOKBACK_DAYS}
    />
  );
}
