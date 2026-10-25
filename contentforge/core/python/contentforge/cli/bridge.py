"""ContentForge CLI Python Bridge

此模块作为 Go CLI 与 Python 核心之间的桥接层。
Go 通过 subprocess 调用此模块，传递操作和参数。
"""
import argparse
import json
import logging
import sys
from pathlib import Path

# 将 core/python 加入路径
CORE_PYTHON = Path(__file__).parent.parent
if str(CORE_PYTHON) not in sys.path:
    sys.path.insert(0, str(CORE_PYTHON))

from contentforge.config import ContentForgeConfig
from contentforge.ingestion.agent_reach import AgentReachIngestor
from contentforge.ingestion.web_scraper import WebScraper
from contentforge.ingestion.health_check import HealthChecker
from contentforge.models import ContentUnit
from contentforge.processing.ai_engine import AIConfig, AIEngine
from contentforge.processing.summarizer import Summarizer
from contentforge.processing.xiaohongshu_converter import XiaohongshuConverter
from contentforge.processing.analyzer import Analyzer
from contentforge.processing.translator import Translator
from contentforge.pipeline.presets import get_preset, list_presets
from contentforge.pipeline.runner import PipelineRunner
from contentforge.pipeline.engine import PipelineEngine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("contentforge.cli.bridge")


def load_config() -> ContentForgeConfig:
    return ContentForgeConfig.load()


def cmd_scrape(args: argparse.Namespace) -> int:
    config = load_config()
    url = args.url
    backend = args.backend
    content_type = args.type

    try:
        if backend == "jina":
            scraper = WebScraper(jina_base=config.ingestion.jina_reader_base)
            unit = scraper.fetch(url)
        else:
            ingestor = AgentReachIngestor(agent_reach_path=config.ingestion.agent_reach_path)
            unit = ingestor.fetch(url)
        print(json.dumps(unit.to_dict(), ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        logger.error("Scrape failed: %s", exc)
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1


def cmd_process(args: argparse.Namespace) -> int:
    config = load_config()
    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)
    unit = ContentUnit.from_dict(data)

    engine = AIEngine(AIConfig(
        provider=config.ai.provider,
        api_key=config.ai.api_key,
        base_url=config.ai.base_url,
        model=config.ai.model,
    ))

    try:
        if args.mode == "summarize":
            summarizer = Summarizer(engine)
            result = summarizer.summarize(unit, max_length=args.max_length)
            print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
        elif args.mode == "xiaohongshu":
            converter = XiaohongshuConverter(engine)
            result = converter.convert(unit, max_length=args.max_length)
            print(json.dumps(result, ensure_ascii=False, indent=2))
        elif args.mode == "analyze":
            analyzer = Analyzer(engine)
            result = analyzer.analyze(unit)
            print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
        elif args.mode == "translate":
            translator = Translator(engine)
            result = translator.translate(unit, target_lang=args.target_lang)
            print(json.dumps(result.to_dict(), ensure_ascii=False, indent=2))
        elif args.mode == "rewrite":
            text = unit.extracted_text or unit.description
            rewritten = engine.rewrite(text, style=args.tone)
            print(json.dumps({"rewritten_text": rewritten}, ensure_ascii=False, indent=2))
        else:
            logger.error("Unknown process mode: %s", args.mode)
            return 1
        return 0
    except Exception as exc:
        logger.error("Process failed: %s", exc)
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1


def cmd_publish(args: argparse.Namespace) -> int:
    with open(args.input, "r", encoding="utf-8") as f:
        data = json.load(f)
    fmt = args.format
    if fmt == "markdown":
        text = data.get("body", data.get("extracted_text", json.dumps(data, ensure_ascii=False, indent=2)))
        print(text)
    elif fmt == "json":
        print(json.dumps(data, ensure_ascii=False, indent=2))
    elif fmt == "text":
        text = data.get("extracted_text", data.get("body", ""))
        print(text)
    elif fmt == "html":
        import html
        text = data.get("body", data.get("extracted_text", ""))
        print(f"<html><body><pre>{html.escape(text)}</pre></body></html>")
    else:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0


def cmd_pipeline_list(args: argparse.Namespace) -> int:
    presets = list_presets()
    print(json.dumps(presets, ensure_ascii=False, indent=2))
    return 0


def cmd_pipeline_run(args: argparse.Namespace) -> int:
    config = load_config()
    preset = get_preset(args.preset)
    engine = PipelineEngine()
    runner = PipelineRunner(engine, state_dir=config.pipeline.state_dir)

    inputs = {}
    if args.url:
        inputs["url"] = args.url
    if args.feed_url:
        inputs["feed_url"] = args.feed_url
    if args.input:
        with open(args.input, "r", encoding="utf-8") as f:
            inputs["input_data"] = json.load(f)

    run = runner.run(preset, inputs=inputs, run_id=args.run_id)
    print(json.dumps(run.to_dict(), ensure_ascii=False, indent=2))
    return 0


def cmd_pipeline_create(args: argparse.Namespace) -> int:
    preset = get_preset(args.preset)
    preset.name = args.new_name
    preset.id = args.new_name.replace(" ", "-").lower()
    output = args.output
    if output:
        with open(output, "w", encoding="utf-8") as f:
            json.dump(preset.to_dict(), f, ensure_ascii=False, indent=2)
    else:
        print(json.dumps(preset.to_dict(), ensure_ascii=False, indent=2))
    return 0


def cmd_pipeline_status(args: argparse.Namespace) -> int:
    config = load_config()
    engine = PipelineEngine()
    runner = PipelineRunner(engine, state_dir=config.pipeline.state_dir)
    if args.run_id:
        run = runner.get_run(args.run_id)
        if run:
            print(json.dumps(run.to_dict(), ensure_ascii=False, indent=2))
        else:
            print(json.dumps({"error": f"Run not found: {args.run_id}"}), file=sys.stderr)
            return 1
    else:
        runs = runner.list_runs()
        print(json.dumps([r.to_dict() for r in runs], ensure_ascii=False, indent=2))
    return 0


def main():
    parser = argparse.ArgumentParser(description="ContentForge CLI Bridge")
    subparsers = parser.add_subparsers(dest="command")

    # scrape
    scrape_parser = subparsers.add_parser("scrape")
    scrape_parser.add_argument("--url", required=True)
    scrape_parser.add_argument("--type", default="auto")
    scrape_parser.add_argument("--backend", default="agent-reach")
    scrape_parser.add_argument("--limit", type=int, default=10)

    # process
    process_parser = subparsers.add_parser("process")
    process_parser.add_argument("--input", required=True)
    process_parser.add_argument("--mode", default="summarize")
    process_parser.add_argument("--target-lang", default="zh")
    process_parser.add_argument("--tone", default="friendly")
    process_parser.add_argument("--style", default="standard")
    process_parser.add_argument("--max-length", type=int, default=800)

    # publish
    publish_parser = subparsers.add_parser("publish")
    publish_parser.add_argument("--input", required=True)
    publish_parser.add_argument("--format", default="markdown")
    publish_parser.add_argument("--profile", default="")

    # pipeline_list
    subparsers.add_parser("pipeline_list")

    # pipeline_run
    pipeline_run_parser = subparsers.add_parser("pipeline_run")
    pipeline_run_parser.add_argument("--preset", required=True)
    pipeline_run_parser.add_argument("--run-id", default="")
    pipeline_run_parser.add_argument("--url", default="")
    pipeline_run_parser.add_argument("--feed-url", default="")
    pipeline_run_parser.add_argument("--input", default="")
    pipeline_run_parser.add_argument("--output", default="")

    # pipeline_create
    pipeline_create_parser = subparsers.add_parser("pipeline_create")
    pipeline_create_parser.add_argument("--preset", required=True)
    pipeline_create_parser.add_argument("--new-name", required=True)
    pipeline_create_parser.add_argument("--output", default="")

    # pipeline_status
    pipeline_status_parser = subparsers.add_parser("pipeline_status")
    pipeline_status_parser.add_argument("--run-id", default="")

    args = parser.parse_args()

    if args.command == "scrape":
        sys.exit(cmd_scrape(args))
    elif args.command == "process":
        sys.exit(cmd_process(args))
    elif args.command == "publish":
        sys.exit(cmd_publish(args))
    elif args.command == "pipeline_list":
        sys.exit(cmd_pipeline_list(args))
    elif args.command == "pipeline_run":
        sys.exit(cmd_pipeline_run(args))
    elif args.command == "pipeline_create":
        sys.exit(cmd_pipeline_create(args))
    elif args.command == "pipeline_status":
        sys.exit(cmd_pipeline_status(args))
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
