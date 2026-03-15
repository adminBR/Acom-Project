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
          <span>plataforma: {message.platformUserId}</span>
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

export function App() {
  const [platformUserId, setPlatformUserId] = useState("attendant-001")
  const [draft, setDraft] = useState("")
  const [optimisticMessages, setOptimisticMessages] = useState<
    OptimisticMessage[]
  >([])
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

  const selectedKey = useMemo(() => {
    if (!selectedSession) {
      return null
    }
    return `${selectedSession.cd_session}:${selectedSession.ds_channel_name}:${selectedSession.ds_id_channel_user || "unknown"}`
  }, [selectedSession])

  const listRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!listRef.current) {
      return
    }
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, optimisticMessages, selectedKey])

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

  const canSend = Boolean(
    draft.trim() && selectedSession && platformUserId.trim()
  )

  const showChatLoading =
    Boolean(selectedSession) &&
    isLoadingMessages &&
    messages.length === 0 &&
    visibleOptimisticMessages.length === 0

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

  return (
    <div className="relative min-h-svh overflow-hidden bg-slate-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.15),transparent_35%),radial-gradient(circle_at_85%_20%,rgba(239,68,68,0.12),transparent_40%),linear-gradient(180deg,#f8fbff_0%,#f6f8fc_55%,#fefcff_100%)]" />
      <div className="relative z-10 mx-auto flex h-svh max-w-7xl flex-col gap-2 p-2 md:p-3">
        <section className="rounded-xl border border-slate-200 bg-white/90 px-2 py-1.5 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-700">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium">
              SESSOES {compactStatusLabel(metrics.sessions.ok)} |{" "}
              {metrics.sessions.latencyMs ?? "-"} ms
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium">
              MSGS {compactStatusLabel(metrics.messages.ok)} |{" "}
              {metrics.messages.latencyMs ?? "-"} ms
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium">
              ENVIO {compactStatusLabel(metrics.send.ok)} |{" "}
              {metrics.send.latencyMs ?? "-"} ms
            </span>
            <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-medium text-blue-700">
              POLLING {pollMs / 1000}s
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium">
              EXIBIDAS {messages.length + visibleOptimisticMessages.length}
            </span>
          </div>
        </section>

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
            <div className="flex w-full flex-col gap-1.5 md:w-auto md:min-w-90">
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
                  onChange={(event) => setPlatformUserId(event.target.value)}
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
              <div className="text-xs text-slate-500">
                API: {getApiBaseUrl()}
              </div>
            </div>

            <div
              ref={listRef}
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
    </div>
  )
}

export default App
