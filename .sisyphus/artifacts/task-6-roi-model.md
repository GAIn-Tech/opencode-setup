# ROI Model for GAIn-Tech/autoopencode Integration Pilot

## 1. KPI Definitions

### Primary KPI: Agent Task Completion Rate
*   **Definition**: The percentage of tasks assigned to agents that are successfully completed without requiring human intervention or significant rework.
*   **Measurement**: (Number of successfully completed tasks / Total number of assigned tasks) * 100

### Secondary KPIs:

#### Token Efficiency
*   **Definition**: The average number of tokens consumed per task completion. A lower value indicates better efficiency.
*   **Measurement**: Total tokens consumed / Number of successfully completed tasks

#### Latency
*   **Definition**: The average time taken for an agent to complete a task from assignment to completion. A lower value indicates better performance.
*   **Measurement**: Sum of (Task Completion Time - Task Assignment Time) / Number of successfully completed tasks

#### User Satisfaction
*   **Definition**: User feedback on the quality and helpfulness of agent responses, collected via a simple rating system or survey.
*   **Measurement**: Average rating on a scale (e.g., 1-5) or percentage of positive feedback.

## 2. Measurement Protocol

*   **Baseline Measurement Window**: 7 days immediately preceding the pilot phase.
*   **Pilot Measurement Window**: 14 days during the active pilot phase.
*   **Sample Size Requirements**: A minimum of 100 completed tasks/sessions for each KPI in both the baseline and pilot measurement windows. If 100 tasks are not completed within the specified window, the window will be extended until the minimum sample size is met.
*   **Statistical Significance Threshold**: A p-value of < 0.05 will be used to determine statistical significance for all KPI comparisons between baseline and pilot. This will be calculated using appropriate statistical tests (e.g., t-tests for continuous data, chi-squared for categorical data).

## 3. Baseline Capture Method

Baseline data will be captured from the existing telemetry infrastructure, specifically leveraging `packages/opencode-model-manager/src/monitoring/metrics-collector.js` and `packages/opencode-model-manager/src/monitoring/alert-manager.js`.

*   **Agent Task Completion Rate**:
    *   Data Source: `PipelineMetricsCollector._packageExecutionEvents` (persisted in `metrics-history.db`).
    *   Capture Method: Query `metrics-history.db` for `package_execution` events within the baseline window. Count events where `success` is true for completed tasks and total `package_execution` events for total assigned tasks.
*   **Token Efficiency**:
    *   Data Source: `PipelineMetricsCollector._compressionEvents` (persisted in `metrics-history.db`).
    *   Capture Method: Query `metrics-history.db` for `compression_events` within the baseline window. Sum `input_tokens` and `output_tokens` from these events. Divide the total tokens by the number of successfully completed tasks (obtained from the Agent Task Completion Rate calculation).
*   **Latency**:
    *   Data Source: `PipelineMetricsCollector._packageExecutionEvents` (persisted in `metrics-history.db`).
    *   Capture Method: Query `metrics-history.db` for `package_execution` events within the baseline window where `success` is true. Sum the `durationMs` for these events and divide by the number of successfully completed tasks.
*   **User Satisfaction**:
    *   Data Source: This metric requires an external collection mechanism (e.g., in-app survey, post-task feedback form). It is not directly available in the current `metrics-collector.js`. A separate system will be implemented to collect and store this data, which will then be integrated for analysis.

## 4. Decision Table

| KPI Result | Threshold | Decision |
|---|---|---|
| Primary KPI uplift >= 15% | Pass | Continue |
| Primary KPI uplift < 15% | Fail | Stop pilot |
| Secondary KPI regression > 10% | Warning | Review |
| Technical blocker detected | N/A | Stop pilot |

## 5. Continuation Condition

**Continue IF:**
*   Primary KPI (Agent Task Completion Rate) uplift >= 15%
*   No secondary KPI regression > 10% (i.e., Token Efficiency, Latency, and User Satisfaction do not degrade by more than 10%)
*   All hard gates pass (e.g., no critical errors, system stability maintained)
*   No technical blockers (e.g., unresolvable integration issues, performance bottlenecks)

**Stop IF:**
*   Primary KPI (Agent Task Completion Rate) uplift < 15%
*   Any hard gate fails
*   Technical blocker detected
