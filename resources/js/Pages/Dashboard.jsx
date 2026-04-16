import { Head, router } from "@inertiajs/react";
import { useEffect, useState, useRef } from "react";
import axios from "axios";

export default function Dashboard({ auth, initialChats, initialKnowledge, initialReplyMode }) {
    // --- STATE MANAGEMENT ---
    const [chats, setChats] = useState(initialChats);
    const [activeTab, setActiveTab] = useState("chat"); 
    const [selectedContact, setSelectedContact] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");

    const [newMessage, setNewMessage] = useState("");
    const [aiUrl, setAiUrl] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);

    const scrollRef = useRef(null);

    // --- LOGIC FILTERING ---
    const filteredMessages = selectedContact
        ? chats.filter((c) => c.sender === selectedContact)
        : [];

    const allContacts = [...new Set(chats.map((c) => c.sender))];
    const filteredContacts = allContacts.filter((num) =>
        num.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    const [replyMode, setReplyMode] = useState(initialReplyMode || "manual");

    const toggleMode = async (newMode) => {
        try {
            await axios.post("/api/ai/update-mode", { mode: newMode });
            setReplyMode(newMode);
            alert(`Mode diubah ke: ${newMode.toUpperCase()}`);
        } catch (err) {
            alert("Gagal merubah mode.");
        }
    };

    // --- REAL-TIME LISTENER ---
    useEffect(() => {
        if (window.Echo) {
            window.Echo.channel("chat-channel").listen("NewChatEvent", (e) => {
                setChats((prev) => {
                    const exists = prev.find((c) => c.id === e.chat.id);
                    if (exists) {
                        return prev.map((c) => (c.id === e.chat.id ? e.chat : c));
                    }
                    return [e.chat, ...prev];
                });
            });
        }
        return () => window.Echo && window.Echo.leave("chat-channel");
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [filteredMessages, activeTab]);

    // --- HANDLERS ---
    const handleSend = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedContact) return;
        try {
            const res = await axios.post("/api/send-message", {
                receiver: selectedContact,
                message: newMessage,
            });
            setChats((prev) => [res.data, ...prev]);
            setNewMessage(""); 
        } catch (err) {
            alert("Gagal kirim pesan manual.");
        }
    };

    const handleSyncAI = async (e) => {
        e.preventDefault();
        if (!aiUrl.trim()) return;
        setIsSyncing(true);
        try {
            await axios.post("/api/ai/sync-knowledge", { url: aiUrl });
            setAiUrl("");
            router.reload({ only: ["initialKnowledge"] });
            alert("Sip! Data tour baru sudah dipelajari AI.");
        } catch (err) {
            alert("Gagal ambil data website.");
        } finally {
            setIsSyncing(false);
        }
    };

    // --- FUNGSI HAPUS DATA (BARU) ---
    const handleDeleteKnowledge = async (id) => {
        if (!confirm("Apakah kamu yakin ingin menghapus data tour ini? AI tidak akan bisa menjawab info dari link ini lagi.")) return;
        
        try {
            await axios.delete(`/api/ai/knowledge/${id}`);
            alert("Data berhasil dihapus!");
            // Refresh data agar tabel langsung update
            router.reload({ only: ["initialKnowledge"] });
        } catch (err) {
            alert("Gagal menghapus data.");
        }
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-[#0b141a] text-[#e9edef] antialiased">
            <Head title="Hayy Tour AI Dashboard" />

            {/* --- SIDEBAR LEFT --- */}
            <div className="w-[30%] min-w-[320px] flex flex-col border-r border-gray-700/50 bg-[#111b21]">
                <div className="flex flex-col bg-[#202c33]">
                    <div className="flex items-center justify-between px-4 py-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold uppercase">{auth.user.name.charAt(0)}</div>
                            <span className="text-sm font-semibold tracking-wide">{auth.user.name}</span>
                        </div>
                    </div>
                    <div className="flex px-2 pb-2 gap-2">
                        <button onClick={() => setActiveTab("chat")} className={`flex-1 py-2 text-[10px] font-black rounded-md tracking-widest transition ${activeTab === "chat" ? "bg-[#374248] text-indigo-400 border-b-2 border-indigo-400" : "text-gray-500 hover:bg-white/5"}`}>MESSAGES</button>
                        <button onClick={() => setActiveTab("knowledge")} className={`flex-1 py-2 text-[10px] font-black rounded-md tracking-widest transition ${activeTab === "knowledge" ? "bg-[#374248] text-indigo-400 border-b-2 border-indigo-400" : "text-gray-500 hover:bg-white/5"}`}>AI KNOWLEDGE</button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {activeTab === "chat" ? (
                        <>
                            <div className="p-3"><div className="bg-[#202c33] flex items-center px-4 py-2 rounded-xl"><input type="text" placeholder="Cari nomor..." className="w-full bg-transparent border-none text-sm focus:ring-0 text-[#e9edef]" onChange={(e) => setSearchQuery(e.target.value)} /></div></div>
                            {filteredContacts.map((num) => (
                                <div key={num} onClick={() => setSelectedContact(num)} className={`p-4 cursor-pointer border-b border-gray-800/50 transition ${selectedContact === num ? "bg-[#2a3942]" : "hover:bg-[#202c33]"}`}>
                                    <div className="font-medium text-sm">{num}</div>
                                    <p className="text-xs text-gray-500 truncate">{chats.find((c) => c.sender === num)?.message}</p>
                                </div>
                            ))}
                        </>
                    ) : (
                        <div className="p-6 space-y-4">
                            <div className="bg-[#202c33] p-5 rounded-2xl border border-gray-700/50 shadow-2xl">
                                <p className="text-[10px] text-gray-500 uppercase font-black mb-1">Knowledge Active</p>
                                <p className="text-3xl font-bold text-white">{initialKnowledge?.length || 0} <span className="text-sm font-normal text-gray-500">Sources</span></p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- MAIN AREA --- */}
            <div className="flex-1 flex flex-col bg-[#0b141a] relative border-l border-gray-700/30">
            {/* --- HEADER DENGAN SELECT MODE --- */}
                <div className="h-[60px] flex items-center justify-between px-6 bg-[#202c33] border-b border-gray-800/50">
                    <div className="flex items-center">
                        {/* <h3 className="font-bold text-sm tracking-wide">
                            {selectedContact ? selectedContact : "Pilih Chat"}
                        </h3> */}
                    </div>

                    {/* SAKLAR MODE BALASAN */}
                    <div className="flex items-center gap-3">
                        <span className="text-[9px] font-black tracking-widest text-gray-500 uppercase">System Mode:</span>
                        <div className="flex bg-[#111b21] p-1 rounded-lg border border-gray-700">
                            <button 
                                onClick={() => toggleMode("manual")}
                                className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all duration-300 ${replyMode === "manual" ? "bg-indigo-600 text-white shadow-lg" : "text-gray-500 hover:text-gray-300"}`}
                            >
                                MANUAL
                            </button>
                            <button 
                                onClick={() => toggleMode("ai")}
                                className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all duration-300 ${replyMode === "ai" ? "bg-emerald-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]" : "text-gray-500 hover:text-gray-300"}`}
                            >
                                AI AUTO
                            </button>
                        </div>
                    </div>
                </div>
                {activeTab === "chat" ? (
                    selectedContact ? (
                        <>
                            <div className="h-[60px] flex items-center px-4 bg-[#202c33] border-b border-gray-800/50">
                                <h3 className="font-bold text-sm tracking-wide">{selectedContact}</h3>
                            </div>
                            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat" style={{ backgroundBlendMode: "overlay", backgroundColor: "#0b141a" }}>
                                {[...filteredMessages].reverse().map((chat) => (
                                    <div key={chat.id} className={`flex w-full ${chat.is_from_me ? "justify-end" : "justify-start"}`}>
                                        <div className={`relative p-2.5 px-3 shadow-md max-w-[75%] rounded-xl ${chat.is_from_me ? "bg-[#005c4b] rounded-tr-none" : "bg-[#202c33] rounded-tl-none"}`}>
                                            <p className="text-[14.5px] pr-10 whitespace-pre-wrap">{chat.message}</p>
                                            <div className="flex items-center justify-end gap-1 mt-1">
                                                <span className="text-[9px] opacity-40">{new Date(chat.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                                                {chat.is_from_me === 1 && (
                                                    <svg viewBox="0 0 16 11" width="15" height="15" className={chat.status === "read" ? "text-[#53bdeb]" : "text-gray-500"}><path fill="currentColor" d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-3.51-3.13a.33.33 0 0 0-.478.01l-.503.527a.38.38 0 0 0 .007.535l4.196 3.738c.15.133.38.12.514-.03l6.545-7.722a.37.37 0 0 0-.054-.523zm-8.959 7.38L1.102 6.744a.374.374 0 0 0-.529.013L.05 7.298a.374.374 0 0 0 .012.529l4.912 4.31a.37.37 0 0 0 .523-.018l.854-.99a.37.37 0 0 0-.054-.523z"></path></svg>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <form onSubmit={handleSend} className="p-3 bg-[#202c33] flex items-center gap-2">
                                <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Ketik balasan manual..." className="flex-1 bg-[#2a3942] border-none rounded-lg py-2.5 px-4 text-sm focus:ring-1 focus:ring-indigo-500 text-white placeholder-gray-500" />
                                <button type="submit" className="p-2 text-indigo-400 hover:scale-110 transition active:scale-95"><svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"></path></svg></button>
                            </form>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-10"><svg viewBox="0 0 24 24" width="150" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"></path></svg></div>
                    )
                ) : (
                    /* --- AI KNOWLEDGE MANAGEMENT (TAB KANAN) --- */
                    <div className="flex-1 p-10 overflow-y-auto bg-[#0b141a]">
                        <div className="max-w-5xl mx-auto">
                            <div className="flex justify-between items-end mb-10 border-b border-gray-800 pb-8">
                                <div>
                                    <h1 className="text-3xl font-black text-white">Knowledge Center</h1>
                                    <p className="text-gray-500 text-sm mt-2">Daftar website yang datanya dipelajari AI Gemini untuk Hayy Tour.</p>
                                </div>
                                <form onSubmit={handleSyncAI} className="flex gap-2">
                                    <input type="url" value={aiUrl} onChange={(e) => setAiUrl(e.target.value)} placeholder="Input URL Website Tour..." className="w-80 bg-[#111b21] border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500 text-white" required />
                                    <button disabled={isSyncing} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 rounded-xl font-bold text-xs uppercase transition disabled:opacity-50">{isSyncing ? "SYNCING..." : "ADD SOURCE"}</button>
                                </form>
                            </div>

                            <div className="bg-[#111b21] rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-[#202c33] text-[10px] uppercase font-bold tracking-widest text-gray-500">
                                            <th className="px-6 py-5">#</th>
                                            <th className="px-6 py-5">Source URL (Tour List)</th>
                                            <th className="px-6 py-5">Content Size</th>
                                            <th className="px-6 py-5 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800/50">
                                        {initialKnowledge?.length > 0 ? initialKnowledge.map((item, index) => (
                                            <tr key={item.id} className="hover:bg-white/5 transition duration-200">
                                                <td className="px-6 py-4 text-gray-700 text-xs">{index + 1}</td>
                                                <td className="px-6 py-4">
                                                    <div className="text-indigo-400 text-sm font-medium hover:underline truncate max-w-lg">{item.source_url}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-[10px] bg-[#2a3942] text-gray-400 px-2 py-1 rounded-md font-mono">{item.content.length.toLocaleString()} Chars</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {/* TOMBOL DELETE (BARU) */}
                                                    <button 
                                                        onClick={() => handleDeleteKnowledge(item.id)}
                                                        className="text-gray-500 hover:text-red-500 transition p-2"
                                                        title="Hapus Data Ini"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="4" className="px-6 py-20 text-center text-gray-700 italic">Belum ada data tour. Masukkan URL di atas.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}