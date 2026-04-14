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

        // --- ANTI DUPLIKAT (PAGAR WEBHOOK) ---
        // Buat kunci unik berdasarkan nomor + isi pesan
        $lockKey = 'webhook_lock_' . $sender . '_' . md5($message);

        if (Cache::has($lockKey)) {
            return response()->json(['status' => 'ignored_duplicate']);
        }

        // Kunci selama 60 detik agar Fonnte tidak kirim ulang pesan yang sama
        Cache::put($lockKey, true, 60);

        // 1. Simpan chat masuk (Customer)
        $chatIn = Chat::create([
            'sender' => $sender,
            'receiver' => 'Me',
            'message' => $message,
            'is_from_me' => false
        ]);
        broadcast(new NewChatEvent($chatIn));

        // 2. Minta jawaban dari Gemini
        $aiReply = $this->askGemini($message);
        $delay = strlen($aiReply) / 10;
        sleep(min($delay, 5));

        // 3. Kirim balik ke WhatsApp lewat Fonnte
        Http::withHeaders([
            'Authorization' => env('FONNTE_TOKEN'),
        ])->post('https://api.fonnte.com/send', [
            'target' => $sender,
            'message' => $aiReply,
        ]);

        // 4. Simpan balasan AI ke Database
        $chatOut = Chat::create([
            'sender' => $sender,
            'receiver' => 'Me',
            'message' => $aiReply,
            'is_from_me' => true
        ]);
        broadcast(new NewChatEvent($chatOut));

        return response()->json(['status' => 'success']);
    }

    public function sendMessage(Request $request)
    {
        $request->validate([
            'receiver' => 'required',
            'message' => 'required',
            'file' => 'nullable|file|mimes:jpg,jpeg,png,pdf,doc,docx|max:2048',
        ]);

        $fileUrl = null;

        // Logika Simpan File ke Storage
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $fileName = time() . '_' . $file->getClientOriginalName();
            // Simpan ke storage/app/public/uploads
            $path = $file->storeAs('uploads', $fileName, 'public');

            // Buat URL lengkap (pake alamat Ngrok dari .env)
            $fileUrl = asset('storage/' . $path);
        }
        // 1. Kirim ke API Fonnte
        $response = Http::withHeaders([
            'Authorization' => env('FONNTE_TOKEN'),
        ])->post('https://api.fonnte.com/send', [
            'target' => $request->receiver,
            'message' => $request->message ?? '',
            'url' => $fileUrl,
        ]);

        if ($response->successful()) {
            // 2. Simpan ke Database sebagai "Pesan Terkirim"
            $chat = Chat::create([
                'sender' => $request->receiver, // kita simpan targetnya sebagai sender biar masuk list chat yang sama
                'receiver' => 'Me',
                'message' => $request->message ?? ($request->hasFile('file') ? '[Media File]' : ''),
                'url' => $fileUrl,
                'is_from_me' => true, // Tanda kalau ini dari admin
            ]);

            // 3. Broadcast biar langsung muncul di layar (Real-time)
            broadcast(new NewChatEvent($chat))->toOthers();

            return response()->json($chat);
        }

        return response()->json(['error' => 'Gagal kirim pesan'], 500);
    }

    public function crawlWebsite(Request $request)
    {
        $url = $request->url;

        // Ambil HTML
        $html = file_get_contents($url);

        // Gunakan Regex untuk buang Script dan Style agar data bersih
        $search = [
            '@<script[^>]*?>.*?</script>@si', // Buang JS
'@<style[^>]*?>.*?</style>@si', // Buang CSS
  '@<[^>]*?>@si', // Buang HTML tags
    '@
    <![\s\S]*?--[ \t\n\r]*>@'        // Buang komentar HTML
        ];

        $cleanText = preg_replace($search, ' ', $html);
        $cleanText = preg_replace('/\s+/', ' ', $cleanText); // Rapikan spasi berlebih

        // Gunakan model tanpa backslash karena sudah di-import di atas
        AiKnowledge::updateOrCreate(
            ['source_url' => $url],
            ['content' => trim($cleanText)]
        );

        return response()->json(['message' => 'Data website berhasil diserap dengan bersih!']);
    }

    private function askGemini($userQuestion)
    {
        $apiKey = env('GEMINI_API_KEY');
        $knowledge = AiKnowledge::latest()->first()?->content ?? "Belum ada data.";

        $prompt = "Kamu adalah Admin WA Hayy Tour bernama Rifai. 
           ATURAN CHAT:
           1. Jangan terlalu formal, gunakan bahasa santai tapi sopan (pake 'halo kak/gan' atau langsung jawab).
           2. JANGAN mengulang-ulang kalimat pembuka yang sama di setiap pesan.
           3. Jawab langsung ke intinya, jangan bertele-tele.
           4. Gunakan data berikut sebagai referensi saja, jangan dibaca kaku: 
           
           DATA: $knowledge
           
           PERTANYAAN USER: $userQuestion";

        return retry(2, function () use ($apiKey, $prompt) {
            // Gunakan Gemini 2.0 Flash (Biasanya Limitnya lebih longgar di Free Tier)
            $response = Http::withHeaders(['Content-Type' => 'application/json'])
                ->withoutVerifying()
                ->timeout(40)
                ->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" . $apiKey, [
                    'contents' => [['parts' => [['text' => $prompt]]]]
                ]);

            if ($response->failed()) {
                if ($response->status() == 429) {
                    return "Maaf ya, saya lagi melayani banyak tamu. Boleh tanya lagi sebentar lagi?";
                }
                throw new \Exception("Gemini Error");
            }

            $data = $response->json();
            return $data['candidates'][0]['content']['parts'][0]['text'] ?? "Maaf, saya belum tahu jawabannya.";
        }, 1000);
    }

    public function listModels()
    {
        $apiKey = env('GEMINI_API_KEY');
        $response = Http::withoutVerifying()
            ->get("https://generativelanguage.googleapis.com/v1beta/models?key=" . $apiKey);

        return $response->json();
    }
}