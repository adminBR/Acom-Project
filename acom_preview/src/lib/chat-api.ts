export type ChatChannel = "telegram" | "slack" | "mock" | string

export interface OrchestratorMessage {
  cd_id: number
  cd_session: number
  ds_text: string
  dt_timestamp: string
  ds_id_platform_user: string | null
  ds_id_channel_user: string | null
  ds_channel_name: ChatChannel
}

export interface ChatSessionItem {
  cd_session: number
  ds_channel_name: ChatChannel
  ds_id_channel_user: string | null
  dt_last_message: string
  ds_last_text: string | null
  ds_last_platform_user: string | null
  cd_last_message_id: number
  total_messages: number
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface SendMessagePayload {
  ds_text: string
  ds_id_platform_user: string
  ds_id_channel_user: string
  ds_channel_name: ChatChannel
}

export function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()
  if (!configured) {
    throw new Error(
      "Variavel VITE_API_BASE_URL nao definida. Configure no .env do frontend."
    )
  }
  return configured.replace(/\/$/, "")
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `HTTP ${response.status}`)
  }

  return (await response.json()) as T
}

export async function fetchSessions(
  pageSize = 50
): Promise<PaginatedResponse<ChatSessionItem>> {
  const params = new URLSearchParams({ page_size: String(pageSize) })
  return fetchJson<PaginatedResponse<ChatSessionItem>>(
    `${getApiBaseUrl()}/manager/sessions/?${params.toString()}`
  )
}

interface MessageFilters {
  sessionId?: number
  clientId?: string
  channelName?: ChatChannel
  pageSize?: number
}

export async function fetchMessages(
  filters: MessageFilters
): Promise<PaginatedResponse<OrchestratorMessage>> {
  const params = new URLSearchParams({
    page_size: String(filters.pageSize || 100),
  })

  if (typeof filters.sessionId === "number") {
    params.set("session_id", String(filters.sessionId))
  }

  if (filters.clientId) {
    params.set("client_id", filters.clientId)
  }

  if (filters.channelName) {
    params.set("channel_name", filters.channelName)
  }

  return fetchJson<PaginatedResponse<OrchestratorMessage>>(
    `${getApiBaseUrl()}/manager/messages/?${params.toString()}`
  )
}

export async function sendMessage(payload: SendMessagePayload) {
  return fetchJson<Record<string, unknown>>(
    `${getApiBaseUrl()}/manager/messages/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  )
}
