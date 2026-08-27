import { Alert, Button, Modal } from 'antd';
import { useRef, useState } from 'react';

type ScriptImport = {
  fileName: string;
  text: string;
};

export function ScriptTab({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [importedFileName, setImportedFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<ScriptImport | null>(null);

  function applyImport(result: ScriptImport) {
    onChange(result.text);
    setImportedFileName(result.fileName);
    setPendingImport(null);
  }

  async function readFile(file: File): Promise<string> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'txt' || extension === 'md') {
      return file.text();
    }
    if (extension === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.default.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return result.value;
    }
    throw new Error('UNSUPPORTED_SCRIPT_FILE');
  }

  async function importFile(file: File) {
    setError(null);
    try {
      const result = { fileName: file.name, text: await readFile(file) };
      if (value.trim()) {
        setPendingImport(result);
      } else {
        applyImport(result);
      }
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message === 'UNSUPPORTED_SCRIPT_FILE'
          ? '仅支持 TXT、MD 或 DOCX 文件'
          : '剧本读取失败，请重新选择文件',
      );
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="script-tab">
      <textarea
        aria-label="节点剧本"
        value={value}
        placeholder="粘贴或输入这个节点对应的完整剧本"
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="script-tab__meta">
        <span>{value.length} 字</span>
        <Button onClick={() => inputRef.current?.click()}>上传剧本</Button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          aria-label="上传剧本文件"
          accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
          }}
        />
      </div>
      {importedFileName && <span className="script-tab__feedback">已导入 {importedFileName}</span>}
      {error && <Alert type="error" showIcon title={error} />}
      <Modal
        open={Boolean(pendingImport)}
        title="覆盖现有剧本？"
        okText="确认覆盖"
        cancelText="取消"
        onCancel={() => setPendingImport(null)}
        onOk={() => {
          if (pendingImport) applyImport(pendingImport);
        }}
      >
        上传文件会替换当前节点的全部剧本文本。
      </Modal>
    </div>
  );
}
