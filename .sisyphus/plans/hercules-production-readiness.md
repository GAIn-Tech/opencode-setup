# Hercules Production Readiness Plan (Option A)

## Goal
Complete production-ready setup including CI/CD, Security, Observability, Deployment automation, and Documentation.

## Phase 1: CI/CD Pipeline (GitHub Actions)

### Task 1.1: Create CI Workflow
**File**: `.github/workflows/ci.yml`

**Must Include**:
- Python 3.10, 3.11, 3.12 matrix testing
- Install dependencies from pyproject.toml
- Run pytest with coverage
- Run black, ruff, mypy checks
- Security scan (bandit, safety)
- Upload coverage to Codecov

**Success Criteria**:
- [ ] Workflow triggers on PR and push to main
- [ ] All checks pass (tests, linting, security)
- [ ] Coverage report uploaded

**Estimated Time**: 20 minutes

---

### Task 1.2: Create Docker Build & Push Workflow
**File**: `.github/workflows/docker.yml`

**Must Include**:
- Build Docker image on PR
- Push to GitHub Container Registry on merge to main
- Tag with commit SHA and 'latest'
- Multi-platform build (linux/amd64, linux/arm64)
- Scan image with Trivy

**Success Criteria**:
- [ ] Image builds successfully
- [ ] Pushed to ghcr.io/{org}/hercules
- [ ] Security scan passes

**Estimated Time**: 15 minutes

---

### Task 1.3: Create Release Workflow
**File**: `.github/workflows/release.yml`

**Must Include**:
- Trigger on version tag (v*)
- Build and push Docker image
- Create GitHub release with changelog
- Publish to PyPI (optional)

**Success Criteria**:
- [ ] Release created automatically
- [ ] Docker image tagged with version
- [ ] Changelog generated

**Estimated Time**: 15 minutes

---

## Phase 2: Security Implementation

### Task 2.1: Add API Authentication
**File**: `hercules/api/auth.py` (new)

**Must Implement**:
- API key authentication middleware
- JWT token support (optional)
- Rate limiting (per API key)
- CORS configuration

**Success Criteria**:
- [ ] API endpoints require authentication
- [ ] Rate limiting enforced (100 req/min default)
- [ ] CORS configured for frontend origins
- [ ] Test: `test_api_auth.py`

**Estimated Time**: 30 minutes

---

### Task 2.2: Add Security Headers
**File**: `hercules/api/middleware.py` (new)

**Must Include**:
- HSTS header
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Content-Security-Policy
- Secure cookie flags

**Success Criteria**:
- [ ] All security headers present in API responses
- [ ] Security scan (OWASP ZAP) passes
- [ ] Test: `test_security_headers.py`

**Estimated Time**: 20 minutes

---

### Task 2.3: Input Validation & Sanitization
**Enhance**: `hercules/api/routes.py`

**Must Include**:
- Request payload validation (Pydantic)
- SQL injection prevention
- XSS prevention
- File upload validation (if applicable)

**Success Criteria**:
- [ ] All inputs validated
- [ ] No SQL injection vulnerabilities
- [ ] Test: `test_input_validation.py`

**Estimated Time**: 25 minutes

---

## Phase 3: Observability

### Task 3.1: Structured Logging
**File**: `hercules/utils/logging.py` (new)

**Must Implement**:
- JSON structured logging
- Log levels (DEBUG, INFO, WARNING, ERROR)
- Request ID tracking
- Context propagation
- Log rotation

**Success Criteria**:
- [ ] Logs in JSON format
- [ ] Request ID in all logs
- [ ] Configurable log level via env var
- [ ] Test: `test_logging.py`

**Estimated Time**: 25 minutes

---

### Task 3.2: Health Check Endpoint
**File**: `hercules/api/health.py` (new)

**Must Implement**:
- `/health` - Basic health check
- `/health/ready` - Readiness probe
- `/health/live` - Liveness probe
- Check dependencies (DB, Neo4j, etc.)

**Success Criteria**:
- [ ] Health endpoint returns 200 when healthy
- [ ] Returns 503 when dependencies down
- [ ] Includes service version
- [ ] Test: `test_health_endpoints.py`

**Estimated Time**: 20 minutes

---

### Task 3.3: Metrics Collection
**File**: `hercules/utils/metrics.py` (new)

**Must Implement**:
- Prometheus metrics endpoint (/metrics)
- Request count/latency histograms
- Error rate tracking
- Custom business metrics

**Metrics to Track**:
- http_requests_total
- http_request_duration_seconds
- hercules_tasks_total
- hercules_errors_total
- hercules_cost_usd_total

**Success Criteria**:
- [ ] /metrics endpoint returns Prometheus format
- [ ] Metrics increment correctly
- [ ] Grafana dashboard JSON provided
- [ ] Test: `test_metrics.py`

**Estimated Time**: 30 minutes

---

### Task 3.4: Distributed Tracing
**File**: `hercules/utils/tracing.py` (new)

**Must Implement**:
- OpenTelemetry integration
- Trace context propagation
- Span creation for operations
- Jaeger/Zipkin export (optional)

**Success Criteria**:
- [ ] Traces generated for requests
- [ ] Spans linked correctly
- [ ] Test: `test_tracing.py`

**Estimated Time**: 25 minutes

---

## Phase 4: Deployment Automation

### Task 4.1: Create docker-compose.yml
**File**: `docker-compose.yml`

**Must Include**:
- Hercules API service
- Neo4j service (for Tier 2 memory)
- SQLite volume (for Tier 1 memory)
- Environment configuration
- Health checks

**Services**:
- hercules-api (port 8000)
- neo4j (ports 7474, 7687)
- prometheus (optional, port 9090)
- grafana (optional, port 3000)

**Success Criteria**:
- [ ] `docker-compose up` starts all services
- [ ] API accessible on localhost:8000
- [ ] Health checks pass
- [ ] Test: `test_docker_compose.py`

**Estimated Time**: 25 minutes

---

### Task 4.2: Create Kubernetes Manifests
**Directory**: `k8s/`

**Files**:
- `namespace.yaml`
- `deployment.yaml` - Hercules API deployment
- `service.yaml` - ClusterIP service
- `configmap.yaml` - Environment config
- `secret.yaml` - API keys, passwords
- `ingress.yaml` - Ingress with TLS
- `hpa.yaml` - Horizontal Pod Autoscaler
- `pvc.yaml` - Persistent volume for SQLite

**Success Criteria**:
- [ ] `kubectl apply -f k8s/` deploys successfully
- [ ] Pods running and healthy
- [ ] Service accessible via ingress
- [ ] Test: `test_k8s_deployment.sh`

**Estimated Time**: 40 minutes

---

### Task 4.3: Database Setup Scripts
**Directory**: `scripts/`

**Files**:
- `setup-neo4j.sh` - Initialize Neo4j schema
- `migrate-sqlite.py` - SQLite migrations
- `seed-data.py` - Seed initial data (optional)

**Success Criteria**:
- [ ] Neo4j schema created with constraints
- [ ] SQLite tables initialized
- [ ] Test: `test_db_setup.py`

**Estimated Time**: 20 minutes

---

## Phase 5: Documentation

### Task 5.1: Production Deployment Guide
**File**: `docs/deployment.md`

**Must Include**:
- Prerequisites (Docker, K8s, Neo4j)
- Environment setup
- Configuration options
- Docker Compose deployment
- Kubernetes deployment
- Troubleshooting

**Success Criteria**:
- [ ] Step-by-step instructions
- [ ] All configuration documented
- [ ] Troubleshooting section

**Estimated Time**: 30 minutes

---

### Task 5.2: Configuration Reference
**File**: `docs/configuration.md`

**Must Include**:
- Environment variables table
- Config file format
- Default values
- Examples for dev/staging/prod

**Success Criteria**:
- [ ] All env vars documented
- [ ] Examples provided
- [ ] Validation rules explained

**Estimated Time**: 20 minutes

---

### Task 5.3: API Documentation
**File**: `docs/api.md`

**Must Include**:
- OpenAPI/Swagger spec
- Authentication guide
- Endpoint reference
- Error codes
- Rate limiting info

**Success Criteria**:
- [ ] All endpoints documented
- [ ] Request/response examples
- [ ] Authentication examples

**Estimated Time**: 25 minutes

---

### Task 5.4: Architecture Diagrams
**Directory**: `docs/architecture/`

**Files**:
- `system-overview.png` - High-level architecture
- `data-flow.png` - Request/data flow
- `deployment.png` - Deployment topology

**Success Criteria**:
- [ ] Diagrams in docs/ folder
- [ ] Referenced in README
- [ ] C4 model diagrams (optional)

**Estimated Time**: 20 minutes

---

### Task 5.5: Operations Runbook
**File**: `docs/runbook.md`

**Must Include**:
- Common operational tasks
- Alert response procedures
- Backup/restore procedures
- Scaling procedures
- Incident response

**Success Criteria**:
- [ ] Incident response procedures
- [ ] Alert runbook
- [ ] Scaling guide

**Estimated Time**: 25 minutes

---

## Phase 6: Testing & Validation

### Task 6.1: Integration Tests
**File**: `tests/integration/test_api_integration.py` (new)

**Must Test**:
- End-to-end API workflows
- Database integration
- External service mocks
- Docker environment

**Success Criteria**:
- [ ] All integration tests pass
- [ ] Run in CI pipeline
- [ ] Test: `pytest tests/integration/`

**Estimated Time**: 30 minutes

---

### Task 6.2: Load Testing
**File**: `tests/load/locustfile.py` (new)

**Must Implement**:
- Locust load testing script
- Simulates realistic user traffic
- Tests rate limiting
- Performance benchmarks

**Success Criteria**:
- [ ] 100 concurrent users handled
- [ ] p95 latency < 500ms
- [ ] No errors under load

**Estimated Time**: 25 minutes

---

### Task 6.3: Security Testing
**File**: `tests/security/test_security.py` (new)

**Must Test**:
- Authentication bypass attempts
- SQL injection attempts
- XSS attempts
- Rate limiting effectiveness

**Success Criteria**:
- [ ] All security tests pass
- [ ] No vulnerabilities found

**Estimated Time**: 20 minutes

---

## Summary

| Phase | Tasks | Est. Time |
|-------|-------|-----------|
| 1 - CI/CD | 3 tasks | 50 min |
| 2 - Security | 3 tasks | 75 min |
| 3 - Observability | 4 tasks | 100 min |
| 4 - Deployment | 3 tasks | 85 min |
| 5 - Documentation | 5 tasks | 120 min |
| 6 - Testing | 3 tasks | 75 min |
| **Total** | **21 tasks** | **~8-9 hours** |

## Execution Strategy

**Wave 1** (Parallel):
- Task 1.1: CI workflow
- Task 1.2: Docker workflow
- Task 2.1: API auth

**Wave 2** (Parallel):
- Task 2.2: Security headers
- Task 2.3: Input validation
- Task 3.1: Logging

**Wave 3** (Parallel):
- Task 3.2: Health checks
- Task 3.3: Metrics
- Task 3.4: Tracing

**Wave 4** (Parallel):
- Task 4.1: Docker Compose
- Task 4.2: K8s manifests
- Task 4.3: DB setup scripts

**Wave 5** (Parallel):
- Task 5.1: Deployment guide
- Task 5.2: Configuration reference
- Task 5.3: API docs

**Wave 6** (Parallel):
- Task 5.4: Architecture diagrams
- Task 5.5: Operations runbook
- Task 6.1: Integration tests

**Wave 7** (Parallel):
- Task 6.2: Load testing
- Task 6.3: Security testing
- Task 1.3: Release workflow

## Success Criteria

✅ **CI/CD**: All workflows functional  
✅ **Security**: Auth, rate limiting, headers implemented  
✅ **Observability**: Logging, metrics, health checks working  
✅ **Deployment**: Docker Compose and K8s deployable  
✅ **Documentation**: Complete deployment and operations guides  
✅ **Testing**: Integration, load, and security tests passing  

---

**To execute this plan, run**: `/start-work`
