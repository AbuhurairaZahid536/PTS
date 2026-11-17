import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Drawer, Empty, List, Space, Tag, Typography, message } from "antd";
import { BellOutlined, CheckOutlined, ReloadOutlined } from "@ant-design/icons";
import api from "../services/api";

export default function PublicSuggestionsBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(null);

  const refresh = useCallback(async (silent = false, targetPage = page) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.get(`/public-site/admin/suggestions?limit=${pageSize}&offset=${targetPage * pageSize}`);
      setItems(response.data?.data?.suggestions || []);
      setUnread(Number(response.data?.data?.unread || 0));
      setTotal(Number(response.data?.data?.total || 0));
    } catch (error) {
      if (!silent) message.error(error.response?.data?.message || "Could not load public suggestions.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    refresh(true);
    const interval = setInterval(() => refresh(true), 45000);
    return () => clearInterval(interval);
  }, [refresh]);

  const markRead = async (id) => {
    setMarking(id);
    try {
      await api.patch(`/public-site/admin/suggestions/${id}/read`);
      await refresh(true);
    } catch (error) {
      message.error(error.response?.data?.message || "Could not mark suggestion as read.");
    } finally { setMarking(null); }
  };

  return (
    <>
      <Badge count={unread} size="small" overflowCount={99}>
        <Button type="text" icon={<BellOutlined style={{ fontSize: 19 }} />} aria-label={`Public suggestions: ${unread} unread`} onClick={() => { setOpen(true); refresh(); }} title="Public Suggestions" />
      </Badge>
      <Drawer title={<Space><BellOutlined /> Public Suggestions <Tag color="blue">{unread} unread</Tag></Space>}
        placement="right" width={Math.min(window.innerWidth - 18, 510)} open={open} onClose={() => setOpen(false)}
        extra={<Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={() => refresh()}>Refresh</Button>}>
        <Typography.Paragraph type="secondary">Suggestions submitted by visitors through the public website. Only authorized website administrators can view them.</Typography.Paragraph>
        <List loading={loading} locale={{ emptyText: <Empty description="No public suggestions yet" /> }} dataSource={items} renderItem={(item, index) => (
          <List.Item key={item.id} style={{ display: "block", background: item.status === "NEW" ? "#f2f8ff" : "transparent", padding: 14, borderRadius: 8, marginBottom: 10, border: "1px solid #e3eaf2" }}>
            <Space style={{ width: "100%", justifyContent: "space-between" }} wrap>
              <Typography.Text strong>{page * pageSize + index + 1}. {item.visitor_name || "Visitor"}</Typography.Text>
              <Tag color={item.status === "NEW" ? "blue" : "default"}>{item.status}</Tag>
            </Space>
            <div><Typography.Text copyable>{item.visitor_email}</Typography.Text></div>
            <Typography.Paragraph style={{ marginTop: 10, marginBottom: 8, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.suggestion_text}</Typography.Paragraph>
            <Space wrap><Typography.Text type="secondary" style={{ fontSize: 12 }}>{item.created_at ? new Date(item.created_at).toLocaleString("en-PK", { timeZone: "Asia/Karachi" }) : ""}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Email: {item.email_status}</Typography.Text></Space>
            {item.status === "NEW" && <div style={{ marginTop: 9 }}><Button size="small" type="primary" icon={<CheckOutlined />} loading={marking === item.id} onClick={() => markRead(item.id)}>Mark as Read</Button></div>}
          </List.Item>
        )} />
        {total > pageSize && <Space style={{ marginTop: 16, justifyContent: "space-between", width: "100%" }}>
          <Button disabled={page <= 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
          <Typography.Text type="secondary">Page {page + 1} of {Math.ceil(total / pageSize)}</Typography.Text>
          <Button disabled={(page + 1) * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </Space>}
      </Drawer>
    </>
  );
}
