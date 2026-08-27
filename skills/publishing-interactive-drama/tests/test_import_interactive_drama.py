from __future__ import annotations

import importlib.util
import ssl
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).parents[1] / "scripts" / "import_interactive_drama.py"
TEMPLATE_PATH = Path(__file__).parents[1] / "assets" / "互动剧本模板.md"
SPEC = importlib.util.spec_from_file_location("import_interactive_drama", SCRIPT_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


VALID_SCRIPT = """# 作品：全球冰封

## 节点：N001｜暴雪前夜
- 类型：起点
- 选择标题：要不要开门救她？
- 分支：
  - 开门救她 → N002
  - 保持沉默 → N003

### 剧本
```text
全球气温骤降，门外突然传来求救声。
```

## 节点：N002｜并肩求生
- 类型：结局
- 后续节点：无

### 剧本
```text
你打开门，决定和她一起面对寒潮。
```

## 节点：N003｜独自等待
- 类型：结局
- 后续节点：无

### 剧本
```text
你没有开门，求救声逐渐消失。
```
"""

SINGLE_SUCCESSOR_SCRIPT = """# 作品：单线剧情

## 节点：N001｜出发
- 类型：起点
- 后续节点：N002

### 剧本
```text
你踏上了回家的路。
```

## 节点：N002｜到家
- 类型：结局
- 后续节点：无

### 剧本
```text
你平安到家。
```
"""


class FakeClient:
    def __init__(self, existing_draft=None):
        self.existing_draft = existing_draft
        self.calls = []
        self.saved_draft = None

    def get_draft(self, project_id):
        self.calls.append(("get_draft", project_id))
        if self.saved_draft is not None:
            return {**self.saved_draft, "updatedAt": "2026-08-26T01:01:00.000Z"}
        if self.existing_draft is None:
            raise AssertionError("unexpected get_draft")
        return self.existing_draft

    def create_project(self, title):
        self.calls.append(("create_project", title))
        return {
            "project": {"id": "project 42", "title": title},
            "draft": {
                "id": "project 42",
                "title": title,
                "startNodeId": "generated",
                "nodes": [],
                "assets": [],
                "updatedAt": "2026-08-26T01:00:00.000Z",
            },
        }

    def save_draft(self, project_id, draft):
        self.calls.append(("save_draft", project_id))
        self.saved_draft = draft
        return {**draft, "updatedAt": "2026-08-26T01:01:00.000Z"}

    def validate_project(self, project_id):
        self.calls.append(("validate_project", project_id))
        return {"valid": True, "issues": []}

    def publish_project(self, project_id):
        self.calls.append(("publish_project", project_id))
        return {
            "version": "v3",
            "publishedAt": "2026-08-26T01:02:00.000Z",
            "manifestUrl": "https://cdn.example/manifest.json",
        }

    def get_manifest(self, project_id, version):
        self.calls.append(("get_manifest", project_id, version))
        return {"projectId": project_id, "version": version, "nodes": [{"id": "N001"}]}


class MarkdownParsingTests(unittest.TestCase):
    def test_parses_custom_choice_prompt_and_builds_publishable_draft(self):
        document = MODULE.parse_markdown(VALID_SCRIPT)
        draft = MODULE.build_draft(
            document,
            project_id="demo",
            updated_at="2026-08-26T01:00:00.000Z",
        )

        self.assertEqual(document.title, "全球冰封")
        self.assertEqual(draft["startNodeId"], "N001")
        self.assertEqual(draft["nodes"][0]["choicePrompt"], "要不要开门救她？")
        self.assertEqual(
            [choice["order"] for choice in draft["nodes"][0]["choices"]],
            [0, 1],
        )
        self.assertEqual(draft["nodes"][1]["type"], "ending")
        self.assertEqual(draft["nodes"][1]["position"]["x"], 320)
        self.assertEqual(draft["nodes"][2]["position"]["x"], 320)
        self.assertNotEqual(
            draft["nodes"][1]["position"]["y"],
            draft["nodes"][2]["position"]["y"],
        )

    def test_choice_ids_are_stable_without_manual_ids(self):
        document = MODULE.parse_markdown(VALID_SCRIPT)
        first = MODULE.build_draft(document, "demo", "2026-08-26T01:00:00.000Z")
        second = MODULE.build_draft(document, "demo", "2026-08-26T01:00:00.000Z")

        self.assertEqual(first["nodes"][0]["choices"], second["nodes"][0]["choices"])

    def test_single_successor_uses_plain_connection_without_branch_description(self):
        document = MODULE.parse_markdown(SINGLE_SUCCESSOR_SCRIPT)
        draft = MODULE.build_draft(document, "demo", "2026-08-26T01:00:00.000Z")

        self.assertEqual(len(draft["nodes"][0]["choices"]), 1)
        self.assertEqual(draft["nodes"][0]["choices"][0]["text"], "")
        self.assertEqual(draft["nodes"][0]["choices"][0]["targetNodeId"], "N002")
        self.assertNotIn("choicePrompt", draft["nodes"][0])

    def test_rejects_branch_description_when_there_is_only_one_successor(self):
        invalid = SINGLE_SUCCESSOR_SCRIPT.replace(
            "- 后续节点：N002",
            "- 分支：\n  - 带着物资回家 → N002",
        )

        with self.assertRaises(MODULE.DramaValidationError) as caught:
            MODULE.parse_markdown(invalid)

        self.assertIn("单一后续请使用“- 后续节点：N002”", str(caught.exception))

    def test_bundled_template_uses_plain_connections_for_single_successors(self):
        document = MODULE.parse_markdown(TEMPLATE_PATH.read_text(encoding="utf-8"))
        nodes = {node.id: node for node in document.nodes}

        self.assertEqual(nodes["N002"].choices[0].text, "")
        self.assertEqual(nodes["N002"].choices[0].target_node_id, "N004")
        self.assertEqual(nodes["N003"].choices[0].text, "")
        self.assertEqual(nodes["E001"].choices, ())

    def test_rejects_unknown_node_fields_instead_of_silently_ignoring_typos(self):
        invalid = VALID_SCRIPT.replace("- 选择标题：", "- 选择标提：", 1)

        with self.assertRaises(MODULE.DramaValidationError) as caught:
            MODULE.parse_markdown(invalid)

        self.assertIn("未知字段：选择标提", str(caught.exception))

    def test_rejects_invalid_graph_before_any_write(self):
        invalid = """# 作品：坏剧本

## 节点：A｜重复一
- 类型：起点
- 后续节点：MISSING

### 剧本
```text
第一段
```

## 节点：A｜重复二
- 类型：结局
- 分支：
  - 继续 → A

### 剧本
```text
第二段
```
"""

        with self.assertRaises(MODULE.DramaValidationError) as caught:
            MODULE.parse_markdown(invalid)

        message = str(caught.exception)
        self.assertIn("重复节点 ID", message)
        self.assertIn("后续目标不存在", message)
        self.assertIn("结局节点不能包含分支", message)

    def test_rejects_cycles_and_unreachable_nodes(self):
        invalid = """# 作品：循环剧本

## 节点：A｜起点
- 类型：起点
- 后续节点：B

### 剧本
```text
A
```

## 节点：B｜回环
- 类型：普通
- 后续节点：A

### 剧本
```text
B
```

## 节点：C｜孤立结局
- 类型：结局
- 后续节点：无

### 剧本
```text
C
```
"""

        with self.assertRaises(MODULE.DramaValidationError) as caught:
            MODULE.parse_markdown(invalid)

        message = str(caught.exception)
        self.assertIn("剧情不能形成循环：A → B → A", message)
        self.assertIn("节点无法从起点到达：C", message)


class DraftMergeTests(unittest.TestCase):
    def test_update_preserves_assets_and_only_valid_stable_video_bindings(self):
        document = MODULE.parse_markdown(VALID_SCRIPT)
        existing = {
            "id": "existing",
            "title": "旧标题",
            "startNodeId": "N001",
            "nodes": [
                {"id": "N001", "title": "旧节点", "type": "normal", "scriptText": "旧", "videoAssetId": "video-ok", "position": {"x": 1, "y": 2}, "choices": []},
                {"id": "N002", "title": "旧节点 2", "type": "ending", "scriptText": "旧", "videoAssetId": "video-failed", "position": {"x": 3, "y": 4}, "choices": []},
                {"id": "REMOVED", "title": "被删除", "type": "ending", "scriptText": "旧", "videoAssetId": "video-orphan", "position": {"x": 5, "y": 6}, "choices": []},
            ],
            "assets": [
                {"id": "video-ok", "name": "ok.mp4", "url": "https://cdn/ok.mp4", "status": "available", "durationSeconds": 3},
                {"id": "video-failed", "name": "bad.mp4", "url": "https://cdn/bad.mp4", "status": "failed", "durationSeconds": 3},
                {"id": "video-orphan", "name": "orphan.mp4", "url": "https://cdn/orphan.mp4", "status": "available", "durationSeconds": 3},
            ],
            "updatedAt": "2026-08-26T01:00:00.000Z",
        }

        draft = MODULE.build_draft(
            document,
            project_id="existing",
            updated_at=existing["updatedAt"],
            existing_draft=existing,
        )

        nodes = {node["id"]: node for node in draft["nodes"]}
        self.assertEqual(draft["assets"], existing["assets"])
        self.assertEqual(nodes["N001"]["videoAssetId"], "video-ok")
        self.assertIsNone(nodes["N002"]["videoAssetId"])
        self.assertNotIn("REMOVED", nodes)

        preview = MODULE.build_preview(document, "existing", existing)
        self.assertEqual(preview["changes"]["preservedVideoNodeIds"], ["N001"])
        self.assertEqual(preview["changes"]["droppedVideoNodeIds"], ["N002"])
        self.assertEqual(preview["changes"]["modifiedNodeIds"], ["N001", "N002"])
        self.assertEqual(
            preview["changes"]["videoBindingTitleChangedNodeIds"],
            ["N001"],
        )
        self.assertEqual(preview["scriptSha256"], document.source_sha256)


class HttpStudioClientTests(unittest.TestCase):
    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b'{"valid": true, "issues": []}'

    def test_post_without_body_omits_json_content_type(self):
        def fake_urlopen(request, timeout, **_kwargs):
            self.assertEqual(request.get_method(), "POST")
            self.assertIsNone(request.data)
            self.assertIsNone(request.get_header("Content-type"))
            self.assertEqual(timeout, 30.0)
            return self.Response()

        client = MODULE.HttpStudioClient("https://example.test")
        with patch.object(MODULE, "urlopen", fake_urlopen):
            result = client.validate_project("project-42")

        self.assertEqual(result, {"valid": True, "issues": []})

    def test_requests_keep_tls_verification_without_x509_strict(self):
        def fake_urlopen(_request, **kwargs):
            context = kwargs.get("context")
            self.assertIsNotNone(context)
            self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
            self.assertTrue(context.check_hostname)
            if hasattr(ssl, "VERIFY_X509_STRICT"):
                self.assertFalse(context.verify_flags & ssl.VERIFY_X509_STRICT)
            return self.Response()

        client = MODULE.HttpStudioClient("https://example.test")
        with patch.object(MODULE, "urlopen", fake_urlopen):
            result = client.validate_project("project-42")

        self.assertEqual(result, {"valid": True, "issues": []})


class ImportWorkflowTests(unittest.TestCase):
    def test_create_save_validate_publish_verify_and_return_all_links(self):
        document = MODULE.parse_markdown(VALID_SCRIPT)
        client = FakeClient()

        result = MODULE.execute_import(
            document,
            client=client,
            base_url="https://example.test/",
            expected_script_sha256=document.source_sha256,
        )

        self.assertEqual(
            client.calls,
            [
                ("create_project", "全球冰封"),
                ("save_draft", "project 42"),
                ("get_draft", "project 42"),
                ("validate_project", "project 42"),
                ("publish_project", "project 42"),
                ("get_manifest", "project 42", "v3"),
            ],
        )
        self.assertEqual(result["studioUrl"], "https://example.test/studio/projects/project%2042/edit")
        self.assertEqual(result["currentPlayerUrl"], "https://example.test/play/project%2042")
        self.assertEqual(result["versionPlayerUrl"], "https://example.test/play/project%2042?version=v3")
        self.assertEqual(result["version"], "v3")

    def test_update_stops_if_draft_changed_after_preview(self):
        existing = {
            "id": "existing",
            "title": "旧标题",
            "startNodeId": "N001",
            "nodes": [],
            "assets": [],
            "updatedAt": "2026-08-26T02:00:00.000Z",
        }
        client = FakeClient(existing)
        document = MODULE.parse_markdown(VALID_SCRIPT)

        with self.assertRaises(MODULE.ConcurrentEditError):
            MODULE.execute_import(
                document,
                client=client,
                base_url="https://example.test",
                project_id="existing",
                expected_updated_at="2026-08-26T01:00:00.000Z",
                expected_script_sha256=document.source_sha256,
            )

        self.assertEqual(client.calls, [("get_draft", "existing")])

    def test_apply_stops_if_script_changed_after_confirmation(self):
        client = FakeClient()
        document = MODULE.parse_markdown(VALID_SCRIPT)

        with self.assertRaises(MODULE.ConcurrentEditError):
            MODULE.execute_import(
                document,
                client=client,
                base_url="https://example.test",
                expected_script_sha256="not-the-reviewed-script",
            )

        self.assertEqual(client.calls, [])

    def test_publish_verification_error_keeps_known_version_and_links(self):
        client = FakeClient()
        client.get_manifest = lambda project_id, version: {
            "projectId": project_id,
            "version": "wrong-version",
        }
        document = MODULE.parse_markdown(VALID_SCRIPT)

        with self.assertRaises(MODULE.PublishedVerificationError) as caught:
            MODULE.execute_import(
                document,
                client=client,
                base_url="https://example.test",
                expected_script_sha256=document.source_sha256,
            )

        self.assertEqual(caught.exception.result["projectId"], "project 42")
        self.assertEqual(caught.exception.result["version"], "v3")
        self.assertEqual(
            caught.exception.result["versionPlayerUrl"],
            "https://example.test/play/project%2042?version=v3",
        )


if __name__ == "__main__":
    unittest.main()
