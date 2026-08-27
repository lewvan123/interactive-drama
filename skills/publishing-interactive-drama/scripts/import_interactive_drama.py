#!/usr/bin/env python3
"""Import a Markdown interactive script into the interactive-drama studio."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import ssl
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = "http://127.0.0.1:6001"
NODE_HEADER = re.compile(
    r"^##[ \t]+节点[：:][ \t]*([A-Za-z0-9][A-Za-z0-9._-]*)[ \t]*[｜|][ \t]*(.+?)[ \t]*$",
    re.MULTILINE,
)
PROJECT_HEADER = re.compile(r"^#[ \t]+作品[：:][ \t]*(.+?)[ \t]*$", re.MULTILINE)
SCRIPT_BLOCK = re.compile(
    r"^###\s+剧本\s*\n```(?:text|markdown|md)?\s*\n(.*?)\n```\s*$",
    re.MULTILINE | re.DOTALL,
)
TYPE_FIELD = re.compile(r"^-[ \t]*类型[：:][ \t]*(.+?)[ \t]*$", re.MULTILINE)
PROMPT_FIELD = re.compile(r"^-[ \t]*选择标题[：:][ \t]*(.*?)[ \t]*$", re.MULTILINE)
BRANCH_FIELD = re.compile(r"^-[ \t]*分支[：:][ \t]*(.*?)[ \t]*$", re.MULTILINE)
NEXT_FIELD = re.compile(r"^-[ \t]*后续节点[：:][ \t]*(.*?)[ \t]*$", re.MULTILINE)
BRANCH_LINE = re.compile(
    r"^[ \t]{2,}-[ \t]*(.+?)[ \t]*(?:→|->)[ \t]*([A-Za-z0-9][A-Za-z0-9._-]*)[ \t]*$",
    re.MULTILINE,
)
NODE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


class DramaImportError(Exception):
    """Base error for deterministic import failures."""


class DramaValidationError(DramaImportError):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("\n".join(f"- {error}" for error in errors))


class ConcurrentEditError(DramaImportError):
    """Raised when the draft changed after the user reviewed the plan."""


class ApiError(DramaImportError):
    """Raised for an unsuccessful studio API request."""


class PublishedVerificationError(ApiError):
    def __init__(self, message: str, result: dict[str, Any]):
        self.result = result
        super().__init__(message)


@dataclass(frozen=True)
class BranchSpec:
    text: str
    target_node_id: str


@dataclass(frozen=True)
class NodeSpec:
    id: str
    title: str
    kind: str
    choice_prompt: str | None
    script_text: str
    choices: tuple[BranchSpec, ...]
    line: int


@dataclass(frozen=True)
class DramaDocument:
    title: str
    start_node_id: str
    nodes: tuple[NodeSpec, ...]
    source_sha256: str


class StudioClient(Protocol):
    def get_draft(self, project_id: str) -> dict[str, Any]: ...
    def create_project(self, title: str) -> dict[str, Any]: ...
    def save_draft(self, project_id: str, draft: dict[str, Any]) -> dict[str, Any]: ...
    def validate_project(self, project_id: str) -> dict[str, Any]: ...
    def publish_project(self, project_id: str) -> dict[str, Any]: ...
    def get_manifest(self, project_id: str, version: str) -> dict[str, Any]: ...


def _line_number(text: str, offset: int) -> int:
    return text.count("\n", 0, offset) + 1


def _find_cycles(nodes_by_id: dict[str, NodeSpec]) -> list[str]:
    state: dict[str, int] = {}
    path: list[str] = []
    cycles: list[str] = []

    def visit(node_id: str) -> None:
        state[node_id] = 1
        path.append(node_id)
        for branch in nodes_by_id[node_id].choices:
            target = branch.target_node_id
            if target not in nodes_by_id:
                continue
            if state.get(target, 0) == 0:
                visit(target)
            elif state.get(target) == 1:
                start = path.index(target)
                rendered = " → ".join([*path[start:], target])
                if rendered not in cycles:
                    cycles.append(rendered)
        path.pop()
        state[node_id] = 2

    for node_id in nodes_by_id:
        if state.get(node_id, 0) == 0:
            visit(node_id)
    return cycles


def _validate_nodes(nodes: list[NodeSpec]) -> list[str]:
    errors: list[str] = []
    ids: dict[str, list[int]] = {}
    for node in nodes:
        ids.setdefault(node.id, []).append(node.line)
    for node_id, lines in ids.items():
        if len(lines) > 1:
            errors.append(
                f"重复节点 ID：{node_id}（第 {', '.join(map(str, lines))} 行）"
            )

    start_nodes = [node for node in nodes if node.kind == "start"]
    if len(start_nodes) != 1:
        errors.append(f"必须且只能有一个起点节点，当前有 {len(start_nodes)} 个")

    known_ids = set(ids)
    for node in nodes:
        if not node.script_text.strip():
            errors.append(f"节点 {node.id} 的剧本为空")
        if node.kind in {"start", "normal"} and not node.choices:
            errors.append(f"普通节点 {node.id} 至少需要一个后续节点")
        if node.kind == "ending" and node.choices:
            errors.append(f"结局节点不能包含分支：{node.id}")
        seen_branches: set[tuple[str, str]] = set()
        for branch in node.choices:
            key = (branch.text, branch.target_node_id)
            if key in seen_branches:
                errors.append(
                    f"节点 {node.id} 存在重复分支：{branch.text} → {branch.target_node_id}"
                )
            seen_branches.add(key)
            if branch.target_node_id not in known_ids:
                if branch.text:
                    errors.append(
                        f"分支目标不存在：{node.id} / “{branch.text}” → {branch.target_node_id}"
                    )
                else:
                    errors.append(
                        f"后续目标不存在：{node.id} → {branch.target_node_id}"
                    )

    unique_nodes = {node.id: node for node in nodes}
    for cycle in _find_cycles(unique_nodes):
        errors.append(f"剧情不能形成循环：{cycle}")

    if len(start_nodes) == 1 and start_nodes[0].id in unique_nodes:
        reachable: set[str] = set()
        pending = [start_nodes[0].id]
        while pending:
            node_id = pending.pop()
            if node_id in reachable or node_id not in unique_nodes:
                continue
            reachable.add(node_id)
            pending.extend(
                branch.target_node_id for branch in unique_nodes[node_id].choices
            )
        for node_id in unique_nodes:
            if node_id not in reachable:
                errors.append(f"节点无法从起点到达：{node_id}")
    return errors


def parse_markdown(markdown: str) -> DramaDocument:
    text = markdown.replace("\r\n", "\n").replace("\r", "\n")
    project_matches = list(PROJECT_HEADER.finditer(text))
    errors: list[str] = []
    if len(project_matches) != 1:
        errors.append("必须且只能包含一个“# 作品：作品名”标题")
        title = ""
    else:
        title = project_matches[0].group(1).strip()
        if not title:
            errors.append("作品名称不能为空")

    headers = list(NODE_HEADER.finditer(text))
    if not headers:
        errors.append("至少需要一个“## 节点：ID｜标题”节点")

    nodes: list[NodeSpec] = []
    for index, header in enumerate(headers):
        block_end = headers[index + 1].start() if index + 1 < len(headers) else len(text)
        block = text[header.end():block_end].strip()
        node_id = header.group(1).strip()
        node_title = header.group(2).strip()
        line = _line_number(text, header.start())
        type_match = TYPE_FIELD.search(block)
        branch_match = BRANCH_FIELD.search(block)
        next_match = NEXT_FIELD.search(block)
        script_match = SCRIPT_BLOCK.search(block)

        metadata = block[: script_match.start() if script_match else len(block)]
        for field in re.finditer(r"^-[ \t]*([^：:\n]+)[：:]", metadata, re.MULTILINE):
            label = field.group(1).strip()
            if label not in {"类型", "选择标题", "分支", "后续节点"}:
                errors.append(f"节点 {node_id} 包含未知字段：{label}")

        raw_type = type_match.group(1).strip() if type_match else ""
        kind_map = {"起点": "start", "普通": "normal", "结局": "ending"}
        kind = kind_map.get(raw_type, "invalid")
        if not node_title:
            errors.append(f"第 {line} 行节点标题不能为空")
        if kind == "invalid":
            errors.append(f"节点 {node_id} 的类型必须是：起点、普通或结局")
        if branch_match is None and next_match is None:
            errors.append(f"节点 {node_id} 缺少“- 后续节点：”或“- 分支：”")
        if branch_match is not None and next_match is not None:
            errors.append(f"节点 {node_id} 不能同时填写“后续节点”和“分支”")
        if script_match is None:
            errors.append(f"节点 {node_id} 缺少 fenced “### 剧本”代码块")

        prompt_match = PROMPT_FIELD.search(block)
        prompt = prompt_match.group(1).strip() if prompt_match else ""
        branch_value = branch_match.group(1).strip() if branch_match else ""
        branch_choices = tuple(
            BranchSpec(match.group(1).strip(), match.group(2).strip())
            for match in BRANCH_LINE.finditer(block[: script_match.start() if script_match else len(block)])
        )
        choices: tuple[BranchSpec, ...] = ()
        if branch_match is not None:
            choices = branch_choices
            if branch_value:
                errors.append(f"节点 {node_id} 的“- 分支：”后必须留空")
            if len(branch_choices) == 1:
                errors.append(
                    f"节点 {node_id} 只有一个后续，单一后续请使用"
                    f"“- 后续节点：{branch_choices[0].target_node_id}”"
                )
        elif next_match is not None:
            next_value = next_match.group(1).strip()
            if next_value == "无":
                choices = ()
            elif NODE_ID.fullmatch(next_value):
                choices = (BranchSpec("", next_value),)
            else:
                errors.append(
                    f"节点 {node_id} 的“后续节点”必须填写节点 ID 或“无”"
                )

        nodes.append(
            NodeSpec(
                id=node_id,
                title=node_title,
                kind=kind,
                choice_prompt=prompt or None,
                script_text=script_match.group(1).strip() if script_match else "",
                choices=choices,
                line=line,
            )
        )

    errors.extend(_validate_nodes(nodes))
    if errors:
        raise DramaValidationError(errors)
    start_node_id = next(node.id for node in nodes if node.kind == "start")
    return DramaDocument(
        title=title,
        start_node_id=start_node_id,
        nodes=tuple(nodes),
        source_sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(),
    )


def _choice_id(source_id: str, branch: BranchSpec) -> str:
    digest = hashlib.sha256(
        f"{source_id}\0{branch.text}\0{branch.target_node_id}".encode("utf-8")
    ).hexdigest()[:16]
    return f"choice-{digest}"


def _layout(document: DramaDocument) -> dict[str, dict[str, float | int]]:
    by_id = {node.id: node for node in document.nodes}
    order = {node.id: index for index, node in enumerate(document.nodes)}
    indegree = {node.id: 0 for node in document.nodes}
    depth = {node.id: 0 for node in document.nodes}
    for node in document.nodes:
        for branch in node.choices:
            indegree[branch.target_node_id] += 1
    queue = sorted((node_id for node_id, degree in indegree.items() if degree == 0), key=order.get)
    for source_id in queue:
        for branch in by_id[source_id].choices:
            target_id = branch.target_node_id
            depth[target_id] = max(depth[target_id], depth[source_id] + 1)
            indegree[target_id] -= 1
            if indegree[target_id] == 0:
                queue.append(target_id)

    layers: dict[int, list[str]] = {}
    for node in document.nodes:
        layers.setdefault(depth[node.id], []).append(node.id)
    positions: dict[str, dict[str, float | int]] = {}
    for layer, node_ids in layers.items():
        for row, node_id in enumerate(node_ids):
            positions[node_id] = {"x": layer * 320, "y": row * 160}
    return positions


def build_draft(
    document: DramaDocument,
    project_id: str,
    updated_at: str,
    existing_draft: dict[str, Any] | None = None,
) -> dict[str, Any]:
    assets = list((existing_draft or {}).get("assets", []))
    available_asset_ids = {
        asset.get("id") for asset in assets if asset.get("status") == "available"
    }
    existing_nodes = {
        node.get("id"): node for node in (existing_draft or {}).get("nodes", [])
    }
    existing_choices: dict[tuple[str, str, str], str] = {}
    for source_id, node in existing_nodes.items():
        for choice in node.get("choices", []):
            existing_choices[
                (source_id, choice.get("text", ""), choice.get("targetNodeId", ""))
            ] = choice.get("id", "")

    positions = _layout(document)
    nodes: list[dict[str, Any]] = []
    for node in document.nodes:
        existing_video = existing_nodes.get(node.id, {}).get("videoAssetId")
        video_asset_id = (
            existing_video if existing_video in available_asset_ids else None
        )
        choices = []
        for index, branch in enumerate(node.choices):
            old_id = existing_choices.get((node.id, branch.text, branch.target_node_id))
            choices.append(
                {
                    "id": old_id or _choice_id(node.id, branch),
                    "text": branch.text,
                    "targetNodeId": branch.target_node_id,
                    "order": index,
                }
            )
        rendered: dict[str, Any] = {
            "id": node.id,
            "title": node.title,
            "type": "ending" if node.kind == "ending" else "normal",
            "scriptText": node.script_text,
            "videoAssetId": video_asset_id,
            "position": positions[node.id],
            "choices": choices,
        }
        if len(choices) >= 2 and node.choice_prompt:
            rendered["choicePrompt"] = node.choice_prompt
        nodes.append(rendered)

    return {
        "id": project_id,
        "title": document.title,
        "startNodeId": document.start_node_id,
        "nodes": nodes,
        "assets": assets,
        "updatedAt": updated_at,
    }


def build_preview(
    document: DramaDocument,
    project_id: str | None = None,
    existing_draft: dict[str, Any] | None = None,
) -> dict[str, Any]:
    old_nodes = {
        node.get("id"): node for node in (existing_draft or {}).get("nodes", [])
    }
    available_asset_ids = {
        asset.get("id")
        for asset in (existing_draft or {}).get("assets", [])
        if asset.get("status") == "available"
    }
    new_ids = {node.id for node in document.nodes}
    preserved_video_nodes = []
    dropped_video_nodes = []
    for node_id in new_ids & set(old_nodes):
        asset_id = old_nodes[node_id].get("videoAssetId")
        if asset_id in available_asset_ids:
            preserved_video_nodes.append(node_id)
        elif asset_id:
            dropped_video_nodes.append(node_id)
    warnings = [
        f"节点 {node.id} 只有一个后续，“选择标题”不会在播放端展示"
        for node in document.nodes
        if node.choice_prompt and len(node.choices) < 2
    ]
    modified_node_ids: list[str] = []
    video_binding_title_changed_node_ids: list[str] = []
    if project_id and existing_draft:
        proposed = build_draft(
            document,
            project_id,
            existing_draft.get("updatedAt", ""),
            existing_draft,
        )

        def comparable(node: dict[str, Any]) -> dict[str, Any]:
            return {
                "title": node.get("title"),
                "type": node.get("type"),
                "choicePrompt": node.get("choicePrompt") or None,
                "scriptText": node.get("scriptText", ""),
                "choices": [
                    {
                        "text": choice.get("text"),
                        "targetNodeId": choice.get("targetNodeId"),
                        "order": choice.get("order"),
                    }
                    for choice in sorted(
                        node.get("choices", []), key=lambda item: item.get("order", 0)
                    )
                ],
            }

        proposed_nodes = {node["id"]: node for node in proposed["nodes"]}
        for node_id in sorted(new_ids & set(old_nodes)):
            if comparable(old_nodes[node_id]) != comparable(proposed_nodes[node_id]):
                modified_node_ids.append(node_id)
            if (
                node_id in preserved_video_nodes
                and old_nodes[node_id].get("title") != proposed_nodes[node_id].get("title")
            ):
                video_binding_title_changed_node_ids.append(node_id)
    return {
        "mode": "update" if project_id else "create",
        "projectId": project_id,
        "projectTitle": document.title,
        "scriptSha256": document.source_sha256,
        "expectedUpdatedAt": (existing_draft or {}).get("updatedAt"),
        "nodeCount": len(document.nodes),
        "choiceCount": sum(len(node.choices) for node in document.nodes),
        "startNode": document.start_node_id,
        "endingNodes": [node.id for node in document.nodes if node.kind == "ending"],
        "branchingNodes": [
            {
                "id": node.id,
                "choicePrompt": node.choice_prompt or "你会怎么选？",
                "choices": [
                    {"text": branch.text, "targetNodeId": branch.target_node_id}
                    for branch in node.choices
                ],
            }
            for node in document.nodes
            if len(node.choices) >= 2
        ],
        "changes": {
            "addedNodeIds": sorted(new_ids - set(old_nodes)),
            "removedNodeIds": sorted(set(old_nodes) - new_ids),
            "modifiedNodeIds": modified_node_ids,
            "preservedVideoNodeIds": sorted(preserved_video_nodes),
            "droppedVideoNodeIds": sorted(dropped_video_nodes),
            "videoBindingTitleChangedNodeIds": video_binding_title_changed_node_ids,
            "preservedAssetCount": len((existing_draft or {}).get("assets", [])),
        },
        "warnings": warnings,
    }


class HttpStudioClient:
    def __init__(self, base_url: str, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.ssl_context = ssl.create_default_context()
        self.ssl_context.verify_flags &= ~getattr(ssl, "VERIFY_X509_STRICT", 0)

    def _request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        headers = {
            "Accept": "application/json",
            "User-Agent": "publishing-interactive-drama/1.0",
        }
        if data is not None:
            headers["Content-Type"] = "application/json"
        request = Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers=headers,
        )
        try:
            with urlopen(
                request,
                timeout=self.timeout,
                context=self.ssl_context,
            ) as response:
                payload = response.read().decode("utf-8")
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise ApiError(f"{method} {path} 返回 HTTP {error.code}: {detail}") from error
        except URLError as error:
            raise ApiError(f"{method} {path} 请求失败：{error.reason}") from error
        try:
            return json.loads(payload) if payload else {}
        except json.JSONDecodeError as error:
            raise ApiError(f"{method} {path} 返回了非 JSON 内容") from error

    def get_draft(self, project_id: str) -> dict[str, Any]:
        return self._request("GET", f"/api/projects/{quote(project_id, safe='')}/draft")

    def create_project(self, title: str) -> dict[str, Any]:
        return self._request("POST", "/api/projects", {"title": title})

    def save_draft(self, project_id: str, draft: dict[str, Any]) -> dict[str, Any]:
        return self._request(
            "PUT", f"/api/projects/{quote(project_id, safe='')}/draft", draft
        )

    def validate_project(self, project_id: str) -> dict[str, Any]:
        return self._request(
            "POST", f"/api/projects/{quote(project_id, safe='')}/validate"
        )

    def publish_project(self, project_id: str) -> dict[str, Any]:
        return self._request(
            "POST", f"/api/projects/{quote(project_id, safe='')}/publish"
        )

    def get_manifest(self, project_id: str, version: str) -> dict[str, Any]:
        query = urlencode({"version": version})
        return self._request(
            "GET",
            f"/api/public/projects/{quote(project_id, safe='')}/manifest?{query}",
        )


def execute_import(
    document: DramaDocument,
    client: StudioClient,
    base_url: str,
    project_id: str | None = None,
    expected_updated_at: str | None = None,
    expected_script_sha256: str | None = None,
) -> dict[str, Any]:
    if expected_script_sha256 != document.source_sha256:
        raise ConcurrentEditError(
            "剧本文件在确认后已变化，已停止写入；请重新生成预览清单并确认"
        )
    if project_id:
        if not expected_updated_at:
            raise ConcurrentEditError("更新已有项目必须提供预览阶段的 expectedUpdatedAt")
        initial_draft = client.get_draft(project_id)
        if initial_draft.get("updatedAt") != expected_updated_at:
            raise ConcurrentEditError(
                "草稿在确认后已被修改，已停止写入；请重新生成预览清单并确认"
            )
    else:
        created = client.create_project(document.title)
        project_id = created["project"]["id"]
        initial_draft = created["draft"]

    draft = build_draft(
        document,
        project_id=project_id,
        updated_at=initial_draft["updatedAt"],
        existing_draft=initial_draft,
    )
    client.save_draft(project_id, draft)
    saved_readback = client.get_draft(project_id)
    expected_content = {key: value for key, value in draft.items() if key != "updatedAt"}
    actual_content = {
        key: value for key, value in saved_readback.items() if key != "updatedAt"
    }
    if actual_content != expected_content:
        raise ConcurrentEditError(
            "草稿保存后又发生变化，已停止发布；请重新预检并确认"
        )
    validation = client.validate_project(project_id)
    if not validation.get("valid"):
        raise ApiError(
            "草稿已保存，但服务端发布检查未通过："
            + json.dumps(validation.get("issues", []), ensure_ascii=False)
        )
    release = client.publish_project(project_id)
    version = release.get("version")
    if not isinstance(version, str):
        raise ApiError("发布响应缺少版本号")
    root = base_url.rstrip("/")
    encoded_project_id = quote(project_id, safe="")
    result = {
        "projectId": project_id,
        "version": version,
        "publishedAt": release.get("publishedAt"),
        "manifestUrl": release.get("manifestUrl"),
        "studioUrl": f"{root}/studio/projects/{encoded_project_id}/edit",
        "currentPlayerUrl": f"{root}/play/{encoded_project_id}",
        "versionPlayerUrl": f"{root}/play/{encoded_project_id}?{urlencode({'version': version})}",
    }
    try:
        manifest = client.get_manifest(project_id, version)
    except ApiError as error:
        raise PublishedVerificationError(
            f"版本 {version} 已发布，但固定版本 Manifest 回读失败：{error}",
            result,
        ) from error
    if manifest.get("projectId") != project_id or manifest.get("version") != version:
        raise PublishedVerificationError(
            f"版本 {version} 已发布，但固定版本 Manifest 回读内容不匹配",
            result,
        )
    return result


def _print_human(payload: dict[str, Any]) -> None:
    if "version" in payload:
        print(f"发布成功：{payload['projectId']} {payload['version']}")
        print(f"制作后台：{payload['studioUrl']}")
        print(f"当前 H5：{payload['currentPlayerUrl']}")
        print(f"固定版本 H5：{payload['versionPlayerUrl']}")
        return
    print(f"模式：{'更新已有项目' if payload['mode'] == 'update' else '创建新项目'}")
    print(f"作品：{payload['projectTitle']}")
    print(f"节点：{payload['nodeCount']}，分支：{payload['choiceCount']}")
    print(f"起点：{payload['startNode']}，结局：{', '.join(payload['endingNodes'])}")
    if payload["changes"]["removedNodeIds"]:
        print("将删除节点：" + ", ".join(payload["changes"]["removedNodeIds"]))
    if payload["changes"]["modifiedNodeIds"]:
        print("将修改节点：" + ", ".join(payload["changes"]["modifiedNodeIds"]))
    if payload["changes"]["preservedVideoNodeIds"]:
        print("保留视频绑定：" + ", ".join(payload["changes"]["preservedVideoNodeIds"]))
    if payload["changes"]["droppedVideoNodeIds"]:
        print("失效视频绑定：" + ", ".join(payload["changes"]["droppedVideoNodeIds"]))
    if payload["changes"]["videoBindingTitleChangedNodeIds"]:
        print(
            "需重点核对（标题变化但保留视频）："
            + ", ".join(payload["changes"]["videoBindingTitleChangedNodeIds"])
        )
    print("剧本 SHA-256：" + payload["scriptSha256"])
    for warning in payload["warnings"]:
        print("警告：" + warning)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="从标准 Markdown 互动剧本创建或更新制作平台项目"
    )
    parser.add_argument("script", type=Path, help="互动剧本 Markdown 文件")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="制作平台地址")
    parser.add_argument("--project-id", help="仅在明确更新已有项目时传入")
    parser.add_argument("--expected-updated-at", help="更新模式预览返回的时间戳")
    parser.add_argument("--expected-script-sha256", help="预览返回的剧本 SHA-256")
    parser.add_argument("--apply", action="store_true", help="执行写入并发布")
    parser.add_argument("--yes", action="store_true", help="确认已获得用户授权")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    args = parser.parse_args(argv)

    try:
        document = parse_markdown(args.script.read_text(encoding="utf-8"))
        client = HttpStudioClient(args.base_url)
        if args.apply:
            if not args.yes:
                raise DramaImportError("执行写入必须同时传入 --yes")
            result = execute_import(
                document,
                client=client,
                base_url=args.base_url,
                project_id=args.project_id,
                expected_updated_at=args.expected_updated_at,
                expected_script_sha256=args.expected_script_sha256,
            )
        else:
            existing = client.get_draft(args.project_id) if args.project_id else None
            result = build_preview(document, args.project_id, existing)
        if args.format == "json":
            print(json.dumps(result, ensure_ascii=False, indent=2))
        else:
            _print_human(result)
        return 0
    except (OSError, DramaImportError, KeyError) as error:
        if args.format == "json":
            payload: dict[str, Any] = {"error": str(error)}
            if isinstance(error, DramaValidationError):
                payload = {"valid": False, "errors": error.errors}
            elif isinstance(error, PublishedVerificationError):
                payload["publishedResult"] = error.result
            print(json.dumps(payload, ensure_ascii=False, indent=2), file=sys.stderr)
        else:
            print(f"错误：{error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
