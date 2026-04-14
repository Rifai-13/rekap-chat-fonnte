<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Chat;
use App\Events\NewChatEvent;
use Illuminate\Support\Facades\Http;
use App\Models\AiKnowledge;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Cache;

class WebhookController extends Controller
{
    public function handle(Request $request)
    {
        $message = $request->input('message');
        $sender = $request->input('sender');

        $lockKey = 'webhook_lock_' . $sender . '_' . md5($message);
        if (Cache::has($lockKey)) return response()->json(['status' => 'ignored']);
        Cache::put($lockKey, true, 60);

        // 1. Simpan chat pelanggan (Langsung Biru)
        $chatIn = Chat::create([
            'sender' => $sender,
            'receiver' => 'Me',
            'message' => $message,
            'is_from_me' => false,
            'status' => 'read'
        ]);
        broadcast(new NewChatEvent($chatIn));

        // 2. Tanya AI
        $aiReply = $this->askGemini($message);

        // 3. Kirim ke Fonnte
        $response = Http::withHeaders(['Authorization' => env('FONNTE_TOKEN')])
            ->post('https://api.fonnte.com/send', [
                'target' => $sender,
                'message' => $aiReply,
            ]);

        $fonnteId = null;
        if ($response->successful()) {
            $resData = $response->json();
            $fonnteId = $resData['id'][0] ?? null;
        }

        // 4. Simpan balasan AI
        $chatOut = Chat::create([
            'sender' => $sender,
            'receiver' => 'Me',
            'message' => $aiReply,
            'is_from_me' => true,
            'id_fonnte' => $fonnteId,
            'status' => 'sent'
        ]);
        broadcast(new NewChatEvent($chatOut));

        return response()->json(['status' => 'success']);
    }

    public function sendMessage(Request $request)
    {
        $response = Http::withHeaders(['Authorization' => env('FONNTE_TOKEN')])
            ->post('https://api.fonnte.com/send', [
                'target' => $request->receiver,
                'message' => $request->message,
            ]);

        if ($response->successful()) {
            $resData = $response->json();
            $chat = Chat::create([
                'sender' => $request->receiver,
                'receiver' => 'Me',
                'message' => $request->message,
                'is_from_me' => true,
                'id_fonnte' => $resData['id'][0] ?? null,
                'status' => 'sent'
            ]);
            broadcast(new NewChatEvent($chat))->toOthers();
            return response()->json($chat);
        }
        return response()->json(['error' => 'Gagal'], 500);
    }

    public function handleStatus(Request $request)
    {
        Log::info("Fonnte Webhook Status Received:", $request->all());

        // Fonnte kirim 'id' (internal) ATAU 'stateid' (whatsapp)
        $idFonnte = $request->input('id');
        $stateId = $request->input('stateid');

        // Fonnte kirim status lewat 'state', kadang lewat 'status'
        $status = $request->input('state') ?? $request->input('status');

        if (empty($status)) {
            return response()->json(['message' => 'Status is empty'], 400);
        }

        // Cari berdasarkan id_fonnte DULU, kalau nggak ketemu cari berdasarkan stateid
        $chat = null;
        if ($idFonnte) {
            $chat = Chat::where('id_fonnte', $idFonnte)->first();
        }

        if (!$chat && $stateId) {
            $chat = Chat::where('stateid', $stateId)->first();
        }

        if ($chat) {
            $updateData = ['status' => $status];

            // Kalau di webhook ada stateid tapi di DB belum ada, kita simpan
            if ($stateId && empty($chat->stateid)) {
                $updateData['stateid'] = $stateId;
            }

            $chat->update($updateData);
            broadcast(new NewChatEvent($chat));
            return response()->json(['status' => 'updated']);
        }

        return response()->json(['status' => 'not_found'], 404);
    }

    private function askGemini($userQuestion)
    {
        $apiKey = env('GEMINI_API_KEY');
        $allKnowledge = AiKnowledge::all();

        if ($allKnowledge->isEmpty()) {
            $knowledgeText = "Belum ada data tour tersedia.";
        } else {
            // Gabungkan semua konten dari semua URL menjadi satu teks panjang
            $knowledgeText = "";
            foreach ($allKnowledge as $item) {
                $knowledgeText .= "\n--- SUMBER DATA: " . $item->source_url . " ---\n";
                $knowledgeText .= $item->content . "\n";
            }
        }

        $prompt = "
Kamu adalah Rifai, admin WhatsApp dari Hayy Tour yang asik, ramah, dan sangat membantu. 
Jamaah itu keluarga buat kita, jadi bicaralah seperti teman tapi tetap hormat.

ATURAN GAYA BICARA:
1. JANGAN pernah mulai pesan dengan 'Halo kak' di SETIAP balasan. Kalau percakapan sudah jalan, langsung jawab saja.
2. Gunakan partikel bahasa santai Indonesia seperti 'nih', 'aja', 'kok', 'sih', 'ya'.
3. Berikan jawaban yang 'proaktif'. Kalau jamaah tanya paket, jangan cuma list, tapi kasih rekomendasi atau tanya balik (misal: 'Mau berangkat sendirian atau bareng keluarga nih?').
4. Gunakan EMOJI secara natural, jangan berlebihan.
5. Jika data tidak ada, jangan bilang 'Data tidak ditemukan'. Bilang aja 'Wah kalau yang itu Rifai belum update infonya nih, sebentar ya saya tanyain tim dulu'.

DATA REFERENSI TOUR KITA:
$knowledgeText

PERTANYAAN JEMAAH: $userQuestion
";

        return retry(2, function () use ($apiKey, $prompt) {
            $response = Http::withHeaders(['Content-Type' => 'application/json'])
                ->withoutVerifying()
                ->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" . $apiKey, [
                    'contents' => [['parts' => [['text' => $prompt]]]]
                ]);

            $data = $response->json();
            return $data['candidates'][0]['content']['parts'][0]['text'] ?? "Maaf, saya sedang gangguan teknis.";
        }, 1000);
    }

    public function crawlWebsite(Request $request)
    {
        $url = $request->url;

        try {
            $response = Http::withHeaders([
                'User-Agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept' => 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            ])
                ->withoutVerifying()
                ->timeout(30)
                ->get($url);

            if ($response->failed()) {
                Log::error("Scraping Failed for $url. Status: " . $response->status());
                return response()->json(['error' => 'Website tersebut memblokir akses otomatis.'], 500);
            }

            $html = $response->body();

            // Regex pembersihan HTML (Tetap sama kyak sebelumnya)
            $search = [
                '@<script[^>]*?>.*?</script>@si',
'@<style[^>]*?>.*?</style>@si',
  '@<[^>]*?>@si',
    '@
    <![\s\S]*?--[ \t\n\r]*>@'
            ];

            $cleanText = preg_replace($search, ' ', $html);
            $cleanText = preg_replace('/\s+/', ' ', $cleanText); // Rapikan spasi

            // Simpan atau update data ke database
            AiKnowledge::updateOrCreate(
                ['source_url' => $url],
                ['content' => trim($cleanText)]
            );

            return response()->json(['message' => 'Data website berhasil diserap!']);
        } catch (\Exception $e) {
            Log::error("Crawl Error: " . $e->getMessage());
            return response()->json(['error' => 'Gagal menghubungi server website.'], 500);
        }
    }

    public function deleteKnowledge($id)
    {
        try {
            // Log untuk memastikan ID yang dikirim beneran sampai ke sini
            Log::info("Mencoba menghapus knowledge ID: " . $id);

            $knowledge = AiKnowledge::find($id);

            if (!$knowledge) {
                Log::error("Data tidak ditemukan untuk ID: " . $id);
                return response()->json(['error' => 'Data tidak ditemukan'], 404);
            }

            $knowledge->delete();
            Log::info("Data ID $id berhasil dihapus.");

            return response()->json(['message' => 'Data berhasil dihapus']);
        } catch (\Exception $e) {
            Log::error("Gagal hapus data: " . $e->getMessage());
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}