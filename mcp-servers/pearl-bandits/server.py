"""
Pearl Bandits MCP Server

Contextual Thompson Sampling-based skill selector for OpenCode.

Usage:
    uv run python server.py                # Start MCP server (stdio)
    uv run python server.py --health-check # Health check and exit

Environment Variables:
    MCP_AUTH_TOKEN             - Bearer token for authentication (optional)
    MCP_AUTH_REQUIRED          - Set to 'true' to enforce auth (default: false)
    PEARL_BANDITS_STATE_PATH   - Optional JSON persistence path
    PEARL_BANDITS_TELEMETRY_DB - Optional telemetry SQLite path for bootstrapping
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import random
import secrets
import signal
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from mcp.server.fastmcp import FastMCP


try:
    from scipy.stats import beta as scipy_beta  # type: ignore
except Exception:  # pragma: no cover - optional dependency
    scipy_beta = None


PEARL_AVAILABLE = importlib.util.find_spec("pearl") is not None


TASK_TYPES = ["debug", "refactor", "feature", "fix", "test", "review", "explore"]
ERROR_PATTERNS = ["TypeError", "SyntaxError", "RuntimeError", "Unknown"]
FEATURE_IMPORTANCE_FIELDS = [
    "task_type",
    "complexity_score",
    "error_count",
    "file_count",
    "import_depth",
    "test_coverage",
    "error_pattern",
    "session_length",
]
ROOT_DIR = Path(__file__).resolve().parents[2]
REGISTRY_PATH = ROOT_DIR / "opencode-config" / "skills" / "registry.json"
DEFAULT_STATE_PATH = Path(
    os.environ.get("PEARL_BANDITS_STATE_PATH", str(Path(__file__).with_name("bandit_state.json")))
)
DEFAULT_TELEMETRY_DB_PATH = Path(
    os.environ.get(
        "PEARL_BANDITS_TELEMETRY_DB",
        str(ROOT_DIR / "packages" / "opencode-learning-engine" / "telemetry.db"),
    )
)


mcp = FastMCP("pearl-bandits")


class AuthError(Exception):
    """Raised when authentication fails."""


def get_auth_config() -> tuple[str | None, bool]:
    """
    Get authentication configuration from environment.

    Returns:
        (token, required) tuple where:
        - token: The expected auth token (None if not set)
        - required: Whether auth is enforced (default: False)
    """

    token = os.environ.get("MCP_AUTH_TOKEN")
    required = os.environ.get("MCP_AUTH_REQUIRED", "false").lower() == "true"
    return token, required


def require_auth(func: Callable) -> Callable:
    """
    Decorator that enforces Bearer token authentication on MCP tools.

    When MCP_AUTH_REQUIRED=true:
    - Checks for 'auth_token' parameter in tool call
    - Validates against MCP_AUTH_TOKEN environment variable
    - Raises AuthError if validation fails

    When MCP_AUTH_REQUIRED=false (default):
    - Auth is optional, all requests pass through
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        expected_token, auth_required = get_auth_config()

        if not auth_required:
            return func(*args, **kwargs)

        if not expected_token:
            raise AuthError("Server misconfigured: MCP_AUTH_REQUIRED=true but MCP_AUTH_TOKEN not set")

        provided_token = kwargs.get("auth_token", "")
        if not secrets.compare_digest(provided_token, expected_token):
            raise AuthError("Unauthorized: Invalid or missing auth token")

        return func(*args, **kwargs)

    return wrapper


def generate_token() -> str:
    """
    Generate a cryptographically secure random token.

    Returns:
        URL-safe base64-encoded token (32 bytes = ~43 characters)
    """

    return secrets.token_urlsafe(32)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_skill_registry(registry_path: Path = REGISTRY_PATH) -> list[str]:
    """Load skill arms from opencode-config/skills/registry.json."""

    if not registry_path.exists():
        return []

    data = json.loads(registry_path.read_text(encoding="utf-8"))
    skills = data.get("skills", {})

    arms: list[str] = []
    seen: set[str] = set()
    for key in skills.keys():
        skill_name = key.split("/")[-1]
        if skill_name not in seen:
            seen.add(skill_name)
            arms.append(skill_name)
    return arms


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _normalize_error_pattern(error_pattern: str) -> str:
    normalized = (error_pattern or "").strip().lower()
    if "typeerror" in normalized:
        return "TypeError"
    if "syntaxerror" in normalized:
        return "SyntaxError"
    if "runtimeerror" in normalized:
        return "RuntimeError"
    return "Unknown"


def encode_context(
    task_type: str,
    complexity_score: float,
    error_count: int,
    file_count: int,
    import_depth: int = 0,
    test_coverage: float = 0.0,
    error_pattern: str = "Unknown",
    session_length: int = 0,
) -> dict[str, Any]:
    """Encode the task context into one-hot + numeric features."""

    normalized_task_type = (task_type or "explore").strip().lower()
    if normalized_task_type not in TASK_TYPES:
        normalized_task_type = "explore"

    complexity = _clamp(float(complexity_score), 0.0, 1.0)
    errors = max(0, int(error_count))
    files = max(0, int(file_count))
    imports = max(0, int(import_depth))
    coverage = _clamp(float(test_coverage), 0.0, 1.0)
    session_messages = max(0, int(session_length))
    normalized_error_pattern = _normalize_error_pattern(error_pattern)

    error_log = math.log1p(errors)
    file_log = math.log1p(files)
    import_log = math.log1p(imports)
    session_log = math.log1p(session_messages)

    task_type_one_hot = {
        name: 1.0 if name == normalized_task_type else 0.0 for name in TASK_TYPES
    }
    error_pattern_one_hot = {
        name: 1.0 if name == normalized_error_pattern else 0.0 for name in ERROR_PATTERNS
    }

    one_hot_vector = [task_type_one_hot[name] for name in TASK_TYPES]
    error_pattern_vector = [error_pattern_one_hot[name] for name in ERROR_PATTERNS]
    feature_vector = (
        one_hot_vector
        + [complexity, error_log, file_log, import_log, coverage]
        + error_pattern_vector
        + [session_log]
    )

    complexity_bucket = int(round(complexity * 10.0))
    error_bucket = min(int(round(error_log * 3.0)), 10)
    file_bucket = min(int(round(file_log * 3.0)), 10)
    import_bucket = min(int(round(import_log * 3.0)), 10)
    coverage_bucket = int(round(coverage * 10.0))
    session_bucket = min(int(round(session_log * 3.0)), 10)
    pattern_bucket = normalized_error_pattern.lower()

    feature_buckets = {
        "task_type": normalized_task_type,
        "complexity_score": f"c{complexity_bucket}",
        "error_count": f"e{error_bucket}",
        "file_count": f"f{file_bucket}",
        "import_depth": f"i{import_bucket}",
        "test_coverage": f"t{coverage_bucket}",
        "error_pattern": normalized_error_pattern,
        "session_length": f"s{session_bucket}",
    }

    context_key = (
        f"{normalized_task_type}|c{complexity_bucket}|e{error_bucket}|f{file_bucket}"
        f"|i{import_bucket}|t{coverage_bucket}|p{pattern_bucket}|s{session_bucket}"
    )

    return {
        "task_type": normalized_task_type,
        "task_type_one_hot": task_type_one_hot,
        "complexity_score": complexity,
        "error_count": errors,
        "file_count": files,
        "import_depth": imports,
        "test_coverage": coverage,
        "error_pattern": normalized_error_pattern,
        "session_length": session_messages,
        "error_count_log": error_log,
        "file_count_log": file_log,
        "import_depth_log": import_log,
        "session_length_log": session_log,
        "error_pattern_one_hot": error_pattern_one_hot,
        "feature_buckets": feature_buckets,
        "feature_vector": feature_vector,
        "context_key": context_key,
    }


class ThompsonSkillBandit:
    """Beta-Bernoulli Thompson Sampling bandit with contextual priors."""

    def __init__(
        self,
        arms: list[str],
        state_path: Path | None = None,
        seed: int | None = None,
        telemetry_db_path: Path = DEFAULT_TELEMETRY_DB_PATH,
        bootstrap_from_telemetry: bool = True,
    ):
        if not arms:
            raise ValueError("At least one arm is required")

        self.arms = list(dict.fromkeys(arms))
        self.state_path = Path(state_path or DEFAULT_STATE_PATH)
        self.seed = seed
        self.random = random.Random(seed)
        self.telemetry_db_path = Path(telemetry_db_path)
        self.using_scipy = scipy_beta is not None and seed is None

        self.arm_params: dict[str, dict[str, float | int]] = {
            arm: self._new_arm_state() for arm in self.arms
        }
        self.context_params: dict[str, dict[str, dict[str, float]]] = {}
        self.feature_stats: dict[str, dict[str, dict[str, dict[str, float | int]]]] = {
            arm: self._new_feature_state() for arm in self.arms
        }
        self.pending_decisions: dict[str, dict[str, Any]] = {}

        self._load_state()

        if bootstrap_from_telemetry and self._is_cold_start():
            self._bootstrap_from_telemetry()

    @staticmethod
    def _new_arm_state() -> dict[str, float | int]:
        return {
            "alpha": 1.0,
            "beta": 1.0,
            "selection_count": 0,
            "reward_sum": 0.0,
        }

    @staticmethod
    def _new_feature_state() -> dict[str, dict[str, dict[str, float | int]]]:
        return {feature: {} for feature in FEATURE_IMPORTANCE_FIELDS}

    def _is_cold_start(self) -> bool:
        return all(int(self.arm_params[arm]["selection_count"]) == 0 for arm in self.arms)

    def _load_state(self) -> None:
        if not self.state_path.exists():
            return

        try:
            data = json.loads(self.state_path.read_text(encoding="utf-8"))
        except Exception:
            return

        for arm, state in data.get("arm_params", {}).items():
            if arm not in self.arm_params:
                continue
            self.arm_params[arm]["alpha"] = max(1.0, float(state.get("alpha", 1.0)))
            self.arm_params[arm]["beta"] = max(1.0, float(state.get("beta", 1.0)))
            self.arm_params[arm]["selection_count"] = max(
                0, int(state.get("selection_count", 0))
            )
            self.arm_params[arm]["reward_sum"] = max(0.0, float(state.get("reward_sum", 0.0)))

        loaded_context = data.get("context_params", {})
        if isinstance(loaded_context, dict):
            self.context_params = loaded_context

        loaded_feature_stats = data.get("feature_stats", {})
        if isinstance(loaded_feature_stats, dict):
            for arm, arm_feature_stats in loaded_feature_stats.items():
                if arm not in self.feature_stats or not isinstance(arm_feature_stats, dict):
                    continue

                normalized_feature_stats = self._new_feature_state()
                for feature_name, buckets in arm_feature_stats.items():
                    if feature_name not in FEATURE_IMPORTANCE_FIELDS or not isinstance(buckets, dict):
                        continue

                    normalized_buckets: dict[str, dict[str, float | int]] = {}
                    for bucket_name, bucket_state in buckets.items():
                        if not isinstance(bucket_state, dict):
                            continue
                        normalized_buckets[str(bucket_name)] = {
                            "count": max(0, int(bucket_state.get("count", 0))),
                            "reward_sum": max(0.0, float(bucket_state.get("reward_sum", 0.0))),
                        }

                    normalized_feature_stats[feature_name] = normalized_buckets

                self.feature_stats[arm] = normalized_feature_stats

    def _write_json_atomically(self, path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = path.with_suffix(f"{path.suffix}.tmp")

        serialized = json.dumps(payload, indent=2, sort_keys=True)
        tmp_path.write_text(serialized, encoding="utf-8")
        tmp_path.replace(path)

        verified = json.loads(path.read_text(encoding="utf-8"))
        if "arm_params" not in verified:
            raise ValueError("Persisted policy state is missing arm_params")

    def _save_state(self) -> None:
        payload = {
            "metadata": {
                "saved_at": _utc_now_iso(),
                "policy": "thompson_sampling",
                "backend": "scipy_beta" if self.using_scipy else "python_beta",
                "pearl_available": PEARL_AVAILABLE,
            },
            "arm_params": self.arm_params,
            "context_params": self.context_params,
            "feature_stats": self.feature_stats,
        }
        try:
            self._write_json_atomically(self.state_path, payload)
        except Exception:
            pass

    def _record_feature_reward(
        self, skill: str, feature_buckets: dict[str, Any], reward_binary: int
    ) -> None:
        arm_feature_stats = self.feature_stats.setdefault(skill, self._new_feature_state())

        for feature_name in FEATURE_IMPORTANCE_FIELDS:
            bucket_value = feature_buckets.get(feature_name, "unknown")
            bucket_key = str(bucket_value)

            feature_row = arm_feature_stats.setdefault(feature_name, {})
            bucket_state = feature_row.setdefault(
                bucket_key,
                {"count": 0, "reward_sum": 0.0},
            )

            bucket_state["count"] = int(bucket_state.get("count", 0)) + 1
            bucket_state["reward_sum"] = (
                float(bucket_state.get("reward_sum", 0.0)) + float(reward_binary)
            )

    def _bootstrap_from_telemetry(self) -> None:
        if not self.telemetry_db_path.exists():
            return

        query = (
            "SELECT skill_id, result_status, COUNT(*) as n "
            "FROM telemetry_events "
            "WHERE skill_id IS NOT NULL "
            "GROUP BY skill_id, result_status"
        )

        conn: sqlite3.Connection | None = None
        try:
            conn = sqlite3.connect(self.telemetry_db_path)
            rows = conn.execute(query).fetchall()
        except Exception:
            return
        finally:
            try:
                if conn is not None:
                    conn.close()
            except Exception:
                pass

        changed = False
        for skill_id, result_status, count in rows:
            skill_name = str(skill_id).split("/")[-1]
            if skill_name not in self.arm_params:
                continue

            n = int(count)
            if n <= 0:
                continue

            status = str(result_status or "").lower()
            state = self.arm_params[skill_name]

            if status == "success":
                state["alpha"] = float(state["alpha"]) + float(n)
                state["reward_sum"] = float(state["reward_sum"]) + float(n)
            else:
                state["beta"] = float(state["beta"]) + float(n)

            state["selection_count"] = int(state["selection_count"]) + n
            changed = True

        if changed:
            self._save_state()

    def _get_context_state(self, context_key: str, arm: str) -> dict[str, float]:
        context_row = self.context_params.setdefault(context_key, {})
        return context_row.setdefault(arm, {"alpha": 1.0, "beta": 1.0})

    def _sample_beta(self, alpha: float, beta: float) -> tuple[float, bool]:
        if self.using_scipy and scipy_beta is not None:
            try:
                return float(scipy_beta.rvs(alpha, beta)), False
            except Exception:
                pass

        try:
            return self.random.betavariate(alpha, beta), False
        except Exception:
            return self.random.random(), True

    @staticmethod
    def _normalize_reward(reward: int | float | bool | str) -> int:
        if isinstance(reward, bool):
            return 1 if reward else 0
        if isinstance(reward, (int, float)):
            return 1 if float(reward) > 0.0 else 0

        lowered = str(reward).strip().lower()
        if lowered in {"1", "true", "success", "pass"}:
            return 1
        if lowered in {"0", "false", "failure", "fail"}:
            return 0
        raise ValueError("reward must be binary (0/1 or success/failure)")

    def select_arm(self, context_features: dict[str, Any]) -> dict[str, Any]:
        context_key = context_features.get("context_key", "explore|c0|e0|f0|i0|t0|punknown|s0")

        samples: dict[str, float] = {}
        random_fallback_used = False
        best_skill = self.arms[0]
        best_score = -1.0

        for arm in self.arms:
            global_state = self.arm_params[arm]
            context_state = self._get_context_state(context_key, arm)

            alpha = float(global_state["alpha"]) + max(0.0, float(context_state["alpha"]) - 1.0)
            beta = float(global_state["beta"]) + max(0.0, float(context_state["beta"]) - 1.0)

            score, fallback = self._sample_beta(alpha, beta)
            samples[arm] = score
            random_fallback_used = random_fallback_used or fallback

            if score > best_score:
                best_score = score
                best_skill = arm

        chosen_state = self.arm_params[best_skill]
        chosen_state["selection_count"] = int(chosen_state["selection_count"]) + 1

        confidence = float(chosen_state["alpha"]) / (
            float(chosen_state["alpha"]) + float(chosen_state["beta"])
        )

        decision_id = str(uuid.uuid4())
        self.pending_decisions[decision_id] = {
            "skill": best_skill,
            "context_key": context_key,
            "context_features": context_features,
            "created_at": _utc_now_iso(),
        }

        self._save_state()

        return {
            "decision_id": decision_id,
            "skill": best_skill,
            "confidence": round(confidence, 6),
            "policy": "thompson_sampling",
            "backend": "scipy_beta" if self.using_scipy else "python_beta",
            "random_fallback": random_fallback_used,
            "context": {
                "task_type": context_features.get("task_type"),
                "complexity_score": context_features.get("complexity_score"),
                "error_count": context_features.get("error_count"),
                "file_count": context_features.get("file_count"),
                "import_depth": context_features.get("import_depth"),
                "test_coverage": context_features.get("test_coverage"),
                "error_pattern": context_features.get("error_pattern"),
                "session_length": context_features.get("session_length"),
                "context_key": context_key,
            },
        }

    def update_reward(self, decision_id: str, reward: int | float | bool | str) -> dict[str, Any]:
        if decision_id not in self.pending_decisions:
            raise ValueError(f"Unknown decision_id: {decision_id}")

        reward_binary = self._normalize_reward(reward)
        decision = self.pending_decisions.pop(decision_id)

        skill = decision["skill"]
        context_key = decision["context_key"]
        global_state = self.arm_params[skill]
        context_state = self._get_context_state(context_key, skill)
        feature_buckets = decision.get("context_features", {}).get("feature_buckets", {})

        if reward_binary == 1:
            global_state["alpha"] = float(global_state["alpha"]) + 1.0
            global_state["reward_sum"] = float(global_state["reward_sum"]) + 1.0
            context_state["alpha"] = float(context_state["alpha"]) + 1.0
        else:
            global_state["beta"] = float(global_state["beta"]) + 1.0
            context_state["beta"] = float(context_state["beta"]) + 1.0

        self._record_feature_reward(skill, feature_buckets, reward_binary)

        self._save_state()

        return {
            "updated": True,
            "decision_id": decision_id,
            "skill": skill,
            "reward": reward_binary,
            "alpha": global_state["alpha"],
            "beta": global_state["beta"],
        }

    def get_statistics(self) -> dict[str, Any]:
        total_selections = sum(int(state["selection_count"]) for state in self.arm_params.values())
        rows = []

        for arm in self.arms:
            state = self.arm_params[arm]
            selection_count = int(state["selection_count"])
            reward_sum = float(state["reward_sum"])
            avg_reward = reward_sum / selection_count if selection_count > 0 else 0.0

            exploration_bonus = math.sqrt(
                (2.0 * math.log(float(total_selections) + 1.0)) / (float(selection_count) + 1.0)
            )
            ucb = avg_reward + exploration_bonus

            rows.append(
                {
                    "skill": arm,
                    "alpha": float(state["alpha"]),
                    "beta": float(state["beta"]),
                    "selection_count": selection_count,
                    "avg_reward": round(avg_reward, 6),
                    "ucb": round(ucb, 6),
                }
            )

        return {
            "policy": "thompson_sampling",
            "backend": "scipy_beta" if self.using_scipy else "python_beta",
            "pearl_available": PEARL_AVAILABLE,
            "total_selections": total_selections,
            "arms": rows,
        }

    def get_feature_importance(self) -> dict[str, float]:
        total_selections = sum(int(state["selection_count"]) for state in self.arm_params.values())
        if total_selections <= 0:
            return {feature: 0.0 for feature in FEATURE_IMPORTANCE_FIELDS}

        feature_importance = {feature: 0.0 for feature in FEATURE_IMPORTANCE_FIELDS}

        for arm in self.arms:
            arm_selection_count = int(self.arm_params[arm]["selection_count"])
            if arm_selection_count <= 0:
                continue

            arm_reward_sum = float(self.arm_params[arm]["reward_sum"])
            arm_baseline_reward = arm_reward_sum / float(arm_selection_count)
            arm_weight = float(arm_selection_count) / float(total_selections)

            arm_feature_stats = self.feature_stats.get(arm, {})
            for feature_name in FEATURE_IMPORTANCE_FIELDS:
                bucket_map = arm_feature_stats.get(feature_name, {})
                if not isinstance(bucket_map, dict) or not bucket_map:
                    continue

                bucket_total = 0
                for bucket_state in bucket_map.values():
                    bucket_total += max(0, int(bucket_state.get("count", 0)))

                if bucket_total <= 0:
                    continue

                weighted_delta = 0.0
                for bucket_state in bucket_map.values():
                    count = max(0, int(bucket_state.get("count", 0)))
                    if count <= 0:
                        continue

                    reward_sum = float(bucket_state.get("reward_sum", 0.0))
                    bucket_reward_rate = reward_sum / float(count)
                    bucket_weight = float(count) / float(bucket_total)
                    weighted_delta += bucket_weight * abs(bucket_reward_rate - arm_baseline_reward)

                feature_importance[feature_name] += arm_weight * weighted_delta

        return {
            feature: round(_clamp(score, 0.0, 1.0), 6)
            for feature, score in feature_importance.items()
        }

    def export_policy(self, output_path: str) -> dict[str, Any]:
        path = Path(output_path).expanduser()
        if not path.is_absolute():
            path = Path.cwd() / path

        payload = {
            "metadata": {
                "exported_at": _utc_now_iso(),
                "policy": "thompson_sampling",
                "backend": "scipy_beta" if self.using_scipy else "python_beta",
                "pearl_available": PEARL_AVAILABLE,
                "arm_count": len(self.arms),
            },
            "arm_params": self.arm_params,
            "context_params": self.context_params,
            "feature_stats": self.feature_stats,
        }
        self._write_json_atomically(path, payload)

        return {
            "success": True,
            "output_path": str(path),
            "arm_count": len(self.arms),
        }


def _initialize_bandit() -> ThompsonSkillBandit:
    arms = load_skill_registry()
    if not arms:
        arms = TASK_TYPES.copy()
    return ThompsonSkillBandit(arms=arms, state_path=DEFAULT_STATE_PATH)


def evaluate_contextual_vs_non_contextual(
    rounds: int = 10_000,
    seed: int = 42,
) -> dict[str, float | int]:
    """
    Offline evaluation harness for Task 18 acceptance:
    compares contextual Thompson sampling against a non-contextual baseline.
    """
    total_rounds = max(100, int(rounds))
    rng = random.Random(seed)

    arms = ["context-a", "context-b"]
    contextual = ThompsonSkillBandit(
        arms=arms,
        state_path=Path("/tmp/contextual-eval-contextual.json"),
        seed=seed,
        bootstrap_from_telemetry=False,
    )
    non_contextual = ThompsonSkillBandit(
        arms=arms,
        state_path=Path("/tmp/contextual-eval-non-contextual.json"),
        seed=seed + 1,
        bootstrap_from_telemetry=False,
    )

    # Offline eval is simulation-only; disable persistence I/O to keep runs fast.
    contextual._save_state = lambda: None
    non_contextual._save_state = lambda: None

    contextual_correct = 0
    non_contextual_correct = 0

    for _ in range(total_rounds):
        is_a = rng.random() < 0.5
        if is_a:
            ctx = encode_context(
                task_type="debug",
                complexity_score=0.2,
                error_count=0,
                file_count=1,
                import_depth=1,
                test_coverage=0.95,
                error_pattern="Unknown",
                session_length=8,
            )
            optimal = "context-a"
        else:
            ctx = encode_context(
                task_type="feature",
                complexity_score=0.9,
                error_count=6,
                file_count=8,
                import_depth=7,
                test_coverage=0.1,
                error_pattern="RuntimeError",
                session_length=120,
            )
            optimal = "context-b"

        # Contextual policy (full context key)
        decision_ctx = contextual.select_arm(ctx)
        reward_ctx = 1 if decision_ctx["skill"] == optimal else 0
        contextual.update_reward(decision_ctx["decision_id"], reward_ctx)
        contextual_correct += reward_ctx

        # Non-contextual baseline: force all examples into one context bucket
        baseline_ctx = dict(ctx)
        baseline_ctx["context_key"] = "global|baseline"
        decision_base = non_contextual.select_arm(baseline_ctx)
        reward_base = 1 if decision_base["skill"] == optimal else 0
        non_contextual.update_reward(decision_base["decision_id"], reward_base)
        non_contextual_correct += reward_base

    contextual_accuracy = contextual_correct / float(total_rounds)
    non_contextual_accuracy = non_contextual_correct / float(total_rounds)
    improvement = contextual_accuracy - non_contextual_accuracy

    return {
        "rounds": total_rounds,
        "contextual_accuracy": round(contextual_accuracy, 6),
        "non_contextual_accuracy": round(non_contextual_accuracy, 6),
        "improvement": round(improvement, 6),
    }


BANDIT = _initialize_bandit()


@mcp.tool()
def health_check() -> str:
    """Check server health. Returns 'healthy' if server is operational."""

    return "healthy"


@mcp.tool()
@require_auth
def select_skill(
    task_type: str,
    complexity: float,
    error_count: int,
    file_count: int,
    auth_token: str = "",
    import_depth: int = 0,
    test_coverage: float = 0.0,
    error_pattern: str = "Unknown",
    session_length: int = 0,
) -> dict[str, Any]:
    """
    Select a skill arm via contextual Thompson Sampling.

    Args:
        task_type: Task category (debug/refactor/feature/fix/test/review/explore)
        complexity: Complexity score in [0.0, 1.0]
        error_count: Number of errors seen so far
        file_count: Number of files involved in this task
        auth_token: Bearer token when MCP_AUTH_REQUIRED=true
        import_depth: Import depth in changed code
        test_coverage: Estimated test coverage in [0.0, 1.0]
        error_pattern: Error family (TypeError/SyntaxError/RuntimeError/Unknown)
        session_length: Number of messages observed in this session
    """

    context = encode_context(
        task_type,
        complexity,
        error_count,
        file_count,
        import_depth=import_depth,
        test_coverage=test_coverage,
        error_pattern=error_pattern,
        session_length=session_length,
    )
    return BANDIT.select_arm(context)


@mcp.tool()
@require_auth
def select_skill_contextual(
    task_type: str,
    complexity_score: float,
    error_count: int,
    file_count: int,
    import_depth: int = 0,
    test_coverage: float = 0.0,
    error_pattern: str = "Unknown",
    session_length: int = 0,
    auth_token: str = "",
) -> dict[str, Any]:
    """Select a skill arm using the full contextual feature set."""

    context = encode_context(
        task_type,
        complexity_score,
        error_count,
        file_count,
        import_depth=import_depth,
        test_coverage=test_coverage,
        error_pattern=error_pattern,
        session_length=session_length,
    )
    return BANDIT.select_arm(context)


@mcp.tool()
@require_auth
def update_reward(decision_id: str, reward: int, auth_token: str = "") -> dict[str, Any]:
    """
    Update reward for a prior decision.

    Args:
        decision_id: UUID returned by select_skill
        reward: Binary reward (1=success, 0=failure)
        auth_token: Bearer token when MCP_AUTH_REQUIRED=true
    """

    return BANDIT.update_reward(decision_id, reward)


@mcp.tool()
@require_auth
def get_statistics(auth_token: str = "") -> dict[str, Any]:
    """
    Return per-arm statistics.

    Includes selection_count, avg_reward, and UCB for observability.
    """

    return BANDIT.get_statistics()


@mcp.tool()
@require_auth
def get_feature_importance(auth_token: str = "") -> dict[str, float]:
    """Return feature importance scores based on observed rewards."""

    return BANDIT.get_feature_importance()


@mcp.tool()
@require_auth
def export_policy(output_path: str, auth_token: str = "") -> dict[str, Any]:
    """
    Export current policy state to JSON.

    Args:
        output_path: Destination JSON file path
        auth_token: Bearer token when MCP_AUTH_REQUIRED=true
    """

    return BANDIT.export_policy(output_path)


def handle_sigterm(*_args):
    """Graceful shutdown on SIGTERM."""

    sys.exit(0)


if hasattr(signal, "SIGTERM"):
    signal.signal(signal.SIGTERM, handle_sigterm)


def main():
    parser = argparse.ArgumentParser(description="Pearl Bandits MCP Server")
    parser.add_argument(
        "--health-check",
        action="store_true",
        help="Run health check and exit",
    )
    args = parser.parse_args()

    if args.health_check:
        print("healthy")
        sys.exit(0)

    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
