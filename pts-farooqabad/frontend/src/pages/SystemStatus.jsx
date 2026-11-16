import { useEffect, useState } from 'react';
import { Card, Descriptions, Badge, Spin, Alert, Typography, Space } from 'antd';
import api from '../services/api';

const { Title, Paragraph } = Typography;

const initialState = { loading: true, api: null, db: null, error: null };

export default function SystemStatus() {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const [apiRes, dbRes] = await Promise.all([
          api.get('/health'),
          api.get('/health/db').catch((err) => err.response), // db down shouldn't throw the whole check
        ]);
        if (cancelled) return;
        setState({
          loading: false,
          api: apiRes?.data?.data || null,
          db: dbRes?.data?.data || null,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          api: null,
          db: null,
          error: 'Could not reach the backend API. Is it running on port 5000?',
        });
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Title level={3} style={{ marginBottom: 4 }}>
          Phase 1 — Environment Status
        </Title>
        <Paragraph type="secondary">
          Confirms the React frontend, Express API, and MySQL connection are all wired up
          correctly before Phase 2 introduces the real schema.
        </Paragraph>
      </div>

      {state.loading && <Spin tip="Checking backend connectivity..." />}

      {state.error && <Alert type="error" showIcon message={state.error} />}

      {!state.loading && !state.error && (
        <Card title="Backend API">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Status">
              <Badge status={state.api ? 'success' : 'error'} text={state.api ? 'Reachable' : 'Unreachable'} />
            </Descriptions.Item>
            <Descriptions.Item label="Uptime">
              {state.api ? `${state.api.uptimeSeconds}s` : '—'}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {!state.loading && !state.error && (
        <Card title="MySQL Connection">
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Status">
              <Badge
                status={state.db?.connected ? 'success' : 'warning'}
                text={state.db?.connected ? 'Connected' : 'Not connected yet'}
              />
            </Descriptions.Item>
            {!state.db?.connected && (
              <Descriptions.Item label="Detail">
                {state.db?.error || 'Check backend/.env DB_* values and that MySQL is running.'}
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>
      )}
    </Space>
  );
}
