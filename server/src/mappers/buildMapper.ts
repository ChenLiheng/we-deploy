export interface BuildRow {
  id: string
  project_id: string
  iteration_id?: string
  environment: string
  status: string
  version: string
  description?: string
  commit_hash?: string
  branch?: string
  start_time: string
  end_time?: string
  error?: string
  trigger_by?: string
  kind?: string
}

export interface BuildDescription {
  qrcodePath?: string
  sourceBuildId?: string
}

export function parseBuildDescription(description?: string): BuildDescription {
  try {
    const parsed = JSON.parse(description || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function toLogResponse(l: any) {
  return {
    id: l.id,
    timestamp: l.timestamp,
    level: l.level,
    message: l.message,
    source: l.source || undefined,
  }
}

export function toBuildResponse(row: BuildRow, logs: any[] = []) {
  const descData = parseBuildDescription(row.description)
  return {
    id: row.id,
    projectId: row.project_id,
    iterationId: row.iteration_id || undefined,
    kind: row.kind === 'preview' ? 'preview' : 'upload',
    sourceBuildId: descData.sourceBuildId,
    environment: row.environment,
    status: row.status,
    version: row.version,
    qrcodeUrl: descData.qrcodePath ? `/api/builds/${row.id}/qrcode` : undefined,
    commitHash: row.commit_hash || undefined,
    branch: row.branch,
    logs: logs.map(toLogResponse),
    startTime: row.start_time,
    endTime: row.end_time || undefined,
    error: row.error || undefined,
    triggerBy: row.trigger_by,
  }
}
