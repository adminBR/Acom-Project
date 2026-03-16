import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle,
  ExternalLink,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Send,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useChatData } from "@/hooks/use-chat-data"
import {
  getApiBaseUrl,
  type ChatSessionItem,
  type OrchestratorMessage,
} from "@/lib/chat-api"

const DEFAULT_ATTENDANT_ID = "attendant-001"
const ATTENDANT_STORAGE_KEY = "acom.attendant-id"

function formatAbsolute(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso))
}

function formatRelative(iso: string) {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffSec = Math.max(1, Math.round((then - now) / 1000))
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" })

  const abs = Math.abs(diffSec)
  if (abs < 60) {
    return formatter.format(diffSec, "second")
  }

  const diffMin = Math.round(diffSec / 60)
  if (Math.abs(diffMin) < 60) {
    return formatter.format(diffMin, "minute")
  }

  const diffHour = Math.round(diffMin / 60)
  if (Math.abs(diffHour) < 24) {
    return formatter.format(diffHour, "hour")
  }

  const diffDay = Math.round(diffHour / 24)
  return formatter.format(diffDay, "day")
}

function channelClass(channel: string) {
  const lower = channel.toLowerCase()
  if (lower === "telegram") {
    return "bg-blue-100 text-blue-700 ring-blue-200"
  }
  if (lower === "slack") {
    return "bg-red-100 text-red-700 ring-red-200"
  }
  return "bg-zinc-100 text-zinc-700 ring-zinc-200"
}

interface OptimisticMessage {
  tempId: string
  sessionKey: string
  text: string
  createdAt: string
  platformUserId: string
  channelName: string
  channelUserId: string | null
  status: "sending" | "failed"
}

function SidebarItem({
  item,
  selected,
  onClick,
}: {
  item: ChatSessionItem
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-xl border px-3 py-3 text-left transition",
        "hover:border-blue-300 hover:bg-blue-50",
        selected
          ? "border-blue-500 bg-blue-50/80 shadow-sm"
          : "border-slate-200 bg-white",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-slate-900">
          {item.ds_id_channel_user || "Usuario desconhecido"}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${channelClass(item.ds_channel_name)}`}
        >
          {item.ds_channel_name}
        </span>
      </div>
      <p className="line-clamp-2 text-xs text-slate-500">
        {item.ds_last_text || "Sem mensagens ainda"}
      </p>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>Sessao #{item.cd_session}</span>
        <span>{formatRelative(item.dt_last_message)}</span>
      </div>
    </button>
  )
}

function MessageBubble({ message }: { message: OrchestratorMessage }) {
  const isPlatformReply = Boolean(message.ds_id_platform_user)
  return (
    <div
      className={`flex ${isPlatformReply ? "justify-end" : "justify-start"}`}
    >
      <div
        className={[
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm md:max-w-[70%]",
          isPlatformReply
            ? "rounded-br-sm bg-blue-600 text-white"
            : "rounded-bl-sm border border-slate-300 bg-slate-100 text-slate-900",
        ].join(" ")}
      >
        <p className="mb-1 wrap-break-word whitespace-pre-wrap">
          {message.ds_text}
        </p>
        <div
          className={`flex items-center gap-2 text-[11px] ${isPlatformReply ? "text-blue-100" : "text-slate-600"}`}
        >
          <span>
            {isPlatformReply
              ? `plataforma: ${message.ds_id_platform_user}`
              : `integracao: ${message.ds_channel_name}`}
          </span>
          <span>{formatAbsolute(message.dt_timestamp)}</span>
        </div>
      </div>
    </div>
  )
}

function OptimisticBubble({ message }: { message: OptimisticMessage }) {
  return (
    <div className="flex justify-end">
      <div
        className={[
          "max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm shadow-sm md:max-w-[70%]",
          message.status === "failed"
            ? "border border-red-200 bg-red-50 text-red-900"
            : "bg-blue-500 text-white",
        ].join(" ")}
      >
        <p className="mb-1 wrap-break-word whitespace-pre-wrap">
          {message.text}
        </p>
        <div
          className={[
            "flex items-center gap-2 text-[11px]",
            message.status === "failed" ? "text-red-700" : "text-blue-100",
          ].join(" ")}
        >
          <span>Usuario: {message.platformUserId}</span>
          {message.status === "sending" ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : null}
          {message.status === "failed" ? (
            <AlertCircle className="size-3.5" />
          ) : null}
          <span>
            {message.status === "failed" ? "falha no envio" : "enviando"}
          </span>
          <span>{formatAbsolute(message.createdAt)}</span>
        </div>
      </div>
    </div>
  )
}

function compactStatusLabel(ok: boolean) {
  return ok ? "OK" : "FALHA"
}

function statusTone(ok: boolean) {
  return ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700"
}

function TelemetryPanel({
  metrics,
  pollMs,
  apiBaseUrl,
}: {
  metrics: {
    sessions: { ok: boolean; latencyMs: number | null }
    messages: { ok: boolean; latencyMs: number | null }
    send: { ok: boolean; latencyMs: number | null }
  }
  pollMs: {
    sessions: number
    messages: number
  }
  apiBaseUrl: string
}) {
  const compactValues = [
    {
      key: "sessions",
      value: `${metrics.sessions.latencyMs ?? "-"} ms`,
      tone: statusTone(metrics.sessions.ok),
    },
    {
      key: "messages",
      value: `${metrics.messages.latencyMs ?? "-"} ms`,
      tone: statusTone(metrics.messages.ok),
    },
    {
      key: "send",
      value: `${metrics.send.latencyMs ?? "-"} ms`,
      tone: statusTone(metrics.send.ok),
    },
    {
      key: "chat-poll",
      value: `${pollMs.messages / 1000}s`,
      tone: "border-sky-200 bg-sky-50 text-sky-700",
    },
  ]

  const detailItems = [
    {
      label: "Sessoes",
      value: `${metrics.sessions.latencyMs ?? "-"} ms`,
      meta: compactStatusLabel(metrics.sessions.ok),
      tone: statusTone(metrics.sessions.ok),
    },
    {
      label: "Mensagens",
      value: `${metrics.messages.latencyMs ?? "-"} ms`,
      meta: compactStatusLabel(metrics.messages.ok),
      tone: statusTone(metrics.messages.ok),
    },
    {
      label: "Envio",
      value: `${metrics.send.latencyMs ?? "-"} ms`,
      meta: compactStatusLabel(metrics.send.ok),
      tone: statusTone(metrics.send.ok),
    },
    {
      label: "Polling chats",
      value: `${pollMs.sessions / 1000}s`,
      meta: "lista",
      tone: "border-blue-200 bg-blue-50 text-blue-700",
    },
    {
      label: "Polling chat",
      value: `${pollMs.messages / 1000}s`,
      meta: "aberto",
      tone: "border-sky-200 bg-sky-50 text-sky-700",
    },
  ]

  return (
    <div className="group relative">
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 p-2 shadow-sm backdrop-blur-md transition-all duration-200 hover:border-blue-200 hover:bg-white">
        <div className="grid grid-cols-2 gap-1">
          {compactValues.map((item) => (
            <span
              key={item.key}
              className={`rounded-lg border px-2 py-1 text-[11px] leading-none font-semibold whitespace-nowrap ${item.tone}`}
            >
              {item.value}
            </span>
          ))}
        </div>
      </div>

      <div aria-hidden="true" className="absolute inset-x-0 top-full h-3" />

      <div className="pointer-events-none invisible absolute top-full right-0 z-30 mt-1 w-72 translate-y-2 rounded-2xl border border-white/50 bg-white/88 p-3 opacity-0 shadow-xl shadow-slate-900/10 backdrop-blur-xl transition-all duration-200 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="mt-1 text-sm font-semibold text-slate-900">
              Telemetria
            </h3>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {detailItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/70 px-2.5 py-2"
            >
              <div>
                <p className="text-[11px] font-semibold text-slate-800">
                  {item.label}
                </p>
                <p className="text-[10px] text-slate-500">{item.meta}</p>
              </div>
              <span
                className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${item.tone}`}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-2">
          <p className="text-[10px] font-medium tracking-wide text-slate-500 uppercase">
            API
          </p>
          <p className="mt-1 truncate text-[11px] text-slate-700">
            {apiBaseUrl}
          </p>
        </div>
      </div>
    </div>
  )
}

export function App() {
  const [platformUserId, setPlatformUserId] = useState(DEFAULT_ATTENDANT_ID)
  const [isIdentityReady, setIsIdentityReady] = useState(false)
  const [showIdentityModal, setShowIdentityModal] = useState(false)
  const [identityDraft, setIdentityDraft] = useState("")
  const [identityError, setIdentityError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([])
  const identityInputRef = useRef<HTMLInputElement | null>(null)
  const {
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
    pollMs,
    metrics,
  } = useChatData(platformUserId)

  useEffect(() => {
    const storedId = window.localStorage.getItem(ATTENDANT_STORAGE_KEY)?.trim()
    if (storedId && storedId !== DEFAULT_ATTENDANT_ID) {
      setPlatformUserId(storedId)
      setIdentityDraft(storedId)
      setShowIdentityModal(false)
    } else {
      setPlatformUserId(DEFAULT_ATTENDANT_ID)
      setIdentityDraft("")
      setShowIdentityModal(true)
    }
    setIsIdentityReady(true)
  }, [])

  useEffect(() => {
    if (!showIdentityModal) {
      return
    }

    identityInputRef.current?.focus()
  }, [showIdentityModal])

  const selectedKey = useMemo(() => {
    if (!selectedSession) {
      return null
    }
    return `${selectedSession.cd_session}:${selectedSession.ds_channel_name}:${selectedSession.ds_id_channel_user || "unknown"}`
  }, [selectedSession])

  const listRef = useRef<HTMLDivElement | null>(null)
  const shouldStickToBottomRef = useRef(true)
  const previousMessageCountRef = useRef(0)
  const previousSelectedKeyRef = useRef<string | null>(null)

  const handleListScroll = () => {
    if (!listRef.current) {
      return
    }

    const distanceFromBottom =
      listRef.current.scrollHeight -
      listRef.current.scrollTop -
      listRef.current.clientHeight
    shouldStickToBottomRef.current = distanceFromBottom < 80
  }

  const visibleOptimisticMessages = useMemo(() => {
    if (!selectedKey) {
      return []
    }

    return optimisticMessages.filter((item) => {
      if (item.sessionKey !== selectedKey) {
        return false
      }

      const pendingTime = new Date(item.createdAt).getTime()
      const acceptanceWindowStart = pendingTime - 2000
      const hasServerMatch = messages.some((serverMessage) => {
        const serverTime = new Date(serverMessage.dt_timestamp).getTime()
        return (
          Boolean(serverMessage.ds_id_platform_user) &&
          serverMessage.ds_id_platform_user === item.platformUserId &&
          serverMessage.ds_channel_name === item.channelName &&
          serverMessage.ds_id_channel_user === item.channelUserId &&
          serverMessage.ds_text === item.text &&
          serverTime >= acceptanceWindowStart
        )
      })

      return !hasServerMatch
    })
  }, [optimisticMessages, selectedKey, messages])

  useEffect(() => {
    if (!listRef.current) {
      return
    }

    const totalMessages = messages.length + visibleOptimisticMessages.length
    const selectedChatChanged = previousSelectedKeyRef.current !== selectedKey
    const messagesIncreased = totalMessages > previousMessageCountRef.current

    if (
      selectedChatChanged ||
      (messagesIncreased && shouldStickToBottomRef.current)
    ) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }

    previousSelectedKeyRef.current = selectedKey
    previousMessageCountRef.current = totalMessages
  }, [messages.length, selectedKey, visibleOptimisticMessages.length])

  const canSend = Boolean(
    draft.trim() && selectedSession && platformUserId.trim()
  )

  const showChatLoading =
    Boolean(selectedSession) &&
    isLoadingMessages &&
    messages.length === 0 &&
    visibleOptimisticMessages.length === 0

  const persistPlatformUserId = (value: string) => {
    const trimmedValue = value.trim()
    setPlatformUserId(trimmedValue || DEFAULT_ATTENDANT_ID)
    if (trimmedValue) {
      window.localStorage.setItem(ATTENDANT_STORAGE_KEY, trimmedValue)
    } else {
      window.localStorage.removeItem(ATTENDANT_STORAGE_KEY)
    }
  }

  const onIdentitySubmit = () => {
    const trimmedIdentity = identityDraft.trim()
    if (!trimmedIdentity) {
      setIdentityError("Informe o nome ou id do atendente.")
      return
    }

    if (trimmedIdentity === DEFAULT_ATTENDANT_ID) {
      setIdentityError("Escolha um identificador diferente de attendant-001.")
      return
    }

    persistPlatformUserId(trimmedIdentity)
    setIdentityError(null)
    setShowIdentityModal(false)
  }

  const onSend = async () => {
    if (!canSend) {
      return
    }

    const text = draft.trim()
    const tempId = `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const createdAt = new Date().toISOString()
    setDraft("")
    setOptimisticMessages((current) => [
      ...current,
      {
        tempId,
        sessionKey: selectedKey || "",
        text,
        createdAt,
        platformUserId: platformUserId.trim(),
        channelName: selectedSession?.ds_channel_name || "",
        channelUserId: selectedSession?.ds_id_channel_user || null,
        status: "sending",
      },
    ])

    try {
      await postMessage(text)
    } catch {
      setDraft(text)
      setOptimisticMessages((current) =>
        current.map((item) =>
          item.tempId === tempId ? { ...item, status: "failed" } : item
        )
      )
    }
  }

  const apiBaseUrl = getApiBaseUrl()

  return (
    <div className="relative min-h-svh overflow-hidden bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.15),transparent_35%),radial-gradient(circle_at_85%_20%,rgba(239,68,68,0.12),transparent_40%),linear-gradient(180deg,#f8fbff_0%,#f6f8fc_55%,#fefcff_100%)]" />
      <div className="relative z-10 mx-auto flex h-svh max-w-7xl flex-col gap-2 p-2 md:p-3">
        <header className="rounded-2xl border border-blue-100 bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Sistema de Chats ACOM (Telegram, Slack e REST)
              </h1>
              <p className="mt-1 text-xs font-medium text-blue-700">
                Mande uma mensagem para o bot no Telegram para testar.
              </p>
              <a
                href="https://t.me/Acomtest_bot"
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100"
              >
                Abrir bot no Telegram para testar
                <ExternalLink className="size-3.5" />
              </a>
            </div>
            <div className="flex w-full flex-col gap-1.5 md:w-80">
              <label
                htmlFor="platform-id"
                className="text-xs font-medium tracking-wide text-slate-500 uppercase"
              >
                Id do usuario da plataforma
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="platform-id"
                  value={platformUserId}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setPlatformUserId(nextValue || DEFAULT_ATTENDANT_ID)
                    if (error) {
                      setError(null)
                    }
                  }}
                  onBlur={(event) => {
                    persistPlatformUserId(event.target.value)
                  }}
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm transition outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  placeholder="atendente-001"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refresh()}
                  className="h-10 border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="grid min-h-0 flex-1 gap-2 overflow-hidden md:grid-cols-[310px_1fr]">
          <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                Chats abertos
              </h2>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                {sessions.length}
              </span>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
              {isLoadingSessions && sessions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  Carregando chats...
                </p>
              ) : null}

              {!isLoadingSessions && sessions.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  Nenhuma conversa ainda.
                </p>
              ) : null}

              {sessions.map((item) => {
                const key = `${item.cd_session}:${item.ds_channel_name}:${item.ds_id_channel_user || "unknown"}`
                return (
                  <SidebarItem
                    key={key}
                    item={item}
                    selected={selectedKey === key}
                    onClick={() => selectSession(item)}
                  />
                )
              })}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {selectedSession?.ds_id_channel_user ||
                    "Selecione uma conversa"}
                </p>
                <p className="text-xs text-slate-500">
                  {selectedSession
                    ? `${selectedSession.ds_channel_name} | sessao #${selectedSession.cd_session}`
                    : "Escolha um chat na esquerda para responder"}
                </p>
              </div>
              <TelemetryPanel
                metrics={metrics}
                pollMs={pollMs}
                apiBaseUrl={apiBaseUrl}
              />
            </div>

            <div
              ref={listRef}
              onScroll={handleListScroll}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_60%,#fdf7f7_100%)] px-2.5 py-2.5 md:px-3"
            >
              {showChatLoading ? (
                <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 text-center text-sm text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle className="size-4 animate-spin text-blue-600" />
                    Carregando mensagens...
                  </span>
                </div>
              ) : null}

              {!selectedSession ? (
                <div className="flex h-full min-h-52 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 text-center text-sm text-slate-500">
                  Selecione um chat na barra lateral para visualizar e responder
                  de um lugar centralizado.
                </div>
              ) : null}

              {selectedSession &&
              !showChatLoading &&
              messages.length === 0 &&
              !isLoadingMessages ? (
                <div className="flex h-full min-h-52 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/70 px-4 text-center text-sm text-slate-500">
                  Nenhuma mensagem nesta sessao ainda.
                </div>
              ) : null}

              {!showChatLoading &&
                messages.map((message) => (
                  <MessageBubble key={message.cd_id} message={message} />
                ))}

              {!showChatLoading &&
                visibleOptimisticMessages.map((message) => (
                  <OptimisticBubble key={message.tempId} message={message} />
                ))}
            </div>

            {error ? (
              <div className="border-t border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="border-t border-slate-200 bg-white px-2.5 py-2 md:px-3">
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    if (error) {
                      setError(null)
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault()
                      void onSend()
                    }
                  }}
                  rows={2}
                  placeholder={
                    selectedSession
                      ? "Digite sua resposta..."
                      : "Selecione um chat antes de enviar"
                  }
                  className="max-h-36 min-h-10 flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm transition outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  disabled={!selectedSession || isSending}
                />
                <Button
                  type="button"
                  onClick={() => void onSend()}
                  disabled={!canSend || isSending}
                  className="h-10 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-slate-300"
                >
                  {isSending ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                <MessageCircle className="size-3.5" />
                <span>
                  Modo colaborativo: mensagens de outros usuarios tambem são
                  exibidas aqui.
                </span>
              </div>
            </div>
          </section>
        </main>
      </div>
      {isIdentityReady && showIdentityModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl border border-white/40 bg-white/72 p-6 shadow-2xl shadow-slate-900/20 backdrop-blur-xl">
            <p className="text-xs font-semibold tracking-[0.24em] text-blue-700 uppercase">
              Identificacao
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              Escolha seu nome de atendente
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Esse nome sera usado nas mensagens enviadas e salvo neste
              navegador.
            </p>
            <div className="mt-5 space-y-2">
              <label
                htmlFor="identity-modal-input"
                className="text-xs font-medium tracking-wide text-slate-500 uppercase"
              >
                Nome ou id do atendente
              </label>
              <input
                ref={identityInputRef}
                id="identity-modal-input"
                value={identityDraft}
                onChange={(event) => {
                  setIdentityDraft(event.target.value)
                  if (identityError) {
                    setIdentityError(null)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    onIdentitySubmit()
                  }
                }}
                className="h-12 w-full rounded-xl border border-white/60 bg-white/80 px-4 text-sm text-slate-900 transition outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder="ex.: maria.silva"
              />
              {identityError ? (
                <p className="text-sm text-red-600">{identityError}</p>
              ) : null}
            </div>
            <Button
              type="button"
              onClick={onIdentitySubmit}
              className="mt-6 h-11 w-full bg-blue-600 text-white hover:bg-blue-700"
            >
              Entrar no painel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
