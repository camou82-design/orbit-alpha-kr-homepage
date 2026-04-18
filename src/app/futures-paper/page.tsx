import { loadFuturesPaperDataBundle } from "@/lib/futuresPaperRead";
import FuturesPaperClientPage from "./FuturesPaperClientPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Server-side entry for /futures-paper.
 * Fetches initial data on the server to avoid client 401s and expose secrets.
 */
export default async function FuturesPaperPage() {
  // Fetch initial data on server
  const initialBundle = await loadFuturesPaperDataBundle();

  return <FuturesPaperClientPage initialBundle={initialBundle} />;
}
