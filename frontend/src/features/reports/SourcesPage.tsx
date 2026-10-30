import { Alert, Button, Card, Descriptions, Skeleton, Table } from "antd";
import { useReport } from "./api";
import type { SourceStatus } from "./contracts";

export function SourcesPage() {
  const request = useReport<SourceStatus>("sources");
  const data = request.data;
  return (
    <div className="section-stack">
      <h2 className="section-heading">9月数据来源与导入状态</h2>
      {request.error && (
        <Alert
          type="error"
          title={request.error}
          action={<Button onClick={request.retry}>重试</Button>}
        />
      )}
      {!data && !request.error && <Skeleton active />}
      {data && (
        <>
          <Alert
            type="success"
            showIcon
            title="9月源表已只读导入，当前页面读取本地快照。"
          />
          <Card title="当前版本" size="small">
            <Descriptions
              bordered
              column={1}
              items={[
                {
                  key: "month",
                  label: "报告月份",
                  children: data.report_month,
                },
                {
                  key: "snapshot",
                  label: "源文件版本标识",
                  children: data.identity,
                },
                {
                  key: "cached",
                  label: "公式读取方式",
                  children: "读取已有缓存，未执行Excel重算或刷新外部链接",
                },
                {
                  key: "operating",
                  label: "经营底表",
                  children: `${data.counts.operating}行（三期）`,
                },
                {
                  key: "history",
                  label: "历史LISTING",
                  children: `${data.counts.history}行`,
                },
                {
                  key: "inventory",
                  label: "经营库存",
                  children: `${data.counts.current_inventory}行`,
                },
                {
                  key: "forecast",
                  label: "预测结果",
                  children: `${data.counts.forecast}行`,
                },
              ]}
            />
          </Card>
          <Card title="源文件身份" size="small">
            <Table
              rowKey="file"
              dataSource={data.files}
              pagination={false}
              scroll={{ x: 1050 }}
              columns={[
                { title: "文件", dataIndex: "file", width: 460 },
                { title: "SHA-256", dataIndex: "sha256", width: 540 },
              ]}
            />
          </Card>
          <p>
            原始Excel保持只读。相同来源重复导入不产生新版本；来源变化时停止覆盖，避免改写已有月份。后续月份的上传和生成入口尚未开放。
          </p>
        </>
      )}
    </div>
  );
}
