import { Head, router } from "@inertiajs/react";
import { useEffect, useState, useRef } from "react";
import axios from "axios";

export default function Dashboard({ auth, initialChats, initialKnowledge }) {
    // --- STATE MANAGEMENT ---
    const [chats, setChats] = useState(initialChats);
    const [knowledgeBase, setKnowledgeBase] = useState(initialKnowledge || []);
    const [activeTab, setActiveTab] = useState("chat"); // 'chat' atau 'knowledge'
    const [selectedContact, setSelectedContact] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    
    // State untuk Input Chat Manual
    const [newMessage, setNewMessage] = useState("");
    
    // State untuk Management AI
    const [aiUrl, setAiUrl] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);

    const scrollRef = useRef(null);

    // --- LOGIC FILTERING ---
    const filteredMessages = selectedContact 
        ? chats.filter((c) => c.sender === selectedContact) 
        : [];

    const allContacts = [...new Set(chats.map((c) => c.sender))];
    const filteredContacts = allContacts.filter(num => 
        num.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // --- REAL-TIME LISTENER (LARAVEL ECHO) ---
    useEffect(() => {
        window.Echo.channel("chat-channel").listen("NewChatEvent", (e) => {
            setChats((prev) => [e.chat, ...prev]);
        });
        return () => window.Echo.leave("chat-channel");
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
            
            // Masukkan ke state lokal agar langsung muncul di layar
            setChats((prev) => [res.data, ...prev]);
            setNewMessage(""); // Reset kolom input
        } catch (err) {
            alert("Gagal kirim pesan manual. Cek koneksi Fonnte/Server.");
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
            // Refresh data dari server via Inertia agar tabel update
            router.reload({ only: ['initialKnowledge'] });
            alert("Data website berhasil dipelajari AI!");
        } catch (err) {
            alert("Gagal sinkronisasi. Pastikan URL valid.");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleLogout = () => {
        router.post(route("logout"));
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-[#0b141a] text-[#e9edef] antialiased">
            <Head title="Hayy Tour AI Dashboard" />

            {/* --- SIDEBAR LEFT --- */}
            <div className="w-[30%] min-w-[320px] flex flex-col border-r border-gray-700/50 bg-[#111b21]">
                
                {/* Header Sidebar */}
                <div className="flex flex-col bg-[#202c33]">
                    <div className="flex items-center justify-between px-4 py-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold uppercase">
                                {auth.user.name.charAt(0)}
                            </div>
                            <span className="text-sm font-medium tracking-wide">{auth.user.name}</span>
                        </div>
                        <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-red-500 transition">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                            </svg>
                        </button>
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex px-2 pb-2 gap-2">
                        <button 
                            onClick={() => setActiveTab("chat")}
                            className={`flex-1 py-2 text-[10px] font-black rounded-md tracking-widest transition ${activeTab === 'chat' ? 'bg-[#374248] text-indigo-400' : 'text-gray-500 hover:bg-white/5'}`}
                        >
                            MESSAGES
                        </button>
                        <button 
                            onClick={() => setActiveTab("knowledge")}
                            className={`flex-1 py-2 text-[10px] font-black rounded-md tracking-widest transition ${activeTab === 'knowledge' ? 'bg-[#374248] text-indigo-400' : 'text-gray-500 hover:bg-white/5'}`}
                        >
                            AI KNOWLEDGE
                        </button>
                    </div>
                </div>

                {/* Sidebar Scroll Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {activeTab === "chat" ? (
                        <>
                            <div className="p-3">
                                <div className="bg-[#202c33] flex items-center px-4 py-2 rounded-xl">
                                    <input 
                                        type="text" 
                                        placeholder="Cari nomor chat..." 
                                        className="w-full bg-transparent border-none text-sm focus:ring-0 placeholder-gray-600 text-[#e9edef]"
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>
                            {filteredContacts.map((num) => (
                                <div 
                                    key={num} 
                                    onClick={() => setSelectedContact(num)}
                                    className={`p-4 cursor-pointer border-b border-gray-800/50 transition ${selectedContact === num ? "bg-[#2a3942]" : "hover:bg-[#202c33]"}`}
                                >
                                    <div className="font-medium text-sm text-[#e9edef]">{num}</div>
                                    <p className="text-xs text-gray-500 truncate">
                                        {chats.find(c => c.sender === num)?.message}
                                    </p>
                                </div>
                            ))}
                        </>
                    ) : (
                        <div className="p-6 space-y-4">
                            <div className="bg-[#202c33] p-5 rounded-2xl border border-gray-700/50 shadow-2xl">
                                <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Knowledge Active</p>
                                <p className="text-3xl font-bold text-white">{initialKnowledge?.length || 0} <span className="text-sm font-normal text-gray-500 ml-1">URLs</span></p>
                            </div>
                            <div className="p-4 border-l-2 border-indigo-500 bg-indigo-500/5 rounded-r-xl">
                                <p className="text-[11px] text-gray-400 leading-relaxed italic">
                                    Data di tab sebelah kanan digunakan AI untuk membalas pesan secara otomatis.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- MAIN AREA CONTENT --- */}
            <div className="flex-1 flex flex-col bg-[#0b141a] relative border-l border-gray-700/30">
                {activeTab === "chat" ? (
                    selectedContact ? (
                        <>
                            {/* Chat Header */}
                            <div className="h-[60px] flex items-center px-4 bg-[#202c33] border-b border-gray-800/50">
                                <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center mr-3 font-bold text-xs">
                                    {selectedContact.slice(-2)}
                                </div>
                                <h3 className="font-bold text-sm tracking-wide">{selectedContact}</h3>
                            </div>

                            {/* Messages List Area */}
                            <div 
                                ref={scrollRef} 
                                className="flex-1 overflow-y-auto p-6 space-y-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat"
                                style={{ backgroundBlendMode: "overlay", backgroundColor: '#0b141a'}}
                            >
                                {[...filteredMessages].reverse().map((chat) => (
                                    <div key={chat.id} className={`flex w-full ${chat.is_from_me ? "justify-end" : "justify-start"}`}>
                                        <div className={`p-2.5 px-3 shadow-md max-w-[75%] rounded-xl ${chat.is_from_me ? "bg-[#005c4b] rounded-tr-none text-[#e9edef]" : "bg-[#202c33] rounded-tl-none text-[#e9edef]"}`}>
                                            <p className="text-[14.5px] leading-tight whitespace-pre-wrap">{chat.message}</p>
                                            <div className="text-[9px] text-right mt-1.5 opacity-40 font-bold uppercase">
                                                {new Date(chat.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* --- INPUT PESAN MANUAL --- */}
                            <form onSubmit={handleSend} className="p-3 bg-[#202c33] flex items-center gap-2">
                                <input 
                                    type="text" 
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder="Ketik balasan manual di sini..." 
                                    className="flex-1 bg-[#2a3942] border-none rounded-lg py-2.5 px-4 text-sm focus:ring-1 focus:ring-indigo-500 placeholder-gray-500 text-white" 
                                />
                                <button type="submit" className="p-2 text-indigo-400 hover:scale-110 transition active:scale-95">
                                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                        <path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"></path>
                                    </svg>
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center opacity-20">
                            <div className="w-24 h-24 mb-4">
                                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"></path></svg>
                            </div>
                            <h2 className="text-xl font-light">Pilih chat untuk membalas secara manual</h2>
                        </div>
                    )
                ) : (
                    /* --- AI KNOWLEDGE MANAGEMENT VIEW --- */
                    <div className="flex-1 p-10 overflow-y-auto bg-[#0b141a]">
                        <div className="max-w-5xl mx-auto">
                            <div className="flex justify-between items-end mb-10 border-b border-gray-800 pb-8">
                                <div>
                                    <h1 className="text-3xl font-black text-white">Knowledge Center</h1>
                                    <p className="text-gray-500 text-sm mt-2">Daftar website yang datanya diserap AI untuk Hayy Tour.</p>
                                </div>
                                <form onSubmit={handleSyncAI} className="flex gap-2">
                                    <input 
                                        type="url" 
                                        value={aiUrl}
                                        onChange={(e) => setAiUrl(e.target.value)}
                                        placeholder="Input URL Website Baru..." 
                                        className="w-80 bg-[#111b21] border-gray-700 rounded-xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-indigo-500 text-white"
                                        required
                                    />
                                    <button 
                                        disabled={isSyncing}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 rounded-xl font-bold text-xs transition disabled:opacity-50"
                                    >
                                        {isSyncing ? "SYNCING..." : "ADD SOURCE"}
                                    </button>
                                </form>
                            </div>

                            <div className="bg-[#111b21] rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-[#202c33] text-[10px] uppercase font-bold tracking-widest text-gray-500">
                                            <th className="px-6 py-5">#</th>
                                            <th className="px-6 py-5">Source URL</th>
                                            <th className="px-6 py-5">Size</th>
                                            <th className="px-6 py-5 text-right">Last Sync</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800/50">
                                        {initialKnowledge?.length > 0 ? initialKnowledge.map((item, index) => (
                                            <tr key={item.id} className="hover:bg-white/5 transition duration-200">
                                                <td className="px-6 py-4 text-gray-700 text-xs">{index + 1}</td>
                                                <td className="px-6 py-4">
                                                    <div className="text-indigo-400 text-sm font-medium truncate max-w-lg">{item.source_url}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-[10px] bg-[#2a3942] text-gray-400 px-2 py-1 rounded-md font-mono">
                                                        {item.content.length.toLocaleString()} Chars
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right text-xs text-gray-600">
                                                    {new Date(item.created_at).toLocaleDateString('id-ID')}
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="4" className="px-6 py-20 text-center text-gray-700 italic">Belum ada data URL yang diserap.</td></tr>
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