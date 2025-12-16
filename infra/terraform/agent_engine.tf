# Git With Intent - Vertex AI Agent Engine Configuration
#
# Multi-agent system:
# - Orchestrator: Routes work between agents
# - Triage: Gemini Flash - fast complexity scoring
# - Resolver: Claude Sonnet/Opus - conflict resolution
# - Reviewer: Claude Sonnet - validation

# Orchestrator Agent Engine
resource "google_vertex_ai_reasoning_engine" "orchestrator" {
  display_name = "${local.resource_prefix}-orchestrator"
  project      = var.project_id

  depends_on = [
    google_service_account.agent_engine,
    google_project_iam_member.agent_engine_aiplatform,
  ]
}

# Triage Agent Engine (Gemini Flash)
resource "google_vertex_ai_reasoning_engine" "triage" {
  display_name = "${local.resource_prefix}-triage"
  project      = var.project_id

  depends_on = [
    google_service_account.agent_engine,
    google_project_iam_member.agent_engine_aiplatform,
  ]
}

# Resolver Agent Engine (Claude)
resource "google_vertex_ai_reasoning_engine" "resolver" {
  display_name = "${local.resource_prefix}-resolver"
  project      = var.project_id

  depends_on = [
    google_service_account.agent_engine,
    google_project_iam_member.agent_engine_aiplatform,
  ]
}

# Reviewer Agent Engine (Claude)
resource "google_vertex_ai_reasoning_engine" "reviewer" {
  display_name = "${local.resource_prefix}-reviewer"
  project      = var.project_id

  depends_on = [
    google_service_account.agent_engine,
    google_project_iam_member.agent_engine_aiplatform,
  ]
}

# Outputs
output "orchestrator_engine_id" {
  value = google_vertex_ai_reasoning_engine.orchestrator.id
}

output "triage_engine_id" {
  value = google_vertex_ai_reasoning_engine.triage.id
}

output "resolver_engine_id" {
  value = google_vertex_ai_reasoning_engine.resolver.id
}

output "reviewer_engine_id" {
  value = google_vertex_ai_reasoning_engine.reviewer.id
}
