import { useEffect, useState } from "react";
import { Alert, Button, Card, Input, Space, Typography } from "antd";
import {
  createImport,
  readImport,
  startImport,
  uploadImport,
} from "./import-api";
import type { ImportBatch } from "./import-api";
import { comparedMonth, monthLabel, useReportMonth } from "./report-month";

export function ImportPanel() {
  const { month, refreshMonths, setMonth } = useReportMonth();
  const [target, setTarget] = useState(comparedMonth(month, 1));
  const [files, setFiles] = useState<File[]>([]);
  const [batch, setBatch] = useState<ImportBatch>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const id = sessionStorage.getItem("report.importBatch");
    if (!id) return;
    let active = true;
    readImport(id)
      .then((result) => {
        if (!active) return;
        setBatch(result);
        if (result.status === "succeeded") refreshMonths();
      })
      .catch(() => {
        sessionStorage.removeItem("report.importBatch");
      });
    return () => {
      active = false;
    };
  }, [refreshMonths]);
  useEffect(() => {
    if (batch?.status !== "running") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await readImport(batch.id);
        if (!active) return;
        setBatch(result);
        setError("");
        if (result.status === "running")
          timer = setTimeout(() => void poll(), 2000);
        else if (result.status === "succeeded") refreshMonths();
      } catch (reason) {
        if (active) {
          setError(
            reason instanceof Error ? reason.message : "读取导入状态失败",
          );
          timer = setTimeout(() => void poll(), 5000);
        }
      }
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [batch?.id, batch?.status, refreshMonths]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      let current = await createImport(target);
      sessionStorage.setItem("report.importBatch", current.id);
      setBatch(current);
      for (const file of files) {
        current = await uploadImport(current.id, file);
        setBatch(current);
      }
      setBatch(await startImport(current.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "导入失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  const processing = busy || batch?.status === "running";
  return (
    <Card title="导入月度数据" size="small">
      <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
        <Typography.Paragraph>
          沿用现有表结构，选择经营报告、当年及上年库存周转、款式映射、MSKU预测、历史LISTING和库存发货天数，需7份Excel，可附历史款式映射。
        </Typography.Paragraph>
        <label>
          导入月份
          <Input
            aria-label="导入月份"
            type="month"
            value={target}
            disabled={processing}
            onChange={(event) => setTarget(event.target.value)}
          />
        </label>
        <label>
          配套Excel文件
          <input
            aria-label="配套Excel文件"
            type="file"
            multiple
            accept=".xlsx"
            disabled={processing}
            onChange={(event) => {
              setFiles(Array.from(event.target.files ?? []));
              setError("");
            }}
          />
        </label>
        {files.length > 0 && (
          <p>
            已选择{files.length}份：{files.map((file) => file.name).join("、")}
          </p>
        )}
        <Typography.Text type="secondary">
          单文件不超过256MB，整批不超过1GB。原始文件保持只读；同月不同来源停止覆盖，失败不发布月份。
        </Typography.Text>
        <Button
          type="primary"
          aria-label="检查并生成报告"
          disabled={!target || files.length === 0 || processing}
          loading={processing}
          onClick={() => void submit()}
        >
          检查并生成报告
        </Button>
        {error && <Alert type="error" showIcon title={error} />}
        {batch && (
          <Alert
            showIcon
            type={
              batch.status === "failed"
                ? "error"
                : batch.status === "succeeded"
                  ? "success"
                  : "info"
            }
            title={batch.detail}
          />
        )}
        {batch?.status === "succeeded" && (
          <Button onClick={() => setMonth(batch.month)}>
            查看{monthLabel(batch.month)}报告
          </Button>
        )}
      </Space>
    </Card>
  );
}
