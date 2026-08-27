import {
  ArrowRightOutlined,
  BranchesOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Skeleton,
  Typography,
  message,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, type ProjectSummary } from '../api/client.js';

type PageState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; projects: ProjectSummary[] };

type CreateProjectValues = {
  title: string;
};

function formatUpdatedAt(value: string): string {
  const formatted = new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
  return `最近编辑 ${formatted}`;
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<PageState>({ status: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<CreateProjectValues>();

  const loadProjects = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const result = await api.listProjects();
      setState({ status: 'ready', projects: result.projects });
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function createProject(values: CreateProjectValues) {
    setCreating(true);
    try {
      const result = await api.createProject(values.title.trim());
      message.success('作品已创建');
      navigate(`/studio/projects/${result.project.id}/edit`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '创建失败');
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="projects-page">
      <header className="projects-header">
        <div className="brand-lockup" aria-label="互动短剧制作台">
          <span className="brand-mark"><BranchesOutlined /></span>
          <span>互动短剧制作台</span>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          aria-label="新建互动短剧"
          onClick={() => setModalOpen(true)}
        >
          新建互动短剧
        </Button>
      </header>

      <section className="projects-content">
        <div className="projects-intro">
          <Typography.Title level={1}>作品</Typography.Title>
          <Typography.Paragraph>
            先完成分支剧本，再逐段绑定视频素材。
          </Typography.Paragraph>
        </div>

        {state.status === 'loading' && (
          <div className="project-list" aria-label="正在加载作品">
            <Skeleton active paragraph={{ rows: 2 }} />
            <Skeleton active paragraph={{ rows: 2 }} />
          </div>
        )}

        {state.status === 'error' && (
          <Alert
            type="error"
            showIcon
            title="作品列表加载失败"
            description="请确认制作服务已经启动，然后重新加载。"
            action={<Button onClick={() => void loadProjects()}>重新加载</Button>}
          />
        )}

        {state.status === 'ready' && state.projects.length === 0 && (
          <div className="projects-empty">
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <div>
                  <strong>从第一条剧情线开始</strong>
                  <span>创建作品后，即可录入剧本并搭建分支。</span>
                </div>
              }
            />
          </div>
        )}

        {state.status === 'ready' && state.projects.length > 0 && (
          <div className="project-list">
            {state.projects.map((project) => (
              <button
                className="project-row"
                key={project.id}
                type="button"
                onClick={() => navigate(`/studio/projects/${project.id}/edit`)}
              >
                <span className="project-row__main">
                  <span className="project-row__title">{project.title}</span>
                  <span className="project-row__meta">
                    {formatUpdatedAt(project.updatedAt)}
                  </span>
                </span>
                <ArrowRightOutlined aria-hidden />
              </button>
            ))}
          </div>
        )}
      </section>

      <Modal
        title="创建互动短剧"
        open={modalOpen}
        okText="创建作品"
        cancelText="取消"
        confirmLoading={creating}
        onCancel={() => {
          setModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={createProject}>
          <Form.Item
            label="作品名称"
            name="title"
            rules={[{ required: true, whitespace: true, message: '请输入作品名称' }]}
          >
            <Input autoFocus maxLength={60} placeholder="例如：全球冰封" />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
