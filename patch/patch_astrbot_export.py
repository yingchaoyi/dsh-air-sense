#!/usr/bin/env python3
"""给 AstrBot 的 dsh 桥插件加两道出口保护：

1. 剥掉模型偶发吐出的内部标记：`||DSML||invoke`、`<acp tokens="20">m05009`、`</ap>`。
2. 图片发送被 QQ 拒收（rich media transfer failed）时，转成白底 JPEG 再试一次。

用法：
    python3 patch/patch_astrbot_export.py /path/to/astrbot_plugin_dsh/main.py

幂等：已经打过的部分会跳过。
"""
from __future__ import annotations

import sys
from pathlib import Path

ACP_FIELDS = '''    _ACP_TAG_RE = re.compile(r"<acp\\b[^>]*>|</acp>|</?ap>", re.IGNORECASE)
    _ACP_REF_RE = re.compile(r"(?<![A-Za-z0-9])m\\d{5}(?![A-Za-z0-9])")
'''

OLD_STRIP = '''        if not text or "DSML" not in text:
            return text
        out = self._DSML_TAG_RE.sub("", text)
        out = self._DSML_LOOSE_RE.sub("", out)'''

NEW_STRIP = '''        if not text:
            return text
        out = text
        if "DSML" in out:
            out = self._DSML_TAG_RE.sub("", out)
            out = self._DSML_LOOSE_RE.sub("", out)
        if "acp" in out.lower() or "</ap>" in out.lower():
            out = self._ACP_TAG_RE.sub("", out)
            out = self._ACP_REF_RE.sub("", out)'''

JPEG_HELPER = '''    def _to_jpeg(self, src: Path, max_side: int = 1280) -> Path | None:
        """PNG/透明通道在 NapCat 上常被 QQ 拒收，转成白底 JPEG 再试一次。"""
        try:
            from PIL import Image as _PILImage
        except Exception:
            return None
        try:
            im = _PILImage.open(src)
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                bg = _PILImage.new("RGB", im.size, (255, 255, 255))
                bg.paste(im, mask=im.split()[-1])
                im = bg
            else:
                im = im.convert("RGB")
            im.thumbnail((max_side, max_side))
            out = src.with_name(src.stem + ".retry.jpg")
            im.save(out, "JPEG", quality=88)
            return out
        except Exception as exc:
            logger.warning("[dsh] 图片转 JPEG 失败：%s", exc)
            return None

'''

OLD_SEND = '''        if self._is_inline_image(file_name, size):
            try:
                await self._deliver(event, event.chain_result([Image.fromFileSystem(str(src))]))
            except Exception as exc:
                logger.warning("send image failed: %s", exc)
                yield f"发送图片失败：{file_name}（{exc}）"
            return'''

NEW_SEND = '''        if self._is_inline_image(file_name, size):
            try:
                await self._deliver(event, event.chain_result([Image.fromFileSystem(str(src))]))
                return
            except Exception as exc:
                logger.warning("send image failed: %s", exc)
                retried = self._to_jpeg(src)
                if retried is not None:
                    try:
                        await self._deliver(event, event.chain_result([Image.fromFileSystem(str(retried))]))
                        logger.info("[dsh] 图片转 JPEG 后重发成功：%s", file_name)
                        return
                    except Exception as exc2:
                        logger.warning("send image retry failed: %s", exc2)
                    finally:
                        try:
                            retried.unlink(missing_ok=True)
                        except OSError:
                            pass
                yield f"发图失败：{file_name} —— QQ 那边拒收（rich media），八成是风控，过会儿再试。"
            return'''

SEND_ANCHOR = "    async def _send_outbound_file(self, event: AstrMessageEvent, src: Path, file_name: str) -> AsyncIterator[str]:"
STRIP_ANCHOR = "    def _strip_dsml(self, text: str) -> str:"


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    path = Path(sys.argv[1]).expanduser()
    src = path.read_text(encoding="utf-8")
    changed = []

    if "_ACP_TAG_RE" not in src:
        if STRIP_ANCHOR not in src or OLD_STRIP not in src:
            print("找不到可以升级的 _strip_dsml，请先跑 patch_astrbot_dsml.py")
            return 1
        src = src.replace(OLD_STRIP, NEW_STRIP, 1)
        src = src.replace(STRIP_ANCHOR, ACP_FIELDS + STRIP_ANCHOR, 1)
        changed.append("清理内部标记")

    if "_to_jpeg" not in src:
        if SEND_ANCHOR not in src or OLD_SEND not in src:
            print("找不到可以改的图片发送块")
            return 1
        src = src.replace(SEND_ANCHOR, JPEG_HELPER + SEND_ANCHOR, 1)
        src = src.replace(OLD_SEND, NEW_SEND, 1)
        changed.append("发图转 JPEG 兜底")

    if not changed:
        print("已经打过补丁，跳过")
        return 0
    path.write_text(src, encoding="utf-8")
    print("已打补丁：" + "、".join(changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())
