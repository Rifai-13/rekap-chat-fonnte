import { Head, router } from "@inertiajs/react";
import { useEffect, useState, useRef } from "react";
import axios from "axios";

export default function Dashboard({
    auth,
    initialChats,
    initialKnowledge,
    initialReplyMode,
}) {
    const [chats, setChats] = useState(initialChats);
    const [activeTab, setActiveTab] = useState("chat");
    const [selectedContact, setSelectedContact] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [newMessage, setNewMessage] = useState("");
    const [aiUrl, setAiUrl] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);
    const [replyMode, setReplyMode] = useState(initialReplyMode || "manual");
    
    const [isSending, setIsSending] = useState(false);
    const scrollRef = useRef(null);

    const allContacts = [...new Set(chats.map((c) => c.sender))];
    const filteredContacts = allContacts.filter((num) =>
        num.includes(searchQuery),
    );
    const filteredMessages = selectedContact
        ? chats.filter((c) => c.sender === selectedContact)
        : [];

    const handleSelectContact = async (num) => {
        setSelectedContact(num);
        if (
            chats.some(
                (c) =>
                    c.sender === num && c.status === "unread" && !c.is_from_me,
            )
        ) {
            try {
                await axios.post("/api/chat/mark-as-read", { sender: num });
                setChats((prev) =>
                    prev.map((c) =>
                        c.sender === num && c.status === "unread"
                            ? { ...c, status: "read" }
                            : c,
                    ),
                );
            } catch (e) {}
        }
    };

    const toggleMode = async (newMode) => {
        try {
            await axios.post("/api/ai/update-mode", { mode: newMode });
            setReplyMode(newMode);
        } catch (err) {
            alert("Gagal ubah mode");
        }
    };

    const handleSend = async (e) => {
        e.preventDefault();

        if (!newMessage.trim() || !selectedContact || isSending) return;

        setIsSending(true);
        const msgToSend = newMessage;
        setNewMessage("");

        try {
            const res = await axios.post("/api/send-message", {
                receiver: selectedContact,
                message: msgToSend,
            });
            
            setChats((prev) => {
                const isExist = prev.find((c) => c.id === res.data.id);
                if (isExist) return prev;
                return [res.data, ...prev];
            });
        } catch (err) {
            alert("Gagal kirim pesan");
            setNewMessage(msgToSend);
            setIsSending(false);
        }
    };

    const handleSyncAI = async (e) => {
        e.preventDefault();
        setIsSyncing(true);
        try {
            await axios.post("/api/ai/sync-knowledge", { url: aiUrl });
            setAiUrl("");
            router.reload({ only: ["initialKnowledge"] });
            alert("Data Website Berhasil Diserap AI!");
        } catch (err) {
            alert("Gagal sinkron");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDeleteKnowledge = async (id) => {
        if (!confirm("Hapus sumber data ini?")) return;
        try {
            await axios.delete(`/api/ai/knowledge/${id}`);
            router.reload({ only: ["initialKnowledge"] });
        } catch (err) {
            alert("Gagal hapus");
        }
    };

    useEffect(() => {
        if (window.Echo) {
            window.Echo.channel("chat-channel").listen("NewChatEvent", (e) => {
                setChats((prev) => {
                    const exists = prev.find((c) => c.id === e.chat.id);
                    if (exists)
                        return prev.map((c) =>
                            c.id === e.chat.id ? e.chat : c,
                        );
                    return [e.chat, ...prev];
                });
            });
        }
    }, []);

    useEffect(() => {
        if (scrollRef.current)
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [filteredMessages, chats]);

    return (
        <div className="flex h-screen w-screen bg-[#0b141a] text-[#e9edef] overflow-hidden antialiased font-sans">
            <Head title="Hayy Tour AI Dashboard" />

            {/* SIDEBAR LEFT */}
            <div className="w-[30%] min-w-[320px] flex flex-col border-r border-gray-700/50 bg-[#111b21]">
                <div className="p-4 bg-[#202c33]">
                    <div className="flex items-center justify-between mb-4">
                        <span className="font-bold text-indigo-400 text-sm tracking-widest uppercase">
                            {auth.user.name}
                        </span>
                        <div className="flex bg-[#111b21] p-1 rounded-lg border border-gray-700 shadow-inner">
                            <button
                                onClick={() => toggleMode("manual")}
                                className={`px-3 py-1 text-[10px] font-bold rounded transition-all duration-300 ${replyMode === "manual" ? "bg-indigo-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"}`}
                            >
                                MANUAL
                            </button>
                            <button
                                onClick={() => toggleMode("ai")}
                                className={`px-3 py-1 text-[10px] font-bold rounded transition-all duration-300 ${replyMode === "ai" ? "bg-emerald-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"}`}
                            >
                                AI AUTO
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-2 mb-3">
                        <button
                            onClick={() => setActiveTab("chat")}
                            className={`flex-1 py-2 text-[10px] font-black rounded tracking-widest transition ${activeTab === "chat" ? "bg-[#374248] text-indigo-400 border-b-2 border-indigo-400" : "text-gray-500 hover:bg-white/5"}`}
                        >
                            MESSAGES
                        </button>
                        <button
                            onClick={() => setActiveTab("knowledge")}
                            className={`flex-1 py-2 text-[10px] font-black rounded tracking-widest transition ${activeTab === "knowledge" ? "bg-[#374248] text-indigo-400 border-b-2 border-indigo-400" : "text-gray-500 hover:bg-white/5"}`}
                        >
                            AI KNOWLEDGE
                        </button>
                    </div>
                    <input
                        type="text"
                        placeholder="Cari nomor..."
                        className="w-full bg-[#111b21] border-none rounded-lg text-xs py-2.5 px-4 focus:ring-1 focus:ring-indigo-500"
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {activeTab === "chat" ? (
                        filteredContacts.map((num) => {
                            const contactChats = chats.filter(
                                (c) => c.sender === num,
                            );

                            const lastMsg = contactChats[0];

                            const unreadCount = contactChats.filter(
                                (c) => c.status === "unread" && !c.is_from_me,
                            ).length;

                            return (
                                <div
                                    key={num}
                                    onClick={() => handleSelectContact(num)}
                                    className={`p-4 cursor-pointer border-b border-gray-800/50 transition flex justify-between items-center ${selectedContact === num ? "bg-[#2a3942]" : "hover:bg-[#202c33]"}`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div
                                            className={`font-medium text-sm ${unreadCount > 0 ? "text-white font-bold" : ""}`}
                                        >
                                            {num}
                                        </div>
                                        <p
                                            className={`text-xs truncate ${unreadCount > 0 ? "text-white font-semibold" : "text-gray-500"}`}
                                        >
                                            {lastMsg?.message}
                                        </p>
                                    </div>
                                    {unreadCount > 0 && (
                                        <div className="ml-2 bg-emerald-500 text-[#111b21] text-[10px] font-black h-5 w-5 rounded-full flex items-center justify-center">
                                            {unreadCount}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div className="p-4 space-y-4">
                            <div className="bg-[#202c33] p-4 rounded-xl border border-gray-700/50 shadow-xl text-center">
                                <p className="text-[10px] text-gray-500 uppercase font-black mb-1">
                                    Knowledge Active
                                </p>
                                <p className="text-2xl font-bold">
                                    {initialKnowledge?.length || 0} Sources
                                </p>
                            </div>
                            {initialKnowledge?.map((item) => (
                                <div
                                    key={item.id}
                                    className="p-3 bg-[#111b21] rounded-lg border border-gray-800 flex justify-between items-center group"
                                >
                                    <div className="truncate text-[10px] text-indigo-400 font-mono flex-1">
                                        {item.source_url}
                                    </div>
                                    <button
                                        onClick={() =>
                                            handleDeleteKnowledge(item.id)
                                        }
                                        className="text-red-500 opacity-0 group-hover:opacity-100 transition p-1 hover:bg-red-500/10 rounded"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="14"
                                            height="14"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* MAIN AREA */}
            <div className="flex-1 flex flex-col bg-[#0b141a]">
                {activeTab === "chat" ? (
                    selectedContact ? (
                        <>
                            <div className="h-[60px] px-6 bg-[#202c33] flex items-center border-b border-gray-800/50 font-bold shadow-sm">
                                {selectedContact}
                            </div>
                            <div
                                ref={scrollRef}
                                className="flex-1 overflow-y-auto p-6 space-y-4 bg-[#0b141a] custom-scrollbar bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat"
                                style={{ backgroundBlendMode: "overlay" }}
                            >
                                {[...filteredMessages].reverse().map((c) => {
                                    
                                    // --- LOGIKA CENTANG ---
                                    let ticks = "✓"; 
                                    let tickColor = "opacity-60 text-gray-400"; 

                                    const st = c.status?.toLowerCase();
                                    if (st === "delivered") {
                                        ticks = "✓✓";
                                    } else if (st === "read") {
                                        ticks = "✓✓";
                                        tickColor = "text-[#53bdeb] opacity-100 font-bold"; 
                                    }

                                    return (
                                        <div
                                            key={c.id}
                                            className={`flex ${c.is_from_me ? "justify-end" : "justify-start"}`}
                                        >
                                            <div
                                                className={`p-2.5 rounded-xl max-w-[75%] shadow-md animate-in fade-in slide-in-from-bottom-1 ${c.is_from_me ? "bg-[#005c4b] rounded-tr-none" : "bg-[#202c33] rounded-tl-none"}`}
                                            >
                                                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                                                    {c.message}
                                                </p>
                                                <div className="text-[9px] text-right mt-1 flex items-center justify-end gap-1">
                                                    <span className="opacity-60 text-gray-400">
                                                        {new Date(
                                                            c.created_at,
                                                        ).toLocaleTimeString([], {
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}
                                                    </span>
                                                    {c.is_from_me ? (
                                                        <span
                                                            className={tickColor}
                                                            style={{ letterSpacing: "-1px" }}
                                                        >
                                                            {ticks}
                                                        </span>
                                                    ) : null}
                                                    
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <form
                                onSubmit={handleSend}
                                className="p-3 bg-[#202c33] flex gap-2 border-t border-gray-800"
                            >
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) =>
                                        setNewMessage(e.target.value)
                                    }
                                    disabled={isSending}
                                    className="flex-1 bg-[#2a3942] border-none rounded-lg text-sm text-white focus:ring-1 focus:ring-indigo-500 py-3 px-4 disabled:opacity-50"
                                    placeholder="Ketik balasan..."
                                />
                                <button
                                    type="submit"
                                    disabled={isSending}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 rounded-lg transition-colors font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                                >
                                    {isSending ? "MENGIRIM..." : "KIRIM"}
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-5 select-none">
                            <svg
                                viewBox="0 0 24 24"
                                width="150"
                                fill="currentColor"
                            >
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"></path>
                            </svg>
                            <p className="mt-4 font-black tracking-tighter text-2xl uppercase">
                                Hayy Tour AI
                            </p>
                        </div>
                    )
                ) : (
                    /* AI KNOWLEDGE CENTER AREA (FULL) */
                    <div className="flex-1 p-10 overflow-y-auto">
                        <div className="max-w-4xl mx-auto animate-in fade-in duration-700">
                            <div className="flex justify-between items-end mb-10 border-b border-gray-800 pb-8">
                                <div>
                                    <h1 className="text-4xl font-black text-white tracking-tighter">
                                        KNOWLEDGE CENTER
                                    </h1>
                                    <p className="text-gray-500 text-sm mt-2 font-medium">
                                        Latih AI Gemini dengan menyerap data
                                        dari website tour kamu.
                                    </p>
                                </div>
                                <form
                                    onSubmit={handleSyncAI}
                                    className="flex gap-3"
                                >
                                    <input
                                        type="url"
                                        value={aiUrl}
                                        onChange={(e) =>
                                            setAiUrl(e.target.value)
                                        }
                                        placeholder="Masukkan URL Website..."
                                        className="w-80 bg-[#111b21] border-gray-700 rounded-xl px-5 py-3 text-sm focus:ring-1 focus:ring-indigo-500"
                                        required
                                    />
                                    <button
                                        disabled={isSyncing}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/20 disabled:opacity-50 transition-all"
                                    >
                                        {isSyncing
                                            ? "SYNCING..."
                                            : "ADD SOURCE"}
                                    </button>
                                </form>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-[#111b21] p-8 rounded-3xl border border-gray-800 shadow-2xl flex flex-col items-center justify-center space-y-4">
                                    <div className="w-16 h-16 bg-indigo-600/10 rounded-full flex items-center justify-center text-indigo-500">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="32"
                                            height="32"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                        </svg>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-3xl font-black">
                                            {initialKnowledge?.length || 0}
                                        </p>
                                        <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">
                                            Active Sources
                                        </p>
                                    </div>
                                </div>
                                <div className="bg-[#111b21] p-8 rounded-3xl border border-gray-800 shadow-2xl flex flex-col items-center justify-center space-y-4">
                                    <div className="w-16 h-16 bg-emerald-600/10 rounded-full flex items-center justify-center text-emerald-500">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="32"
                                            height="32"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-3xl font-black">
                                            FAST
                                        </p>
                                        <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest">
                                            Sync Speed
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}