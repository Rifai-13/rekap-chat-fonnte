import { Head, router } from "@inertiajs/react";
import { useEffect, useState, useRef } from "react";
import axios from "axios";

export default function Dashboard({ auth, initialChats, initialKnowledge }) {
    // --- STATE MANAGEMENT ---
    const [chats, setChats] = useState(initialChats);
    const [knowledgeBase, setKnowledgeBase] = useState(initialKnowledge || []);
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

    // --- REAL-TIME LISTENER (LARAVEL ECHO) ---
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

    // --- AUTO SCROLL TO BOTTOM ---
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [filteredMessages, activeTab]);

    // --- HANDLE KIRIM PESAN MANUAL ---
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

    // --- HANDLE SYNC PENGETAHUAN AI ---
    const handleSyncAI = async (e) => {
        e.preventDefault();
        if (!aiUrl.trim()) return;
        setIsSyncing(true);
        try {
            await axios.post("/api/ai/sync-knowledge", { url: aiUrl });
            setAiUrl("");
            router.reload({ only: ["initialKnowledge"] });
        } catch (err) {
            alert("Gagal sinkronisasi.");
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-[#0b141a] text-[#e9edef] antialiased">
            <Head title="Hayy Tour AI Dashboard" />

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
                            <div className="p-3"><div className="bg-[#202c33] flex items-center px-4 py-2 rounded-xl"><input type="text" placeholder="Cari nomor chat..." className="w-full bg-transparent border-none text-sm focus:ring-0 placeholder-gray-600 text-[#e9edef]" onChange={(e) => setSearchQuery(e.target.value)} /></div></div>
                            {filteredContacts.map((num) => (
                                <div key={num} onClick={() => setSelectedContact(num)} className={`p-4 cursor-pointer border-b border-gray-800/50 transition ${selectedContact === num ? "bg-[#2a3942]" : "hover:bg-[#202c33]"}`}>
                                    <div className="font-medium text-sm text-[#e9edef]">{num}</div>
                                    <p className="text-xs text-gray-500 truncate">{chats.find((c) => c.sender === num)?.message}</p>
                                </div>
                            ))}
                        </>
                    ) : (
                        <div className="p-6 space-y-4">
                            <div className="bg-[#202c33] p-5 rounded-2xl border border-gray-700/50 shadow-2xl">
                                <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Knowledge Active</p>
                                <p className="text-3xl font-bold text-white">{initialKnowledge?.length || 0} <span className="text-sm font-normal text-gray-500">Source</span></p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 flex flex-col bg-[#0b141a] relative border-l border-gray-700/30">
                {selectedContact ? (
                    <>
                        <div className="h-[60px] flex items-center px-4 bg-[#202c33] border-b border-gray-800/50">
                            <h3 className="font-bold text-sm tracking-wide">{selectedContact}</h3>
                        </div>

                        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat" style={{ backgroundBlendMode: "overlay", backgroundColor: "#0b141a" }}>
                            {[...filteredMessages].reverse().map((chat) => (
                                <div key={chat.id} className={`flex w-full ${chat.is_from_me ? "justify-end" : "justify-start"}`}>
                                    <div className={`relative p-2.5 px-3 shadow-md max-w-[75%] rounded-xl ${chat.is_from_me ? "bg-[#005c4b] rounded-tr-none" : "bg-[#202c33] rounded-tl-none"}`}>
                                        <p className="text-[14.5px] leading-tight pr-10 whitespace-pre-wrap">{chat.message}</p>
                                        <div className="flex items-center justify-end gap-1 mt-1">
                                            <span className="text-[9px] opacity-50 uppercase font-bold">
                                                {new Date(chat.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                            </span>
                                            
                                            {/* FIX: Gunakan perbandingan === 1 agar angka 0 tidak muncul di layar */}
                                            {chat.is_from_me === 1 && (
                                                <svg viewBox="0 0 16 11" width="15" height="15" className={chat.status === "read" ? "text-[#53bdeb]" : "text-gray-500"}>
                                                    <path fill="currentColor" d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-3.51-3.13a.33.33 0 0 0-.478.01l-.503.527a.38.38 0 0 0 .007.535l4.196 3.738c.15.133.38.12.514-.03l6.545-7.722a.37.37 0 0 0-.054-.523zm-8.959 7.38L1.102 6.744a.374.374 0 0 0-.529.013L.05 7.298a.374.374 0 0 0 .012.529l4.912 4.31a.37.37 0 0 0 .523-.018l.854-.99a.37.37 0 0 0-.054-.523z"></path>
                                                </svg>
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
                )}
            </div>
        </div>
    );
}