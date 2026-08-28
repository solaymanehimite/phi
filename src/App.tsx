import { useMemo, useState } from "react";
import { Composer } from "./components/composer";
import { Sidebar } from "./components/sidebar";
import { Button } from "./components/ui/button";
import { PanelLeftIcon } from "./components/ui/icons";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

type Chat = {
  id: string;
  title: string;
  messages: Message[];
};

const initialChats: Chat[] = [
  {
    id: "keyboard-shortcuts",
    title: "Add keyboard shortcuts",
    messages: [
      { id: 1, role: "user", content: "Add keyboard shortcuts to the command menu." },
      {
        id: 2,
        role: "assistant",
        content: "I can help with that. Which commands should get shortcuts first?",
      },
    ],
  },
  {
    id: "auth-flow",
    title: "Simplify the auth flow",
    messages: [
      { id: 1, role: "user", content: "Can you simplify the auth flow?" },
      {
        id: 2,
        role: "assistant",
        content: "Yes. I’ll start by tracing the current sign-in and session states.",
      },
    ],
  },
  {
    id: "empty-state",
    title: "Fix the empty state",
    messages: [
      { id: 1, role: "user", content: "The project empty state needs clearer copy." },
      {
        id: 2,
        role: "assistant",
        content: "I’ll keep it short and make the next action obvious.",
      },
    ],
  },
];

function titleFromMessage(message: string) {
  const trimmed = message.trim();
  return trimmed.length > 36 ? `${trimmed.slice(0, 36).trim()}…` : trimmed;
}

function App() {
  const [chats, setChats] = useState(initialChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const activeChat = useMemo(
    () => chats.find((chat) => chat.id === activeChatId) ?? null,
    [activeChatId, chats],
  );

  function startNewChat() {
    setActiveChatId(null);
  }

  function sendMessage(content: string) {
    const message: Message = { id: Date.now(), role: "user", content };

    if (activeChatId) {
      setChats((current) =>
        current.map((chat) =>
          chat.id === activeChatId
            ? { ...chat, messages: [...chat.messages, message] }
            : chat,
        ),
      );
      return;
    }

    const id = crypto.randomUUID();
    setChats((current) => [
      { id, title: titleFromMessage(content), messages: [message] },
      ...current,
    ]);
    setActiveChatId(id);
  }

  return (
    <div className="flex h-screen min-h-[480px] overflow-hidden bg-[#0c0c0d] text-[#e9e9eb] antialiased selection:bg-[#d6a85f]/25">
      {sidebarOpen && (
        <Sidebar
          chats={chats}
          activeChatId={activeChatId}
          onChatSelect={setActiveChatId}
          onClose={() => setSidebarOpen(false)}
          onNewChat={startNewChat}
        />
      )}

      <main className="relative flex min-w-0 flex-1 flex-col bg-[#0e0e0f]">
        <header
          data-tauri-drag-region
          className="flex h-13 shrink-0 items-center border-b border-white/[0.055] px-3"
        >
          {!sidebarOpen && (
            <Button
              variant="icon"
              aria-label="Open sidebar"
              title="Open sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeftIcon />
            </Button>
          )}
          <p className="pointer-events-none mx-auto truncate px-10 text-[13px] font-medium text-[#8b8b91]">
            {activeChat?.title ?? "New chat"}
          </p>
        </header>

        <section className="flex min-h-0 flex-1 flex-col">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-y-auto px-6 pt-10">
            {activeChat ? (
              <div className="space-y-8 pb-8 pt-3">
                {activeChat.messages.map((message) => (
                  <MessageRow key={message.id} message={message} />
                ))}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
                <div className="mb-5">
                  <span className="font-serif text-[56px] leading-none text-[#d6a85f]">Φ</span>
                </div>
                <h1 className="text-[19px] font-medium tracking-[-0.02em] text-[#dedee1]">
                  What can I help with?
                </h1>
                <p className="mt-2 text-[13px] text-[#707076]">
                  Ask Pi about your codebase.
                </p>
              </div>
            )}
          </div>

          <div className="shrink-0 px-4 pb-4 sm:px-7 sm:pb-6">
            <Composer onSend={sendMessage} />
          </div>
        </section>
      </main>
    </div>
  );
}

function MessageRow({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md border border-white/[0.06] bg-[#1b1b1e] px-4 py-2.5 text-[14px] leading-6 text-[#dedee1]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <p className="max-w-2xl text-[14px] leading-6 text-[#b9b9be]">
      {message.content}
    </p>
  );
}

export default App;
