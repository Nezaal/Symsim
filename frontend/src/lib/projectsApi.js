import { supabase } from './supabase.js'

/** A failed API call with a message safe to show to users. Details go to the console. */
export class ApiError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'ApiError'
    this.cause = cause
  }
}

/** Throws ApiError when a Supabase call failed; otherwise returns its data. */
function unwrap({ data, error }, userMessage) {
  if (error) {
    console.error(userMessage, error)
    // Quota triggers raise readable messages (e.g. "Project limit reached (50 per user)").
    const quota = /limit reached/i.test(error.message ?? '') ? error.message : null
    throw new ApiError(quota ?? userMessage, error)
  }
  return data
}

/** Maps an engine SimulationResult onto the simulation_results columns. */
export function toResultRow(simulationId, result) {
  return {
    simulation_id: simulationId,
    throughput_rps: result.throughputRps,
    total_requests: result.totalRequests,
    successful_requests: result.successfulRequests,
    failed_requests: result.failedRequests,
    rejected_requests: result.rejectedRequests,
    timed_out_requests: result.timedOutRequests,
    error_rate: result.errorRate,
    latency_p50_ms: result.latencyP50Ms,
    latency_p95_ms: result.latencyP95Ms,
    latency_p99_ms: result.latencyP99Ms,
    bottleneck_node_id: result.bottleneck?.nodeId ?? null,
    timeseries: result.timeseries,
  }
}

/** Workload settings worth keeping with a run (the Client components' traffic). */
export function workloadFromGraph(snapshot) {
  return {
    clients: snapshot.nodes
      .filter((n) => n.data.componentType === 'client')
      .map((n) => ({ id: n.id, ...n.data.config })),
  }
}

/**
 * Data access for projects, versions, runs and share links: the repository
 * the stores talk to. Every query relies on Row Level Security; nothing here
 * decides who may see what.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client injectable for tests
 */
export function createProjectsApi(client = supabase) {
  const requireClient = () => {
    if (!client) throw new ApiError('Saving is not available: the backend is not configured.')
    return client
  }

  return {
    /** The signed-in user's own projects, most recently updated first. */
    async listMyProjects(userId) {
      const result = await requireClient()
        .from('projects')
        .select('id, name, visibility, updated_at')
        .eq('owner_id', userId)
        .order('updated_at', { ascending: false })
      return unwrap(result, "Couldn't load your projects.")
    },

    async createProject(name) {
      const result = await requireClient()
        .from('projects')
        .insert({ name })
        .select('id, name, visibility, updated_at')
        .single()
      return unwrap(result, "Couldn't create the project.")
    },

    async renameProject(projectId, name) {
      const result = await requireClient()
        .from('projects')
        .update({ name })
        .eq('id', projectId)
        .select('id, name, visibility, updated_at')
        .single()
      return unwrap(result, "Couldn't rename the project.")
    },

    /** Saves a new immutable version; the database assigns its number. */
    async saveVersion(projectId, snapshot, message) {
      const result = await requireClient()
        .from('project_versions')
        .insert({ project_id: projectId, graph: snapshot, message: message || null })
        .select('id, version_number, created_at')
        .single()
      return unwrap(result, "Couldn't save this version.")
    },

    /** A project plus its newest version (null if it has none yet). */
    async openProject(projectId) {
      const db = requireClient()
      const project = unwrap(
        await db.from('projects').select('id, name, visibility, owner_id, updated_at').eq('id', projectId).maybeSingle(),
        "Couldn't open the project.",
      )
      if (!project) throw new ApiError("This project doesn't exist or you don't have access to it.")
      const version = unwrap(
        await db
          .from('project_versions')
          .select('id, version_number, graph, message, created_at')
          .eq('project_id', projectId)
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle(),
        "Couldn't load the latest version.",
      )
      return { project, version }
    },

    /**
     * Stores a finished run and its results against a saved version. If the
     * results insert fails, the half-written simulation row is removed.
     */
    async saveRun(versionId, { options, result, workload, startedAt, finishedAt }) {
      const db = requireClient()
      const simulation = unwrap(
        await db
          .from('simulations')
          .insert({
            version_id: versionId,
            duration_seconds: options.durationSec,
            seed: options.seed,
            workload,
            status: 'completed',
            started_at: startedAt,
            finished_at: finishedAt,
          })
          .select('id')
          .single(),
        "Couldn't save this run.",
      )
      const { error } = await db.from('simulation_results').insert(toResultRow(simulation.id, result))
      if (error) {
        await db.from('simulations').delete().eq('id', simulation.id)
        unwrap({ error }, "Couldn't save this run's results.")
      }
      return simulation
    },

    async createShareLink(versionId) {
      const result = await requireClient()
        .from('share_links')
        .insert({ version_id: versionId })
        .select('id, token, created_at')
        .single()
      return unwrap(result, "Couldn't create a share link.")
    },

    /** Public: works signed out. Returns null for an unknown, revoked or expired token. */
    async getSharedVersion(token) {
      const rows = unwrap(
        await requireClient().rpc('get_shared_version', { share_token: token }),
        "Couldn't load the shared design.",
      )
      return rows?.[0] ?? null
    },
  }
}

export const projectsApi = createProjectsApi()
