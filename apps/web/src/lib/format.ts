export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
    reader.readAsDataURL(blob);
  });

export const blobToBase64 = async (blob: Blob): Promise<string> => {
  const url = await blobToDataUrl(blob);
  const comma = url.indexOf(",");
  return comma === -1 ? "" : url.slice(comma + 1);
};

export const formatCost = (cost: number | null): string => {
  if (cost === null || !Number.isFinite(cost)) return "cost n/a";
  if (cost === 0) return "$0";
  if (cost < 0.001) return `$${cost.toFixed(5)}`;
  if (cost < 0.1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
};

export const formatLatency = (ms: number | null): string => {
  if (ms === null || !Number.isFinite(ms)) return "latency n/a";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

export const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export const truncate = (value: string, length: number): string => {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
};
