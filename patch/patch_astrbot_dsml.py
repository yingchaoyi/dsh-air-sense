#!/usr/bin/env python3
"""给 AstrBot 的 dsh 桥插件加一道出口清洗：剥掉模型偶发吐出的 ||DSML|| 工具调用方言。

用法：
    python3 patch/patch_astrbot_dsml.py /path/to/astrbot_plugin_dsh/main.py

背景：模型偶尔会把 `<||DSML||invoke>` 这类内部工具调用标记当成正文吐出来，直接发到群里
就是一行乱码。DSH 侧没有合适的出站钩子，所以在 AstrBot 桥的发送路径上兜一层。
幂等：已经打过就什么都不做。
"""
from __future__ import annotations

import sys
from pathlib import Path

METHOD = '''    _DSML_TAG_RE = re.compile(
        r"</?\\s*\\|{1,2}\\s*DSML\\s*\\|{1,2}\\s*[A-Za-z_]*\\s*>", re.IGNORECASE
    )
    _DSML_LOOSE_RE = re.compile(
        r"\\|{2}\\s*DSML\\s*\\|{2}\\s*[A-Za-z_]*\\s*>?", re.IGNORECASE
    )

    def _strip_dsml(self, text: str) -> str:
        """模型偶尔把工具调用方言（||DSML||invoke 之类）当正文吐出来，发群前剥掉。"""
        if not text or "DSML" not in text:
            return text
        out = self._DSML_TAG_RE.sub("", text)
        out = self._DSML_LOOSE_RE.sub("", out)
        out = re.sub(r"[ \\t]{2,}", " ", out)
        out = re.sub(r"\\n{3,}", "\\n\\n", out).strip()
        return out

'''

ANCHOR = "    def _split_markdown_images(self, text: str) -> list[tuple[str, str]]:"

OLD_STREAM = """        async for chunk in self._forward(event, payload, hist_id):
            if not isinstance(chunk, str) or not chunk.strip():
                continue
            for kind, value in self._split_markdown_images(chunk):"""

NEW_STREAM = """        async for chunk in self._forward(event, payload, hist_id):
            if not isinstance(chunk, str) or not chunk.strip():
                continue
            chunk = self._strip_dsml(chunk)
            if not chunk.strip():
                continue
            for kind, value in self._split_markdown_images(chunk):"""


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = Path(sys.argv[1]).expanduser()
    src = path.read_text(encoding="utf-8")
    if "_strip_dsml" in src:
        print("已经打过补丁，跳过")
        return 0
    if ANCHOR not in src:
        print("找不到 _split_markdown_images 附近的位置，版本可能变了", file=sys.stderr)
        return 1
    if OLD_STREAM not in src:
        print("找不到 _stream_turn 里的发送循环，版本可能变了", file=sys.stderr)
        return 1
    out = src.replace(ANCHOR, METHOD + ANCHOR, 1).replace(OLD_STREAM, NEW_STREAM, 1)
    backup = path.with_suffix(path.suffix + ".before-dsml")
    backup.write_text(src, encoding="utf-8")
    path.write_text(out, encoding="utf-8")
    print(f"补丁已打：{path}（备份 {backup}）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
