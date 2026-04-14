import { Head, router } from "@inertiajs/react";
import { useEffect, useState, useRef } from "react";
import axios from "axios"; // Pastikan axios terimport

export default function Dashboard({ auth, initialChats }) {
    const [chats, setChats] = useState(initialChats);
    const [selectedContact, setSelectedContact] = useState(null);
    const scrollRef = useRef(null);
    const [searchQuery, setSearchQuery] = useState("");
    
    // --- STATE BARU UNTUK AI ---
    const [aiUrl, setAiUrl] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);
    const [showAiPanel, setShowAiPanel] = useState(false);

    const filteredMessages = selectedContact
        ? chats.filter((c) => c.sender === selectedContact)
        : [];

    const contacts = [...new Set(chats.map((c) => c.sender))];

    useEffect(() => {
        window.Echo.channel("chat-channel").listen("NewChatEvent", (e) => {
            setChats((prev) => [e.chat, ...prev]);
        });
        return () => window.Echo.leave("chat-channel");
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [filteredMessages]);

    const [newMessage, setNewMessage] = useState("");

    const allContects = [...new Set(chats.map((c) => c.sender))];
    const filteredContects = allContects.filter(num => num.toLowerCase().includes(searchQuery.toLowerCase()));

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
            alert("Gagal kirim pesan!");
        }
    };

    // --- FUNCTION UNTUK SYNC DATA AI ---
    const handleSyncAI = async (e) => {
        e.preventDefault();
        if (!aiUrl.trim()) return;

        setIsSyncing(true);
        try {
            await axios.post("/api/ai/sync-knowledge", { url: aiUrl });
            alert("Berhasil! AI sekarang sudah mempelajari data dari: " + aiUrl);
            setAiUrl("");
            setShowAiPanel(false);
        } catch (err) {
            alert("Gagal mengambil data website. Pastikan URL benar.");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleLogout = () => {
        router.post(route("logout"));
    };

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-100 dark:bg-[#111b21]">
            <Head title="WhatsApp Recap AI" />

            {/* SIDEBAR LEFT */}
            <div className="w-[30%] min-w-[300px] flex flex-col border-r border-gray-300 dark:border-gray-700 bg-white dark:bg-[#111b21]">
                
                {/* Header Sidebar */}
                <div className="h-[60px] flex items-center justify-between px-4 bg-gray-100 dark:bg-[#202c33]">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-full bg-indigo-600 flex-shrink-0 flex items-center justify-center text-white font-bold shadow-md">
                            {auth.user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="dark:text-[#e9edef] font-medium text-sm truncate leading-none">
                                {auth.user.name}
                            </span>
                            <span className="text-[11px] text-green-500 font-medium">AI Active</span>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {/* TOMBOL TOGGLE AI MENU */}
                        <button 
                            onClick={() => setShowAiPanel(!showAiPanel)}
                            className={`p-2 rounded-full transition ${showAiPanel ? 'text-indigo-500 bg-white/10' : 'text-gray-500 hover:bg-white/10'}`}
                            title="Konfigurasi AI"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                            </svg>
                        </button>

                        <button onClick={handleLogout} className="p-2 text-gray-500 hover:text-red-500 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* --- PANEL AI (MUNCUL JIKA DIKLIK) --- */}
                {showAiPanel && (
                    <div className="p-4 bg-indigo-50 dark:bg-[#1a2329] border-b border-indigo-100 dark:border-gray-700 animate-in fade-in slide-in-from-top-2">
                        <label className="block text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase mb-2">
                            AI Knowledge Sync
                        </label>
                        <form onSubmit={handleSyncAI} className="flex gap-2">
                            <input
                                type="url"
                                placeholder="https://website-tour.id"
                                value={aiUrl}
                                onChange={(e) => setAiUrl(e.target.value)}
                                className="flex-1 bg-white dark:bg-[#2a3942] border-none rounded-md text-sm py-1.5 focus:ring-1 focus:ring-indigo-500 dark:text-white"
                                required
                            />
                            <button
                                type="submit"
                                disabled={isSyncing}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-xs font-medium transition disabled:opacity-50"
                            >
                                {isSyncing ? "Syncing..." : "Sync AI"}
                            </button>
                        </form>
                        <p className="text-[10px] text-gray-500 mt-2">AI akan mempelajari teks dari URL ini untuk membalas chat secara otomatis.</p>
                    </div>
                )}

                {/* Search Bar ala WA Web */}
                <div className="p-2 bg-white dark:bg-[#111b21]">
                    <div className="bg-gray-100 dark:bg-[#202c33] flex items-center px-3 py-1.5 rounded-lg">
                        <svg viewBox="0 0 24 24" width="16" height="16" className="text-gray-500">
                            <path fill="currentColor" d="M15.009 13.805h-.636l-.22-.219a5.184 5.184 0 0 0 1.256-3.386 5.207 5.207 0 1 0-5.207 5.208 5.183 5.183 0 0 0 3.385-1.255l.221.22v.635l4.004 3.999 1.194-1.195-3.997-4.007zm-4.808 0a3.605 3.605 0 1 1 0-7.21 3.605 3.605 0 0 1 0 7.21z"></path>
                        </svg>
                        <input
                            type="text"
                            placeholder="Cari nomor atau pesan..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-transparent border-none focus:ring-0 text-sm w-full dark:text-white placeholder-gray-500"
                        />
                    </div>
                </div>

                {/* List Kontak */}
                <div className="overflow-y-auto flex-1 custom-scrollbar">
                    {filteredContects.length > 0 ? (
                        filteredContects.map((num) => (
                            <div
                                key={num}
                                onClick={() => setSelectedContact(num)}
                                className={`flex items-center gap-3 p-4 cursor-pointer border-b dark:border-gray-800 transition ${selectedContact === num ? "bg-gray-200 dark:bg-[#2a3942]" : "hover:bg-gray-100 dark:hover:bg-[#202c33]"}`}
                            >
                                <div className="w-12 h-12 rounded-full bg-gray-400 flex-shrink-0 flex items-center justify-center text-white">
                                    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path>
                                    </svg>
                                </div>
                                <div className="flex-1 overflow-hidden">
                                    <h3 className="dark:text-white font-medium truncate">{num}</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {chats.find((c) => c.sender === num)?.message}
                                    </p>
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="p-4 text-center text-gray-500 text-sm">Belum ada chat masuk...</p>
                    )}
                </div>
            </div>

            {/* CHAT AREA RIGHT */}
            <div className="flex-1 flex flex-col bg-[#efeae2] dark:bg-[#0b141a] relative">
                {selectedContact ? (
                    <>
                        {/* Header Chat */}
                        <div className="h-[60px] flex items-center px-4 bg-gray-100 dark:bg-[#202c33] border-l border-gray-300 dark:border-gray-700">
                            <h3 className="dark:text-white font-bold">{selectedContact}</h3>
                        </div>

                        {/* Area Pesan */}
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat opacity-90"
                            style={{ backgroundBlendMode: "overlay", backgroundColor: '#0b141a'}}
                        >
                            {[...filteredMessages].reverse().map((chat) => (
                                <div key={chat.id} className={`flex w-full ${chat.is_from_me ? "justify-end" : "justify-start"}`}>
                                    <div className={`relative p-2 px-3 shadow-sm max-w-[70%] border dark:border-none ${chat.is_from_me ? "bg-[#dcf8c6] dark:bg-[#005c4b] dark:text-[#e9edef] rounded-lg rounded-tr-none" : "bg-white dark:bg-[#202c33] dark:text-[#e9edef] rounded-lg rounded-tl-none border-gray-200"}`}>
                                        <p className="text-[14.5px] leading-tight pr-12 pb-1">{chat.message}</p>
                                        <span className="text-[10px] text-gray-500 dark:text-gray-400 absolute bottom-1 right-2 flex items-center gap-1">
                                            {new Date(chat.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                            {chat.is_from_me && (
                                                <svg viewBox="0 0 16 11" width="13" height="13" className="text-blue-400">
                                                    <path fill="currentColor" d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-3.51-3.13a.33.33 0 0 0-.478.01l-.503.527a.38.38 0 0 0 .007.535l4.196 3.738c.15.133.38.12.514-.03l6.545-7.722a.37.37 0 0 0-.054-.523zm-8.959 7.38L1.102 6.744a.374.374 0 0 0-.529.013L.05 7.298a.374.374 0 0 0 .012.529l4.912 4.31a.37.37 0 0 0 .523-.018l.854-.99a.37.37 0 0 0-.054-.523z"></path>
                                                </svg>
                                            )}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Input Area */}
                        <form onSubmit={handleSend} className="p-3 bg-gray-100 dark:bg-[#202c33] flex items-center gap-2">
                            <input
                                type="text"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Tulis pesan..."
                                className="flex-1 rounded-lg border-none py-2 px-4 dark:bg-[#2a3942] dark:text-white focus:ring-0 placeholder-gray-500 text-sm"
                            />
                            <button type="submit" className="p-2 text-indigo-500 dark:text-indigo-400 hover:scale-110 transition">
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                                    <path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"></path>
                                </svg>
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-10 bg-gray-100 dark:bg-[#222e35]">
                        <div className="w-64 h-64 bg-gray-200 dark:bg-[#2a3942] rounded-full mb-6 flex items-center justify-center opacity-20">
                            <svg viewBox="0 0 24 24" width="100" height="100" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"></path>
                            </svg>
                        </div>
                        <h2 className="text-2xl font-light text-gray-600 dark:text-[#e9edef] mb-2">WhatsApp Recap Web</h2>
                        <p className="text-gray-500 dark:text-[#8696a0] max-w-sm text-sm">Pilih percakapan di sebelah kiri untuk melihat rekap pesan secara real-time.</p>
                    </div>
                )}
            </div>
        </div>
    );
}