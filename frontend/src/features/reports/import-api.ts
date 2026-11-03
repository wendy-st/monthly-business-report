export interface ImportBatch {
  id: string;
  month: string;
  status: "uploading" | "running" | "succeeded" | "failed";
  detail: string;
  files: string[];
}

async function importRequest(
  path: string,
  init?: RequestInit,
): Promise<ImportBatch> {
  const response = await fetch(`/api/imports${path}`, init);
  if (!response.ok) {
    const data: { detail?: unknown } = await response.json();
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "导入请求无效，请检查月份及文件后重试。",
    );
  }
  return response.json() as Promise<ImportBatch>;
}

export const createImport = (month: string) =>
  importRequest("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month }),
  });
export const uploadImport = (id: string, file: File) =>
  importRequest(`/${id}/files/${encodeURIComponent(file.name)}`, {
    method: "PUT",
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    body: file,
  });
export const startImport = (id: string) =>
  importRequest(`/${id}/run`, { method: "POST" });
export const readImport = (id: string) => importRequest(`/${id}`);
