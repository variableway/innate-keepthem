"""健康检查 — 检测各平台可用性。"""
import json
import logging
import subprocess
from dataclasses import dataclass, field
from typing import Dict, List, Optional

import requests

logger = logging.getLogger(__name__)


@dataclass
class HealthResult:
    name: str
    status: str  # "ok" | "degraded" | "fail"
    message: str
    latency_ms: float = 0.0
    metadata: Dict = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "status": self.status,
            "message": self.message,
            "latency_ms": self.latency_ms,
            "metadata": self.metadata,
        }


class HealthChecker:
    """检测 agent-reach、各平台 API、yt-dlp、ffmpeg 等可用性。"""

    def __init__(
        self,
        agent_reach_path: str = "agent-reach",
        yt_dlp_path: str = "yt-dlp",
        ffmpeg_path: str = "ffmpeg",
    ):
        self.agent_reach_path = agent_reach_path
        self.yt_dlp_path = yt_dlp_path
        self.ffmpeg_path = ffmpeg_path

    def check_all(self) -> List[HealthResult]:
        """运行全部健康检查。"""
        results = []
        results.append(self._check_agent_reach())
        results.append(self._check_yt_dlp())
        results.append(self._check_ffmpeg())
        results.append(self._check_jina_reader())
        results.append(self._check_internet())
        return results

    def _check_agent_reach(self) -> HealthResult:
        return self._binary_check("agent-reach", self.agent_reach_path, ["--version"])

    def _check_yt_dlp(self) -> HealthResult:
        return self._binary_check("yt-dlp", self.yt_dlp_path, ["--version"])

    def _check_ffmpeg(self) -> HealthResult:
        return self._binary_check("ffmpeg", self.ffmpeg_path, ["-version"])

    def _binary_check(self, name: str, path: str, version_args: List[str]) -> HealthResult:
        import time
        start = time.time()
        try:
            proc = subprocess.run(
                [path] + version_args,
                capture_output=True,
                text=True,
                timeout=10,
                check=True,
            )
            latency = (time.time() - start) * 1000
            version = proc.stdout.splitlines()[0] if proc.stdout else "unknown"
            return HealthResult(
                name=name,
                status="ok",
                message=f"{name} ready: {version}",
                latency_ms=latency,
                metadata={"version": version},
            )
        except (subprocess.CalledProcessError, FileNotFoundError) as exc:
            latency = (time.time() - start) * 1000
            return HealthResult(
                name=name,
                status="fail",
                message=f"{name} not available: {exc}",
                latency_ms=latency,
            )
        except subprocess.TimeoutExpired:
            return HealthResult(
                name=name,
                status="degraded",
                message=f"{name} check timed out",
                latency_ms=10000,
            )

    def _check_jina_reader(self) -> HealthResult:
        import time
        start = time.time()
        try:
            resp = requests.get(
                "https://r.jina.ai/http://example.com",
                timeout=15,
                headers={"User-Agent": "ContentForge/0.1.0"},
            )
            latency = (time.time() - start) * 1000
            if resp.status_code < 500:
                return HealthResult(
                    name="jina-reader",
                    status="ok",
                    message="Jina Reader accessible",
                    latency_ms=latency,
                )
            return HealthResult(
                name="jina-reader",
                status="degraded",
                message=f"Jina Reader returned HTTP {resp.status_code}",
                latency_ms=latency,
            )
        except requests.RequestException as exc:
            latency = (time.time() - start) * 1000
            return HealthResult(
                name="jina-reader",
                status="fail",
                message=f"Jina Reader unreachable: {exc}",
                latency_ms=latency,
            )

    def _check_internet(self) -> HealthResult:
        import time
        start = time.time()
        try:
            resp = requests.get("https://1.1.1.1", timeout=10)
            latency = (time.time() - start) * 1000
            return HealthResult(
                name="internet",
                status="ok" if resp.status_code == 200 else "degraded",
                message="Internet connectivity OK",
                latency_ms=latency,
            )
        except requests.RequestException as exc:
            latency = (time.time() - start) * 1000
            return HealthResult(
                name="internet",
                status="fail",
                message=f"No internet connectivity: {exc}",
                latency_ms=latency,
            )

    def doctor(self) -> Dict:
        """运行 doctor 检查并返回汇总报告。"""
        results = self.check_all()
        ok = sum(1 for r in results if r.status == "ok")
        fail = sum(1 for r in results if r.status == "fail")
        return {
            "summary": {"ok": ok, "degraded": 0, "fail": fail, "total": len(results)},
            "checks": [r.to_dict() for r in results],
        }
