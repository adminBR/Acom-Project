import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import {
  fetchMessages,
  fetchSessions,
  type ChatSessionItem,
  sendMessage,
  type OrchestratorMessage,
} from "@/lib/chat-api"

const SESSION_POLL_MS = 7000
const MESSAGE_POLL_MS = 3000

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
  const sessionsRequestIdRef = useRef(0)
  const messagesRequestIdRef = useRef(0)
  const activeMessagesKeyRef = useRef<string | null>(null)

  const selectedSession = useMemo(
    () =>
      sessions.find((session) => sessionKey(session) === selectedSessionKey) ||
      null,
    [sessions, selectedSessionKey]
  )

  const selectedMessageFilters = useMemo(() => {
    if (!selectedSession) {
      return null
    }

    return {
      key: sessionKey(selectedSession),
      sessionId: selectedSession.cd_session,
      clientId: selectedSession.ds_id_channel_user || undefined,
      channelName: selectedSession.ds_channel_name,
    }
  }, [
    selectedSession?.cd_session,
    selectedSession?.ds_channel_name,
    selectedSession?.ds_id_channel_user,
  ])

  const loadSessions = useCallback(async () => {
    const requestId = ++sessionsRequestIdRef.current
    const startedAt = performance.now()
    setIsLoadingSessions(true)
    try {
      const response = await fetchSessions()
      const latencyMs = Math.round(performance.now() - startedAt)
      if (requestId !== sessionsRequestIdRef.current) {
        return
      }

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
      if (requestId !== sessionsRequestIdRef.current) {
        return
      }

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
      if (requestId === sessionsRequestIdRef.current) {
        setIsLoadingSessions(false)
      }
    }
  }, [selectedSessionKey])

  const loadMessages = useCallback(
    async (force = false) => {
      if (!selectedMessageFilters) {
        activeMessagesKeyRef.current = null
        setMessages([])
        setIsLoadingMessages(false)
        return
      }

      if (
        !force &&
        activeMessagesKeyRef.current === selectedMessageFilters.key &&
        messagesRequestIdRef.current > 0
      ) {
        return
      }

      activeMessagesKeyRef.current = selectedMessageFilters.key
      const requestId = ++messagesRequestIdRef.current
      setIsLoadingMessages(true)
      const startedAt = performance.now()
      try {
        const response = await fetchMessages({
          sessionId: selectedMessageFilters.sessionId,
          clientId: selectedMessageFilters.clientId,
          channelName: selectedMessageFilters.channelName,
        })
        const latencyMs = Math.round(performance.now() - startedAt)
        if (requestId !== messagesRequestIdRef.current) {
          return
        }

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
        if (requestId !== messagesRequestIdRef.current) {
          return
        }

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
        if (requestId === messagesRequestIdRef.current) {
          setIsLoadingMessages(false)
        }
      }
    },
    [selectedMessageFilters]
  )

  useEffect(() => {
    void loadSessions()
    const interval = window.setInterval(() => {
      void loadSessions()
    }, SESSION_POLL_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [loadSessions])

  useEffect(() => {
    activeMessagesKeyRef.current = null
    void loadMessages(true)
  }, [selectedMessageFilters?.key, loadMessages])

  useEffect(() => {
    if (!selectedMessageFilters) {
      return
    }

    const interval = window.setInterval(() => {
      activeMessagesKeyRef.current = null
      void loadMessages(true)
    }, MESSAGE_POLL_MS)

    return () => {
      window.clearInterval(interval)
    }
  }, [selectedMessageFilters?.key, loadMessages])

  const selectSession = useCallback((session: ChatSessionItem) => {
    setMessages([])
    setIsLoadingMessages(true)
    activeMessagesKeyRef.current = null
    setSelectedSessionKey(sessionKey(session))
  }, [])

  const refresh = useCallback(async () => {
    activeMessagesKeyRef.current = null
    await Promise.all([loadSessions(), loadMessages(true)])
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
    pollMs: {
      sessions: SESSION_POLL_MS,
      messages: MESSAGE_POLL_MS,
    },
    metrics: {
      sessions: sessionsMetric,
      messages: messagesMetric,
      send: sendMetric,
    },
  }
}
