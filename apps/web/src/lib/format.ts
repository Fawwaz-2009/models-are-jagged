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

export const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

export const truncate = (value: string, length: number): string => {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
};
