import type { ProjectDraft } from '@interactive-drama/domain';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createDraftStore } from '../../stores/draft-store.js';
import { NodePanel } from './node-panel.js';

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({ value: 'DOCX 剧本内容' }),
  },
}));

const draft: ProjectDraft = {
  id: 'demo',
  title: '全球冰封',
  startNodeId: 'start',
  updatedAt: '2026-08-20T00:00:00.000Z',
  assets: [
    {
      id: 'video-1',
      fileName: '暴雪来临.mp4',
      objectKey: 'assets/video-1.mp4',
      url: '/media/video-1.mp4',
      duration: 12,
      status: 'available',
    },
  ],
  nodes: [
    {
      id: 'start',
      title: '暴雪来临',
      type: 'normal',
      scriptText: '',
      videoAssetId: null,
      position: { x: 0, y: 0 },
      choices: [
        { id: 'choice-a', text: '寻找物资', targetNodeId: 'shelter', order: 0 },
        { id: 'choice-b', text: '留在家中', targetNodeId: 'ending', order: 1 },
      ],
    },
    {
      id: 'shelter',
      title: '地下避难所',
      type: 'normal',
      scriptText: '',
      videoAssetId: null,
      position: { x: -100, y: 160 },
      choices: [],
    },
    {
      id: 'ending',
      title: '成功获救',
      type: 'ending',
      scriptText: '',
      videoAssetId: null,
      position: { x: 100, y: 160 },
      choices: [],
    },
  ],
};

function createLoadedStore(initialDraft = draft) {
  const api = {
    getDraft: vi.fn().mockResolvedValue(initialDraft),
    saveDraft: vi.fn().mockImplementation(async (value) => value),
  };
  const store = createDraftStore(api, 800);
  store.setState({
    draft: structuredClone(initialDraft),
    selectedNodeId: 'start',
    loadStatus: 'ready',
    saveStatus: 'saved',
  });
  return store;
}

function selectedNode(store: ReturnType<typeof createLoadedStore>) {
  return store.getState().draft?.nodes.find((node) => node.id === 'start');
}

describe('NodePanel', () => {
  it('writes pasted text into the selected node script', async () => {
    const user = userEvent.setup();
    const store = createLoadedStore();
    render(<NodePanel store={store} />);

    await user.click(screen.getByRole('tab', { name: '剧本' }));
    await user.click(screen.getByRole('textbox', { name: '节点剧本' }));
    await user.paste('室外温度骤降到零下六十度。');

    expect(selectedNode(store)?.scriptText).toBe('室外温度骤降到零下六十度。');
    expect(screen.getByText('13 字')).toBeInTheDocument();
  });

  it.each([
    ['第一幕.txt', 'text/plain', 'TXT 剧本内容'],
    ['第二幕.md', 'text/markdown', '# MD 剧本内容'],
  ])('loads plain text from %s', async (name, type, content) => {
    const user = userEvent.setup();
    const store = createLoadedStore();
    const file = new File([content], name, { type });
    Object.defineProperty(file, 'text', { value: vi.fn().mockResolvedValue(content) });
    render(<NodePanel store={store} />);

    await user.upload(screen.getByLabelText('上传剧本文件'), file);

    await waitFor(() => expect(selectedNode(store)?.scriptText).toBe(content));
    expect(screen.getByText(`已导入 ${name}`)).toBeInTheDocument();
  });

  it('loads raw text from a DOCX file after confirming replacement', async () => {
    const user = userEvent.setup();
    const store = createLoadedStore({
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.id === 'start' ? { ...node, scriptText: '旧剧本' } : node,
      ),
    });
    const file = new File(['docx'], '第三幕.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    });
    render(<NodePanel store={store} />);

    await user.upload(screen.getByLabelText('上传剧本文件'), file);
    expect(await screen.findByText('覆盖现有剧本？')).toBeInTheDocument();
    expect(selectedNode(store)?.scriptText).toBe('旧剧本');

    await user.click(screen.getByRole('button', { name: '确认覆盖' }));
    await waitFor(() => expect(selectedNode(store)?.scriptText).toBe('DOCX 剧本内容'));
  });

  it('keeps the script unchanged when the file type is unsupported', async () => {
    const user = userEvent.setup();
    const store = createLoadedStore({
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.id === 'start' ? { ...node, scriptText: '保留这段剧本' } : node,
      ),
    });
    render(<NodePanel store={store} />);

    fireEvent.change(screen.getByLabelText('上传剧本文件'), {
      target: { files: [new File(['bad'], '第三幕.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText('仅支持 TXT、MD 或 DOCX 文件')).toBeInTheDocument();
    expect(selectedNode(store)?.scriptText).toBe('保留这段剧本');
  });

  it('binds and unbinds an uploaded video', async () => {
    const user = userEvent.setup();
    const store = createLoadedStore();
    render(<NodePanel store={store} />);

    await user.click(screen.getByRole('tab', { name: '视频' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '绑定视频' }), 'video-1');
    expect(selectedNode(store)?.videoAssetId).toBe('video-1');

    await user.click(screen.getByRole('button', { name: '解除绑定' }));
    expect(selectedNode(store)?.videoAssetId).toBeNull();
  });

  it('reorders and removes choices', async () => {
    const user = userEvent.setup();
    const store = createLoadedStore();
    render(<NodePanel store={store} />);

    await user.click(screen.getByRole('tab', { name: '后续' }));
    await user.click(screen.getByRole('button', { name: '上移 留在家中' }));
    expect(selectedNode(store)?.choices.map((choice) => choice.text)).toEqual([
      '留在家中',
      '寻找物资',
    ]);

    await user.click(screen.getByRole('button', { name: '删除 留在家中' }));
    expect(selectedNode(store)?.choices.map((choice) => choice.order)).toEqual([0]);
  });

  it('edits the prompt shown above multiple branch choices', async () => {
    const user = userEvent.setup();
    const store = createLoadedStore();
    render(<NodePanel store={store} />);

    await user.click(screen.getByRole('tab', { name: '后续' }));
    const prompt = screen.getByRole('textbox', { name: '选择标题' });
    expect(prompt).toHaveValue('');

    await user.type(prompt, '要不要开门救她');

    expect(selectedNode(store)?.choicePrompt).toBe('要不要开门救她');
  });

  it('renders a single downstream connection as a normal continuation', async () => {
    const user = userEvent.setup();
    const store = createLoadedStore({
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.id === 'start'
          ? {
              ...node,
              choices: [{ id: 'to-ending', text: '分支 1', targetNodeId: 'ending', order: 0 }],
            }
          : node,
      ),
    });
    render(<NodePanel store={store} />);

    await user.click(screen.getByRole('tab', { name: '后续' }));

    expect(screen.queryByRole('textbox', { name: '分支文案 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '选择标题' })).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('分支 1')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: '后续节点' })).toHaveValue('ending');
  });

  it('opens and highlights the selected branch from the canvas', async () => {
    const store = createLoadedStore();
    render(<NodePanel store={store} />);

    store.getState().selectChoice('start', 'choice-b');

    expect(await screen.findByRole('tab', { name: '后续', selected: true }))
      .toBeInTheDocument();
    expect(document.querySelector('[data-choice-id="choice-b"]'))
      .toHaveClass('is-selected');
  });

  it('creates and connects a new node when adding a branch', async () => {
    const user = userEvent.setup();
    const store = createLoadedStore();
    render(<NodePanel store={store} />);

    await user.click(screen.getByRole('tab', { name: '后续' }));
    await user.click(screen.getByRole('button', { name: '添加分支' }));

    const nodes = store.getState().draft?.nodes ?? [];
    const newNode = nodes.at(-1);
    expect(nodes).toHaveLength(4);
    expect(selectedNode(store)?.choices.at(-1)?.targetNodeId).toBe(newNode?.id);
    expect(store.getState().selectedNodeId).toBe(newNode?.id);
    expect(screen.getByRole('textbox', { name: '节点剧本' })).toBeInTheDocument();
  });

  it('excludes targets that would create a cycle', async () => {
    const user = userEvent.setup();
    const store = createLoadedStore({
      ...draft,
      nodes: draft.nodes.map((node) =>
        node.id === 'shelter'
          ? {
              ...node,
              choices: [{ id: 'to-ending', text: '继续', targetNodeId: 'ending', order: 0 }],
            }
          : node,
      ),
    });
    store.setState({ selectedNodeId: 'shelter' });
    render(<NodePanel store={store} />);

    await user.click(screen.getByRole('tab', { name: '后续' }));

    const targetSelect = screen.getByRole('combobox', { name: '后续节点' });
    expect(targetSelect).not.toContainElement(
      screen.queryByRole('option', { name: '暴雪来临' }),
    );
    expect(targetSelect).toContainElement(screen.getByRole('option', { name: '成功获救' }));
  });

  it('confirms before changing a branching node into an ending', async () => {
    const user = userEvent.setup();
    const store = createLoadedStore();
    render(<NodePanel store={store} />);

    await user.selectOptions(screen.getByRole('combobox', { name: '节点类型' }), 'ending');
    expect(await screen.findByText('改为结局节点？')).toBeInTheDocument();
    expect(selectedNode(store)?.type).toBe('normal');

    await user.click(screen.getByRole('button', { name: '改为结局' }));
    expect(selectedNode(store)).toMatchObject({ type: 'ending', choices: [] });
  });
});
