<?php

namespace App\Http\Controllers;

use App\Models\Chat;
use App\Models\Setting;
use App\Models\AiKnowledge;
use App\Events\NewChatEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

class WebhookController extends Controller
{
    /**
     * Handle Webhook Masuk dari Fonnte (Chat dari Pelanggan)
     */
    public function handle(Request $request)
    {
        $message = $request->input('message');
        $sender = $request->input('sender');

        // 1. LOGIKA ANTI-DUPLIKAT (Hanya Satu Kali di Atas)
        // Mencegah pesan yang sama diproses dua kali dalam 60 detik
        $lockKey = 'webhook_lock_' . $sender . '_' . md5($message);
        if (Cache::has($lockKey)) {
            return response()->json(['status' => 'ignored']);
        }
        Cache::put($lockKey, true, 60);

        try {
            // 2. SIMPAN CHAT PELANGGAN KE DATABASE
            $chatIn = Chat::create([
                'sender'     => $sender,
                'receiver'   => 'Me',
                'message'    => $message,
                'is_from_me' => false,
                'status'     => 'read' // Chat masuk otomatis dianggap 'read' di dashboard kita
            ]);

            // Kirim ke Dashboard secara Real-time
            broadcast(new NewChatEvent($chatIn));

            // 3. CEK MODE BALASAN (Manual atau AI)
            $mode = Setting::where('key', 'reply_mode')->value('value') ?? 'manual';
            Log::info("Webhook Masuk dari $sender. Mode: $mode");

            if ($mode === 'manual') {
                return response()->json(['status' => 'manual_mode_active']);
            }

            // 4. PROSES AI GEMINI (Hanya jika mode AI)
            $aiReply = $this->askGemini($message);

            // 5. KIRIM BALASAN KE WHATSAPP VIA FONNTE
            $response = Http::withHeaders([
                'Authorization' => env('FONNTE_TOKEN')
            ])->post('https://api.fonnte.com/send', [
                'target'  => $sender,
                'message' => $aiReply,
            ]);

            $fonnteId = null;
            if ($response->successful()) {
                $resData = $response->json();
                // Ambil ID internal Fonnte untuk tracking status nanti
                $fonnteId = $resData['id'][0] ?? null;
            } else {
                Log::error("Fonnte Gagal Kirim: " . $response->body());
            }

            // 6. SIMPAN BALASAN AI KE DATABASE
            $chatOut = Chat::create([
                'sender'     => $sender,
                'receiver'   => 'Me',
                'message'    => $aiReply,
                'is_from_me' => true,
                'id_fonnte'  => $fonnteId,
                'status'     => 'sent' // Default sent (centang satu abu-abu)
            ]);

            // Kirim balasan AI ke Dashboard secara Real-time
            broadcast(new NewChatEvent($chatOut));

            return response()->json(['status' => 'success', 'reply' => $aiReply]);
        } catch (\Exception $e) {
            Log::error("Error di Webhook Handle: " . $e->getMessage());
            return response()->json(['status' => 'error', 'message' => $e->getMessage()], 500);
        }
    }

    /**
     * Handle Status Pesan (Centang Biru) dari Fonnte
     */
    public function handleStatus(Request $request)
    {
        $idFonnte = $request->input('id');      // ID dari Fonnte
        $stateId  = $request->input('stateid'); // ID dari WhatsApp
        $status   = $request->input('state') ?? $request->input('status');

        if (!$status) return response()->json(['error' => 'No status'], 400);

        // Cari chat di database
        $chat = Chat::where(function ($query) use ($stateId, $idFonnte) {
            if ($stateId) $query->where('stateid', $stateId);
            if ($idFonnte) $query->orWhere('id_fonnte', $idFonnte);
        })->first();

        if ($chat) {
            // UPDATE STATUS DAN SIMPAN STATEID (Penting!)
            $updateData = ['status' => $status];
            if ($stateId) {
                $updateData['stateid'] = $stateId;
            }

            $chat->update($updateData);

            // Kirim sinyal ke Dashboard biar centang berubah BIRU
            broadcast(new NewChatEvent($chat));

            Log::info("Status Pesan ID {$chat->id} diupdate jadi: {$status}");
            return response()->json(['status' => 'updated']);
        }

        Log::warning("Status dicuekin karena data gak ketemu. StateID: $stateId, FonnteID: $idFonnte");
        return response()->json(['status' => 'not_found'], 404);
    }

    private function askGemini($userQuestion)
    {
        $apiKey = env('GEMINI_API_KEY');
        $allKnowledge = AiKnowledge::all();
        $knowledgeText = $allKnowledge->isEmpty() ? "Belum ada data." : $allKnowledge->pluck('content')->implode("\n");

        $prompt = "Kamu Rifai admin Hayy Tour. Jawab santai berdasarkan data ini:\n$knowledgeText\n\nPertanyaan: $userQuestion";

        return retry(2, function () use ($apiKey, $prompt) {
            // --- PERBAIKAN NAMA MODEL DI SINI ---
            // Ganti gemini-2.5-flash-lite jadi gemini-1.5-flash
            $response = Http::withHeaders(['Content-Type' => 'application/json'])
                ->withoutVerifying()
                ->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" . $apiKey, [
                    'contents' => [['parts' => [['text' => $prompt]]]]
                ]);

            if ($response->failed()) {
                // Log biar kamu tau error aslinya apa (404, 429, dll)
                Log::error("Gemini API Gagal: " . $response->body());
                return "Maaf kak, Rifai lagi ada gangguan koneksi ke pusat. Boleh tanya lagi?";
            }

            $data = $response->json();
            return $data['candidates'][0]['content']['parts'][0]['text'] ?? "Aduh, Rifai agak bingung nih. Bisa diulang?";
        }, 1000);
    }

    /**
     * Logika Tanya ke Gemini AI
     */
    // private function askGemini($userQuestion)
    // {
    //     $apiKey = env('GEMINI_API_KEY');
    //     $allKnowledge = AiKnowledge::all();

    //     // Gabungkan semua data tour menjadi satu konteks teks
    //     $knowledgeText = $allKnowledge->isEmpty() 
    //         ? "Belum ada data paket tour." 
    //         : $allKnowledge->pluck('content')->implode("\n");

    //     $prompt = "Kamu adalah Rifai, admin WhatsApp Hayy Tour. 
    //                Jawablah dengan santai, ramah, dan gunakan bahasa manusia (bukan robot).
    //                Gunakan data berikut untuk menjawab: \n$knowledgeText\n
    //                Pertanyaan user: $userQuestion";

    //     try {
    //         $response = Http::withHeaders(['Content-Type' => 'application/json'])
    //             ->withoutVerifying()
    //             ->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" . $apiKey, [
    //                 'contents' => [['parts' => [['text' => $prompt]]]]
    //             ]);

    //         if ($response->failed()) {
    //             Log::error("Gemini Gagal: " . $response->body());
    //             return "Aduh maaf kak, sistem lagi agak lemot. Boleh tanya lagi sebentar lagi? 🙏";
    //         }

    //         $data = $response->json();
    //         return $data['candidates'][0]['content']['parts'][0]['text'] ?? "Waduh, Rifai bingung jawabnya. Bisa diulang kak?";
    //     } catch (\Exception $e) {
    //         return "Maaf ya kak, lagi ada gangguan teknis. Sebentar ya!";
    //     }
    // }

    /**
     * Kirim Pesan Manual dari Dashboard (CS)
     */
    public function sendMessage(Request $request)
    {
        $response = Http::withHeaders(['Authorization' => env('FONNTE_TOKEN')])
            ->post('https://api.fonnte.com/send', [
                'target'  => $request->receiver,
                'message' => $request->message,
            ]);

        if ($response->successful()) {
            $resData = $response->json();
            $chat = Chat::create([
                'sender'     => $request->receiver,
                'receiver'   => 'Me',
                'message'    => $request->message,
                'is_from_me' => true,
                'id_fonnte'  => $resData['id'][0] ?? null,
                'status'     => 'sent'
            ]);
            broadcast(new NewChatEvent($chat))->toOthers();
            return response()->json($chat);
        }
        return response()->json(['error' => 'Gagal kirim'], 500);
    }

    /**
     * Sinkronisasi Data Website ke Database (Knowledge AI)
     */
    public function crawlWebsite(Request $request)
    {
        $url = $request->url;
        try {
            $response = Http::withHeaders([
                'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ])->withoutVerifying()->timeout(30)->get($url);

            if ($response->failed()) return response()->json(['error' => 'Website menolak akses.'], 500);

            $html = $response->body();
            $cleanText = strip_tags($html); // Versi simpel pembersihan HTML
            $cleanText = preg_replace('/\s+/', ' ', $cleanText);

            AiKnowledge::updateOrCreate(['source_url' => $url], ['content' => trim($cleanText)]);
            return response()->json(['message' => 'Data diserap!']);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * Hapus Knowledge Base
     */
    public function deleteKnowledge($id)
    {
        try {
            AiKnowledge::findOrFail($id)->delete();
            // Gunakan redirect back agar Inertia mengupdate tabel secara otomatis
            return back()->with('message', 'Data dihapus');
        } catch (\Exception $e) {
            return back()->withErrors(['error' => 'Gagal hapus']);
        }
    }

    /**
     * Update Mode Balasan (Manual/AI)
     */
    public function updateMode(Request $request)
    {
        try {
            Setting::updateOrCreate(['key' => 'reply_mode'], ['value' => $request->mode]);
            return response()->json(['status' => 'success', 'mode' => $request->mode]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}