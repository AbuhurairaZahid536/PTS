import { useState } from "react";

import { Alert, Button, Card, Form, Input, Typography } from "antd";

import {
  ArrowLeftOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from "@ant-design/icons";

import { useAuth } from "../contexts/AuthContext";

const { Title, Text } = Typography;

export default function Login({ onBackHome, brandLogoUrl }) {
  const { login } = useAuth();

  const [error, setError] = useState("");

  const [loading, setLoading] = useState(false);

  const submit = async (values) => {
    setError("");

    setLoading(true);

    try {
      await login(values.username, values.password);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Unable to sign in. Please check your username and password.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-background">
        <div className="login-background-grid" />

        <div className="login-background-glow login-glow-one" />

        <div className="login-background-glow login-glow-two" />

        <div className="login-background-campus">
          <div className="login-campus-building">
            <div className="login-campus-roof" />

            <div className="login-campus-body">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>

      <div className="login-topbar">
        <button type="button" onClick={onBackHome}>
          <ArrowLeftOutlined />
          Back to Home
        </button>

        <div>POLICE TRAINING SCHOOL FAROOQABAD</div>
      </div>

      <main className="login-wrapper">
        <section className="login-introduction">
          <div
            className={`login-main-logo ${
              brandLogoUrl ? "has-public-logo" : ""
            }`}
          >
            {brandLogoUrl ? (
              <img
                src={brandLogoUrl}
                alt="PTS Farooqabad"
                className="public-site-logo-image"
              />
            ) : (
              <>
                <small>★</small>

                <strong>PTS</strong>

                <span>FAROOQABAD</span>
              </>
            )}
          </div>

          <span className="login-kicker">AUTHORIZED ACCESS</span>

          <h1>
            PTS
            <span>Farooqabad</span>
          </h1>

          <p>Biometric Attendance & Trainee Management System</p>

          <div className="login-feature-card">
            <SafetyCertificateOutlined />

            <div>
              <strong>Secure Login</strong>

              <span>
                Access is available to authorized Police Training School users
                only.
              </span>
            </div>
          </div>

          <div className="login-small-features">
            <span>
              <SafetyCertificateOutlined />
              Secure Access
            </span>

            <span>
              <UserOutlined />
              Role Based
            </span>

            <span>
              <LockOutlined />
              Protected System
            </span>
          </div>
        </section>

        <Card className="login-card" variant="borderless">
          <div className="login-brand">
            <div className="login-card-icon">
              <LockOutlined />
            </div>

            <Title level={2}>Login</Title>

            <Text type="secondary">
              Enter your authorized username and password.
            </Text>
          </div>

          {error && (
            <Alert
              type="error"
              showIcon
              message={error}
              className="login-alert"
            />
          )}

          <Form
            layout="vertical"
            onFinish={submit}
            requiredMark={false}
            size="large"
          >
            <Form.Item
              name="username"
              label="Username"
              rules={[
                {
                  required: true,

                  message: "Enter username",
                },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="Enter username"
                autoComplete="username"
                disabled={loading}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[
                {
                  required: true,

                  message: "Enter password",
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Enter password"
                autoComplete="current-password"
                disabled={loading}
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              className="login-submit-btn"
            >
              Login
            </Button>
          </Form>

          <div className="login-divider">
            <span>AUTHORIZED USERS ONLY</span>
          </div>

          <div className="login-security-message">
            <SafetyCertificateOutlined />

            <span>Unauthorized access is prohibited.</span>
          </div>

          <button
            type="button"
            className="login-back-button"
            onClick={onBackHome}
          >
            <ArrowLeftOutlined />
            Return to Homepage
          </button>
        </Card>
      </main>

      <footer className="login-footer">
        <span>Punjab Police</span>

        <b>•</b>

        <span>Police Training School Farooqabad</span>

        <b>•</b>

        <span>Discipline • Training • Service</span>
      </footer>
    </div>
  );
}
