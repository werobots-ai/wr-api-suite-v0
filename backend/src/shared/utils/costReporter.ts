export type CostReporter = {
  addCost: (cost: number, requests?: number) => void;
  reportCurrentCost: () => void;
  getTotalCost: () => number;
  getTotalRequests: () => number;
  getMetrics: () => {
    cost: number;
    requests: number;
  };
};

export const getCostReporter = (
  sendEvent: (event: string, data: any) => void,
  snippetId?: string
) => {
  let totalCost = 0;
  let totalRequests = 0;

  const reportCurrentCost = () => {
    sendEvent("metrics", {
      ...(snippetId ? { snippetId } : {}),
      metrics: {
        cost: totalCost,
        requests: totalRequests,
      },
    });
  };

  const addCost = (cost: number, requests = 1) => {
    totalCost += cost;
    totalRequests += requests;

    reportCurrentCost();
  };

  return {
    addCost,
    reportCurrentCost,
    getTotalCost: () => totalCost,
    getTotalRequests: () => totalRequests,
    getMetrics: () => ({
      cost: totalCost,
      requests: totalRequests,
    }),
  };
};
