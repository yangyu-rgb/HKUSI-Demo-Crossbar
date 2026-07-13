import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { userFacingError } from "../../shared/api/client";
import { queryKeys } from "../../shared/queryKeys";
import { fetchCrowdsourceFeed, submitCrowdsourceReport } from "./api";
import type { ReportInput } from "./types";


export function useCrowdsource() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const feed = useQuery({
    queryKey: queryKeys.crowdsource,
    queryFn: fetchCrowdsourceFeed,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const mutation = useMutation({
    mutationFn: submitCrowdsourceReport,
    onSuccess: async (result) => {
      const feedbackMessage = result.forecast_feedback
        ? result.forecast_feedback.calibration_linked
          ? "已关联本次课堂预测校准，不进入训练数据。"
          : result.forecast_feedback.reason
        : "";
      setMessage(
        `+${result.points_earned} 积分 · ${result.message}`
        + (feedbackMessage ? ` ${feedbackMessage}` : ""),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.crowdsource }),
        queryClient.invalidateQueries({ queryKey: queryKeys.realtime }),
        queryClient.invalidateQueries({ queryKey: ["prediction"] }),
      ]);
    },
  });

  async function submit(input: ReportInput) {
    setMessage("");
    try {
      await mutation.mutateAsync(input);
      return true;
    } catch {
      return false;
    }
  }

  return {
    reports: feed.data?.reports ?? [],
    loading: feed.isPending,
    refreshing: feed.isFetching && !feed.isPending,
    submitting: mutation.isPending,
    error: feed.error
      ? userFacingError(feed.error)
      : mutation.error
        ? userFacingError(mutation.error)
        : "",
    message,
    calibrationPreview: mutation.data?.calibration_preview ?? null,
    submit,
  };
}
