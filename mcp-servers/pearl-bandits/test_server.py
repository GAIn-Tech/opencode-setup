"""
Tests for pearl-bandits MCP server.

Covers core Thompson Sampling behavior and MCP tool contracts.
"""

import importlib
import json
import pathlib
import random
import sys


SERVER_PY = str(pathlib.Path(__file__).parent / "server.py")
REGISTRY_PATH = (
    pathlib.Path(__file__).resolve().parents[2]
    / "opencode-config"
    / "skills"
    / "registry.json"
)


def _load_server(monkeypatch, tmp_path):
    state_path = tmp_path / "bandit-state.json"
    monkeypatch.setenv("PEARL_BANDITS_STATE_PATH", str(state_path))

    if "server" in sys.modules:
        return importlib.reload(sys.modules["server"])

    import server

    return importlib.reload(server)


def _registry_skill_names() -> set[str]:
    data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    names = set()
    for key in data["skills"].keys():
        names.add(key.split("/")[-1])
    return names


class TestSelectSkill:
    def test_select_skill_returns_registered_skill(self, monkeypatch, tmp_path):
        server = _load_server(monkeypatch, tmp_path)

        result = server.select_skill(
            task_type="debug",
            complexity=0.6,
            error_count=3,
            file_count=4,
        )

        assert result["skill"] in _registry_skill_names()
        assert isinstance(result["decision_id"], str)
        assert 0.0 <= result["confidence"] <= 1.0

    def test_select_skill_legacy_signature_still_works(self, monkeypatch, tmp_path):
        server = _load_server(monkeypatch, tmp_path)

        result = server.select_skill("debug", 0.3, 1, 2)

        assert result["skill"] in _registry_skill_names()
        assert isinstance(result["decision_id"], str)


class TestContextEncoding:
    def test_encode_context_includes_extended_features(self, monkeypatch, tmp_path):
        server = _load_server(monkeypatch, tmp_path)

        context = server.encode_context(
            task_type="debug",
            complexity_score=0.75,
            error_count=5,
            file_count=9,
            import_depth=4,
            test_coverage=0.65,
            error_pattern="TypeError: bad call",
            session_length=42,
        )

        assert context["task_type"] == "debug"
        assert context["import_depth"] == 4
        assert context["test_coverage"] == 0.65
        assert context["error_pattern"] == "TypeError"
        assert context["session_length"] == 42
        assert context["import_depth_log"] > 0.0
        assert context["session_length_log"] > 0.0
        assert context["error_pattern_one_hot"]["TypeError"] == 1.0
        assert context["error_pattern_one_hot"]["Unknown"] == 0.0
        assert len(context["feature_vector"]) == 17


class TestContextualSelection:
    def test_select_arm_prefers_different_skills_by_context(self, monkeypatch, tmp_path):
        server = _load_server(monkeypatch, tmp_path)

        bandit = server.ThompsonSkillBandit(
            arms=["low-skill", "high-skill"],
            state_path=tmp_path / "contextual-selection-state.json",
            seed=99,
            bootstrap_from_telemetry=False,
        )

        low_context = server.encode_context(
            task_type="review",
            complexity_score=0.2,
            error_count=0,
            file_count=1,
            import_depth=1,
            test_coverage=0.95,
            error_pattern="Unknown",
            session_length=8,
        )
        high_context = server.encode_context(
            task_type="feature",
            complexity_score=0.9,
            error_count=6,
            file_count=8,
            import_depth=7,
            test_coverage=0.1,
            error_pattern="RuntimeError",
            session_length=200,
        )

        low_key = low_context["context_key"]
        high_key = high_context["context_key"]

        bandit.context_params[low_key] = {
            "low-skill": {"alpha": 40.0, "beta": 2.0},
            "high-skill": {"alpha": 2.0, "beta": 40.0},
        }
        bandit.context_params[high_key] = {
            "low-skill": {"alpha": 2.0, "beta": 40.0},
            "high-skill": {"alpha": 40.0, "beta": 2.0},
        }

        low_counts = {"low-skill": 0, "high-skill": 0}
        high_counts = {"low-skill": 0, "high-skill": 0}

        for _ in range(80):
            low_decision = bandit.select_arm(low_context)
            high_decision = bandit.select_arm(high_context)
            low_counts[low_decision["skill"]] += 1
            high_counts[high_decision["skill"]] += 1

        assert low_counts["low-skill"] > low_counts["high-skill"]
        assert high_counts["high-skill"] > high_counts["low-skill"]


class TestFeatureImportance:
    def test_feature_importance_reports_scores(self, monkeypatch, tmp_path):
        server = _load_server(monkeypatch, tmp_path)

        bandit = server.ThompsonSkillBandit(
            arms=["solo"],
            state_path=tmp_path / "feature-importance-state.json",
            seed=21,
            bootstrap_from_telemetry=False,
        )

        positive_context = server.encode_context(
            task_type="debug",
            complexity_score=0.4,
            error_count=1,
            file_count=2,
            import_depth=2,
            test_coverage=0.95,
            error_pattern="TypeError",
            session_length=10,
        )
        negative_context = server.encode_context(
            task_type="debug",
            complexity_score=0.4,
            error_count=1,
            file_count=2,
            import_depth=2,
            test_coverage=0.1,
            error_pattern="SyntaxError",
            session_length=10,
        )

        for _ in range(30):
            pos_decision = bandit.select_arm(positive_context)
            bandit.update_reward(pos_decision["decision_id"], 1)
            neg_decision = bandit.select_arm(negative_context)
            bandit.update_reward(neg_decision["decision_id"], 0)

        importance = bandit.get_feature_importance()
        expected_features = {
            "task_type",
            "complexity_score",
            "error_count",
            "file_count",
            "import_depth",
            "test_coverage",
            "error_pattern",
            "session_length",
        }

        assert expected_features.issubset(set(importance.keys()))
        assert importance["error_pattern"] > 0.0
        assert importance["test_coverage"] > 0.0


class TestContextualTool:
    def test_select_skill_contextual_accepts_full_context(self, monkeypatch, tmp_path):
        server = _load_server(monkeypatch, tmp_path)

        result = server.select_skill_contextual(
            task_type="feature",
            complexity_score=0.8,
            error_count=2,
            file_count=3,
            import_depth=5,
            test_coverage=0.7,
            error_pattern="RuntimeError",
            session_length=30,
        )

        assert result["skill"] in _registry_skill_names()
        assert result["context"]["error_pattern"] == "RuntimeError"
        assert result["context"]["import_depth"] == 5
        assert result["context"]["session_length"] == 30


class TestUpdateReward:
    def test_update_reward_increments_alpha_beta(self, monkeypatch, tmp_path):
        server = _load_server(monkeypatch, tmp_path)

        bandit = server.ThompsonSkillBandit(
            arms=["only-arm"],
            state_path=tmp_path / "single-arm-state.json",
            seed=11,
        )

        context = server.encode_context("feature", 0.4, 0, 1)

        decision_1 = bandit.select_arm(context)
        bandit.update_reward(decision_1["decision_id"], 1)

        decision_2 = bandit.select_arm(context)
        bandit.update_reward(decision_2["decision_id"], 0)

        params = bandit.arm_params["only-arm"]
        assert params["alpha"] == 2.0
        assert params["beta"] == 2.0


class TestStatistics:
    def test_get_statistics_returns_all_arms(self, monkeypatch, tmp_path):
        server = _load_server(monkeypatch, tmp_path)

        stats = server.get_statistics()
        skill_names = _registry_skill_names()
        by_skill = {row["skill"] for row in stats["arms"]}

        assert by_skill == skill_names
        assert all("selection_count" in row for row in stats["arms"])
        assert all("avg_reward" in row for row in stats["arms"])
        assert all("ucb" in row for row in stats["arms"])


class TestExportPolicy:
    def test_export_policy_writes_valid_json(self, monkeypatch, tmp_path):
        server = _load_server(monkeypatch, tmp_path)

        output_path = tmp_path / "policy-export.json"
        result = server.export_policy(output_path=str(output_path))

        assert result["success"] is True
        assert output_path.exists()

        exported = json.loads(output_path.read_text(encoding="utf-8"))
        assert "arm_params" in exported
        assert "metadata" in exported


class TestThompsonSamplingConvergence:
    def test_high_reward_arm_selected_more_after_learning(self, monkeypatch, tmp_path):
        server = _load_server(monkeypatch, tmp_path)

        bandit = server.ThompsonSkillBandit(
            arms=["high", "low"],
            state_path=tmp_path / "convergence-state.json",
            seed=37,
        )

        reward_rng = random.Random(123)
        context = server.encode_context("fix", 0.5, 1, 2)

        for _ in range(100):
            decision = bandit.select_arm(context)
            skill = decision["skill"]
            reward_prob = 0.9 if skill == "high" else 0.1
            reward = 1 if reward_rng.random() < reward_prob else 0
            bandit.update_reward(decision["decision_id"], reward)

        stats = {row["skill"]: row for row in bandit.get_statistics()["arms"]}
        assert stats["high"]["selection_count"] > stats["low"]["selection_count"]


class TestOfflineContextualEvaluation:
    def test_contextual_outperforms_non_contextual_baseline(self, monkeypatch, tmp_path):
        server = _load_server(monkeypatch, tmp_path)

        result = server.evaluate_contextual_vs_non_contextual(
            rounds=2500,
            seed=1234,
        )

        assert "contextual_accuracy" in result
        assert "non_contextual_accuracy" in result
        assert "improvement" in result
        assert result["improvement"] >= 0.05
