import { useCallback, useEffect, useMemo, useState } from "react"

import {
  fetchMessages,
  fetchSessions,
  type ChatSessionItem,
  sendMessage,
  type OrchestratorMessage,
} from "@/lib/chat-api"

const POLL_MS = 4000

interface RequestMetric {
  lastRunAt: string | null
  latencyMs: number | null
  ok: boolean
}

function initialMetric(): RequestMetric {
  return {
    lastRunAt: null,
    latencyMs: null,
    ok: true,
  }
}

function sessionKey(
  session: Pick<
    ChatSessionItem,
    "cd_session" | "ds_channel_name" | "ds_id_channel_user"
  >
) {
  return `${session.cd_session}:${session.ds_channel_name}:${session.ds_id_channel_user || "unknown"}`
}

export function useChatData(platformUserId: string) {
  const [sessions, setSessions] = useState<ChatSessionItem[]>([])
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(
    null
  )
  const [messages, setMessages] = useState<OrchestratorMessage[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionsMetric, setSessionsMetric] =
    useState<RequestMetric>(initialMetric())
  const [messagesMetric, setMessagesMetric] =
    useState<RequestMetric>(initialMetric())
  const [sendMetric, setSendMetric] = useState<RequestMetric>(initialMetric())

  const selectedSession = useMemo(
    () =>
      sessions.find((session) => sessionKey(session) === selectedSessionKey) ||
      null,
    [sessions, selectedSessionKey]
  )

  const loadSessions = useCallback(async () => {
    const startedAt = performance.now()
    setIsLoadingSessions(true)
    try {
      const response = await fetchSessions()
      const latencyMs = Math.round(performance.now() - startedAt)
      setSessions(response.results)
      setError(null)
      setSessionsMetric({
        lastRunAt: new Date().toISOString(),
        latencyMs,
        ok: true,
      })

      if (!selectedSessionKey && response.results.length > 0) {
        setSelectedSessionKey(sessionKey(response.results[0]))
      }

      if (
        selectedSessionKey &&
        response.results.length > 0 &&
        !response.results.some(
          (item) => sessionKey(item) === selectedSessionKey
        )
      ) {
        setSelectedSessionKey(sessionKey(response.results[0]))
      }
    } catch (requestError) {
      const latencyMs = Math.round(performance.now() - startedAt)
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao carregar conversas"
      )
      setSessionsMetric({
        lastRunAt: new Date().toISOString(),
        latencyMs,
        ok: false,
      })
    } finally {
      setIsLoadingSessions(false)
    }
  }, [selectedSessionKey])

  const loadMessages = useCallback(async () => {
    if (!selectedSession) {
      setMessages([])
      return
    }

    setIsLoadingMessages(true)
    const startedAt = performance.now()
    try {
      const response = await fetchMessages({
        sessionId: selectedSession.cd_session,
        clientId: selectedSession.ds_id_channel_user || undefined,
        channelName: selectedSession.ds_channel_name,
      })
      const latencyMs = Math.round(performance.now() - startedAt)

      const sorted = [...response.results].sort((a, b) => {
        const byDate =
          new Date(a.dt_timestamp).getTime() -
          new Date(b.dt_timestamp).getTime()
        if (byDate !== 0) {
          return byDate
        }
        return a.cd_id - b.cd_id
      })

      setMessages(sorted)
      setError(null)
      setMessagesMetric({
        lastRunAt: new Date().toISOString(),
        latencyMs,
        ok: true,
      })
    } catch (requestError) {
      const latencyMs = Math.round(performance.now() - startedAt)
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Falha ao carregar mensagens"
      )
      setMessagesMetric({
        lastRunAt: new Date().toISOString(),
        latencyMs,
        ok: false,
      })
    } finally {
      setIsLoadingMessages(false)
    }
  }, [selectedSession])

  useEffect(() => {
    void loadSessions()
    const interval = window.setInterval(() => {
      void loadSessions()
    }, POLL_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [loadSessions])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  useEffect(() => {
    if (!selectedSession) {
      return
    }

    const interval = window.setInterval(() => {
      void loadMessages()
    }, POLL_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [selectedSession, loadMessages])

  const selectSession = useCallback((session: ChatSessionItem) => {
    setMessages([])
    setIsLoadingMessages(true)
    setSelectedSessionKey(sessionKey(session))
  }, [])

  const refresh = useCallback(async () => {
    await loadSessions()
    await loadMessages()
  }, [loadMessages, loadSessions])

  const postMessage = useCallback(
    async (text: string) => {
      if (!selectedSession || !selectedSession.ds_id_channel_user) {
        throw new Error("Selecione um chat valido antes de enviar")
      }

      if (!platformUserId.trim()) {
        throw new Error("O id de usuario da plataforma e obrigatorio")
      }

      setIsSending(true)
      const startedAt = performance.now()
      try {
        await sendMessage({
          ds_text: text,
          ds_id_platform_user: platformUserId.trim(),
          ds_id_channel_user: selectedSession.ds_id_channel_user,
          ds_channel_name: selectedSession.ds_channel_name,
        })
        const latencyMs = Math.round(performance.now() - startedAt)

        setError(null)
        setSendMetric({
          lastRunAt: new Date().toISOString(),
          latencyMs,
          ok: true,
        })
      } catch (requestError) {
        const latencyMs = Math.round(performance.now() - startedAt)
        const message =
          requestError instanceof Error
            ? requestError.message
            : "Falha ao enviar mensagem"
        setError(message)
        setSendMetric({
          lastRunAt: new Date().toISOString(),
          latencyMs,
          ok: false,
        })
        throw new Error(message)
      } finally {
        setIsSending(false)
      }
    },
    [selectedSession, platformUserId]
  )

  return {
    sessions,
    selectedSession,
    messages,
    error,
    isLoadingSessions,
    isLoadingMessages,
    isSending,
    selectSession,
    postMessage,
    refresh,
    setError,
    pollMs: POLL_MS,
    metrics: {
      sessions: sessionsMetric,
      messages: messagesMetric,
      send: sendMetric,
    },
  }
}
