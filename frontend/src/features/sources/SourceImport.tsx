import { useState } from "react";
import { Alert, Button, Card, Table, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import type { UploadFile } from "antd";

export function SourceImport() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  return (
    <div className="section-stack">
      <Alert
        type="info"
        showIcon
        title="界面样例：文件仅在当前页面列出，不上传、不读取或写入源文件。"
      />
      <Card title="本月输入文件">
        <Upload
          accept=".xlsx"
          multiple
          fileList={files}
          beforeUpload={() => false}
          onChange={({ fileList }) => setFiles(fileList)}
          showUploadList={false}
        >
          <Button icon={<UploadOutlined />}>选择 Excel 文件</Button>
        </Upload>
        <Table<UploadFile>
          rowKey="uid"
          dataSource={files}
          pagination={false}
          className="source-table"
          locale={{ emptyText: "尚未选择文件" }}
          columns={[
            { title: "文件名", dataIndex: "name" },
            { title: "状态", render: () => "待检查" },
            {
              title: "操作",
              render: (_, file) => (
                <Button
                  type="link"
                  onClick={() =>
                    setFiles(files.filter((item) => item.uid !== file.uid))
                  }
                >
                  移除
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Card title="报告生成">
        <Alert
          type="warning"
          showIcon
          title="尚未接入生成服务，不能生成正式报告。"
        />
        <Button type="primary" disabled className="generate-button">
          生成本月报告
        </Button>
      </Card>
    </div>
  );
}
