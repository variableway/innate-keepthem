"""ContentForge Python CLI Entry Point — 供 Go 后端通过子进程调用"""

import json
import logging
import sys
from typing import Any, Dict


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stderr,
    )


def write_result(data: Dict[str, Any]) -> None:
    """输出 JSON 结果到 stdout"""
    print(json.dumps(data, ensure_ascii=False))


def main() -> None:
    setup_logging()
    logger = logging.getLogger("contentforge.cli")

    if len(sys.argv) < 2:
        write_result({"success": False, "error": "No subcommand specified"})
        sys.exit(1)

    subcommand = sys.argv[1]
    args = sys.argv[2:]

    # 读取 stdin 中的 JSON payload（如果存在）
    payload: Dict[str, Any] = {}
    if not sys.stdin.isatty():
        try:
            stdin_text = sys.stdin.read()
            if stdin_text.strip():
                payload = json.loads(stdin_text)
        except json.JSONDecodeError as exc:
            logger.warning("Invalid JSON from stdin: %s", exc)

    logger.info("CLI subcommand: %s", subcommand)

    try:
        if subcommand == "scrape":
            from contentforge.cli.scrape import handle_scrape
            result = handle_scrape(payload)
        elif subcommand == "process":
            from contentforge.cli.process import handle_process
            result = handle_process(payload)
        elif subcommand == "publish":
            from contentforge.cli.publish import handle_publish
            result = handle_publish(payload)
        elif subcommand == "pipeline":
            from contentforge.cli.pipeline import handle_pipeline
            result = handle_pipeline(payload)
        else:
            write_result({"success": False, "error": f"Unknown subcommand: {subcommand}"})
            sys.exit(1)

        write_result(result)
    except Exception as exc:
        logger.exception("CLI error: %s", exc)
        write_result({"success": False, "error": str(exc)})
        sys.exit(1)


if __name__ == "__main__":
    main()
