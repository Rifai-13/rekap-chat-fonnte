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
     * 1. HANDLE PESAN MASUK DARI CUSTOMER
     */
    public function handle(Request $request)
    {
        $message = $request->input('message');
        $sender = $request->input('sender');

        if (!$message || !$sender) return response()->json(['status' => false]);

        // Kunci 5 detik biar Fonnte gak spam request dobel
        $lockKey = 'webhook_lock_' . $sender . '_' . md5($message);
        if (!Cache::add($lockKey, true, 5)) {
            return response()->json(['status' => true]);
        }

        try {
            $chatIn = Chat::create([
                'sender'     => $sender,
                'receiver'   => 'Me',
                'message'    => $message,
                'is_from_me' => false,
                'status'     => 'unread'
            ]);

            broadcast(new NewChatEvent($chatIn));

            $mode = Setting::where('key', 'reply_mode')->value('value') ?? 'manual';

            // MODE AI: Balas Otomatis dengan Gemini AI
            if ($mode === 'ai') {
                dispatch(function () use ($message, $sender) {
                    try {
                        $aiReply = $this->askGemini($message);

                        $response = Http::withHeaders(['Authorization' => env('FONNTE_TOKEN')])
                            ->withoutVerifying()
                            ->post('https://api.fonnte.com/send', [
                                'target'  => $sender,
                                'message' => $aiReply,
                            ]);

                        if ($response->successful()) {
                            $resData = $response->json();
                            $fonnteId = is_array($resData['id']) ? $resData['id'][0] : ($resData['id'] ?? null);

                            $earlyStatus = Cache::pull('fonnte_status_' . $fonnteId);
                            $finalStatus = $earlyStatus ? $earlyStatus : 'sent';

                            $chatOut = Chat::create([
                                'sender'     => $sender,
                                'receiver'   => 'Me',
                                'message'    => $aiReply,
                                'is_from_me' => true,
                                'id_fonnte'  => $fonnteId,
                                'status'     => $finalStatus
                            ]);
                            broadcast(new NewChatEvent($chatOut));
                        }
                    } catch (\Exception $e) {
                        Log::error("AI Background Error: " . $e->getMessage());
                    }
                })->afterResponse();
            }

            return response()->json(['status' => true]);
        } catch (\Exception $e) {
            Log::error("Webhook Fatal: " . $e->getMessage());
            return response()->json(['status' => false]);
        }
    }

    /**
     * 2. MEMBACA PESAN (MENGIRIM CENTANG BIRU KE CUSTOMER)
     */
    public function markAsRead(Request $request)
    {
        $sender = $request->sender;
        Chat::where('sender', $sender)->where('is_from_me', false)->update(['status' => 'read']);

        dispatch(function () use ($sender) {
            try {
                Http::withHeaders(['Authorization' => env('FONNTE_TOKEN')])
                    ->withoutVerifying()
                    ->post('https://api.fonnte.com/read', ['target' => $sender]);
            } catch (\Exception $e) {
            }
        })->afterResponse();

        return response()->json(['status' => true]);
    }

    /**
     * 3. HANDLE STATUS PESAN (CENTANG 1, CENTANG 2 ABU, CENTANG 2 BIRU)
     */
    public function handleStatus(Request $request)
    {
        $idFonnte = $request->input('id');
        $status   = strtolower($request->input('status') ?? $request->input('state'));

        if (!$idFonnte || !$status) return response()->json(['status' => false]);

        $chat = Chat::where('id_fonnte', $idFonnte)->first();

        if ($chat) {
            $chat->update(['status' => $status]);
            broadcast(new NewChatEvent($chat));
        } else {
            Cache::put('fonnte_status_' . $idFonnte, $status, 60);
        }

        return response()->json(['status' => true]);
    }

    /**
     * 4. PROSES TANYA KE GEMINI AI
     */
    private function askGemini($userQuestion)
    {
        $apiKey = env('GEMINI_API_KEY');
        $knowledge = AiKnowledge::all()->pluck('content')->implode("\n");
        $prompt = "Kamu Rifai admin Hayy Tour. Jawab santai. PENTING: JANGAN pernah menggunakan karakter bintang (*) untuk teks tebal atau daftar. Gunakan tanda strip (-) untuk membuat list/daftar. Data:\n$knowledge\n\nPertanyaan: $userQuestion";

        $response = Http::withHeaders(['Content-Type' => 'application/json'])
            ->withoutVerifying()
            ->post("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=" . $apiKey, [
                'contents' => [['parts' => [['text' => $prompt]]]]
            ]);

        $aiReply = $response->json()['candidates'][0]['content']['parts'][0]['text'] ?? "Maaf bro, Rifai lagi sibuk.";

        // Bersihkan Bintang (Markdown)
        $aiReply = str_replace('**', '', $aiReply);
        $aiReply = str_replace('* ', '- ', $aiReply);
        $aiReply = str_replace('*', '', $aiReply);

        return trim($aiReply);
    }

    /**
     * 5. UBAH MODE (MANUAL / AI AUTO)
     */
    public function updateMode(Request $request)
    {
        Setting::updateOrCreate(['key' => 'reply_mode'], ['value' => $request->mode]);
        return response()->json(['status' => true]);
    }

    /**
     * 6. SERAP DATA DARI WEBSITE (CRAWLING)
     */
    public function crawlWebsite(Request $request)
    {
        try {
            $res = Http::withoutVerifying()->get($request->url);

            if ($res->failed()) {
                return response()->json(['error' => 'Gagal akses website'], 500);
            }

            $html = $res->body();
            $html = preg_replace('#<script(.*?)>(.*?)</script>#is', '', $html);
            $html = preg_replace('#<style(.*?)>(.*?)</style>#is', '', $html);

            $cleanText = strip_tags($html);
            $cleanText = preg_replace('/\s+/', ' ', $cleanText);

            AiKnowledge::updateOrCreate(
                ['source_url' => $request->url],
                ['content' => trim($cleanText)]
            );

            return response()->json(['message' => 'Data terserap bersih!']);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Terjadi kesalahan saat menyerap data'], 500);
        }
    }

    /**
     * 7. HAPUS KNOWLEDGE AI
     */
    public function deleteKnowledge($id)
    {
        try {
            AiKnowledge::findOrFail($id)->delete();
            return response()->json(['status' => true, 'message' => 'Berhasil dihapus']);
        } catch (\Exception $e) {
            Log::error("Gagal hapus knowledge: " . $e->getMessage());
            return response()->json(['status' => false, 'message' => 'Gagal'], 500);
        }
    }

    /**
     * 8. UPDATE / RESYNC KNOWLEDGE AI MANUAL
     */
    public function resyncKnowledge($id)
    {
        try {
            $knowledge = AiKnowledge::findOrFail($id);

            $res = Http::withoutVerifying()->get($knowledge->source_url);

            if ($res->failed()) {
                return response()->json(['status' => false, 'message' => 'Gagal akses website'], 500);
            }

            $html = $res->body();
            $html = preg_replace('#<script(.*?)>(.*?)</script>#is', '', $html);
            $html = preg_replace('#<style(.*?)>(.*?)</style>#is', '', $html);
            $cleanText = preg_replace('/\s+/', ' ', strip_tags($html));

            $knowledge->update(['content' => trim($cleanText)]);

            return response()->json(['status' => true, 'message' => 'Data berhasil diupdate!']);
        } catch (\Exception $e) {
            Log::error("Gagal resync knowledge: " . $e->getMessage());
            return response()->json(['status' => false, 'message' => 'Gagal update'], 500);
        }
    }

    /**
     * 9. KIRIM PESAN MANUAL DARI DASHBOARD
     */
    public function sendMessage(Request $request)
    {
        try {
            $response = Http::withHeaders(['Authorization' => env('FONNTE_TOKEN')])
                ->withoutVerifying()
                ->post('https://api.fonnte.com/send', [
                    'target'  => $request->receiver,
                    'message' => $request->message
                ]);

            if ($response->successful()) {
                $resData = $response->json();
                $fonnteId = is_array($resData['id']) ? $resData['id'][0] : ($resData['id'] ?? null);

                $earlyStatus = Cache::pull('fonnte_status_' . $fonnteId);
                $finalStatus = $earlyStatus ? $earlyStatus : 'sent';

                $chat = Chat::create([
                    'sender'     => $request->receiver,
                    'receiver'   => 'Me',
                    'message'    => $request->message,
                    'is_from_me' => true,
                    'id_fonnte'  => $fonnteId,
                    'status'     => $finalStatus
                ]);

                broadcast(new NewChatEvent($chat));
                return response()->json($chat);
            }

            return response()->json(['error' => 'Server Fonnte menolak request'], 500);
        } catch (\Exception $e) {
            Log::error("Gagal kirim pesan manual: " . $e->getMessage());
            return response()->json(['error' => 'Koneksi ke Fonnte bermasalah'], 500);
        }
    }

    /**
     * 10. UPDATE / RESYNC SEMUA KNOWLEDGE SEKALIGUS
     */
    public function resyncAllKnowledge()
    {
        try {
            $knowledges = AiKnowledge::all();
            $berhasil = 0;

            foreach ($knowledges as $knowledge) {
                try {
                    $res = Http::withoutVerifying()->get($knowledge->source_url);

                    if ($res->successful()) {
                        $html = $res->body();
                        $html = preg_replace('#<script(.*?)>(.*?)</script>#is', '', $html);
                        $html = preg_replace('#<style(.*?)>(.*?)</style>#is', '', $html);
                        $cleanText = preg_replace('/\s+/', ' ', strip_tags($html));

                        $knowledge->update(['content' => trim($cleanText)]);
                        $berhasil++;
                    }
                } catch (\Exception $e) {
                    Log::error("Gagal resync " . $knowledge->source_url . ": " . $e->getMessage());
                }
            }

            return response()->json(['status' => true, 'message' => "Sip! Berhasil update $berhasil data website!"]);
        } catch (\Exception $e) {
            Log::error("Gagal resync massal: " . $e->getMessage());
            return response()->json(['status' => false, 'message' => 'Gagal update semua data'], 500);
        }
    }
}