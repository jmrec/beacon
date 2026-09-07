import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";

const STALE_TIME = 60 * 1000;
const MAX_AGE = 24 * 60 * 60 * 1000;

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME,
      },
    },
  });

  if (
    typeof window !== "undefined" &&
    typeof window.localStorage !== "undefined"
  ) {
    const persister = createAsyncStoragePersister({
      storage: window.localStorage,
      key: "beacon-query",
      throttleTime: 1000,
    });
    void persistQueryClient({ queryClient, persister, maxAge: MAX_AGE });
  }

  return {
    queryClient,
  };
}
export default function TanstackQueryProvider() {}
