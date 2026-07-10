import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useDemoContext } from "../demo/useDemo";
import { userFacingError } from "../../shared/api/client";
import { queryKeys } from "../../shared/queryKeys";
import { fetchLocations, fetchPrediction } from "./api";
import type { PredictionQueryInput } from "./types";


export const DEFAULT_QUERY: PredictionQueryInput = {
  origin_id: "hku",
  destination_id: "nanshan-tech",
  target_time: "",
  priority: "balanced",
  max_budget: 100,
};


export function usePrediction() {
  const [query, setQuery] = useState<PredictionQueryInput>(DEFAULT_QUERY);
  const [submittedQuery, setSubmittedQuery] = useState<PredictionQueryInput | null>(null);
  const initialized = useRef(false);
  const locations = useQuery({
    queryKey: queryKeys.locations,
    queryFn: fetchLocations,
    staleTime: Infinity,
  });
  const context = useDemoContext();
  useEffect(() => {
    if (!context.data || initialized.current) {
      return;
    }
    const initialQuery = {
      ...DEFAULT_QUERY,
      target_time: context.data.suggested_target_time.slice(0, 16),
    };
    initialized.current = true;
    setQuery(initialQuery);
    setSubmittedQuery(initialQuery);
  }, [context.data]);
  const prediction = useQuery({
    queryKey: queryKeys.prediction(submittedQuery),
    queryFn: () => fetchPrediction(submittedQuery!),
    enabled: submittedQuery !== null,
  });

  async function runPrediction() {
    if (submittedQuery && JSON.stringify(query) === JSON.stringify(submittedQuery)) {
      await prediction.refetch();
    } else {
      setSubmittedQuery({ ...query });
    }
  }

  const requestError = locations.error ?? context.error ?? prediction.error;
  const loading = locations.isPending
    || context.isPending
    || (!requestError && (!submittedQuery || prediction.isPending));
  return {
    locations: locations.data ?? null,
    context: context.data ?? null,
    prediction: prediction.data ?? null,
    query,
    setQuery,
    loading,
    predicting: prediction.isFetching && !prediction.isPending,
    error: requestError ? userFacingError(requestError) : "",
    runPrediction,
  };
}
